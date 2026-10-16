$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:USERNAME -ne 'WDAGUtilityAccount' -or -not (Test-Path -LiteralPath 'C:\BlinkStreamInput\sandbox-only.marker')) { throw 'Guest-only validation; refusing host execution.' }
$report = @{ status = 'running'; guiProcess = $false; nativeWindow = $false; wackFinished = $false; network = 'disabled' }
$reportPath = 'C:\BlinkStreamReport\validation.json'
function Save-Report { $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8 }
try {
    $identity = Get-Content -Raw 'C:\BlinkStreamInput\identity.json' | ConvertFrom-Json
    $package = Get-AppxPackage -Name $identity.name
    if (-not $package) { throw 'The test package is not installed in Sandbox' }
    $report.packageFamilyName = $package.PackageFamilyName
    $report.webViewRuntimeFolders = @(Get-ChildItem 'C:\Program Files (x86)\Microsoft\EdgeWebView\Application' -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
    $report.streamlinkPresent = $null -ne (Get-Command streamlink.exe -ErrorAction SilentlyContinue)
    $report.ffmpegPresent = $null -ne (Get-Command ffmpeg.exe -ErrorAction SilentlyContinue)
    $env:PYTHONDONTWRITEBYTECODE = '1'
    $runtimePath = Join-Path $package.InstallLocation 'runtime\streamlink'
    $report.bundledStreamlinkVersion = (& (Join-Path $runtimePath 'bin\streamlink.exe') --version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Installed Streamlink failed' }
    $report.bundledFfmpegVersion = (& (Join-Path $runtimePath 'ffmpeg\ffmpeg.exe') -version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Installed FFmpeg failed' }
    Save-Report
    Start-Process explorer.exe -ArgumentList ('shell:AppsFolder\' + $package.PackageFamilyName + '!BlinkStream')
    $app = $null
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        Start-Sleep -Seconds 1
        $app = Get-Process blinkstream -ErrorAction SilentlyContinue | Where-Object { $_.Path -like ($package.InstallLocation + '\*') } | Select-Object -First 1
        if ($app -and $app.MainWindowHandle -ne 0) { break }
    }
    if ($app) {
        $report.guiProcess = $true
        $report.nativeWindow = $app.MainWindowHandle -ne 0
        $report.responsive = $app.Responding
        $report.pid = $app.Id
        Stop-Process -Id $app.Id
    }
    $report.status = 'wack-running'
    Save-Report
    $work = Join-Path $env:TEMP 'BlinkStreamWack'
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    $sdkGuest = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10'
    New-Item -ItemType Directory -Path (Join-Path $sdkGuest 'Testing\Runtimes') -Force | Out-Null
    $taefGuest = Join-Path $sdkGuest 'Testing\Runtimes\TAEF'
    $ackGuest = Join-Path $sdkGuest 'App Certification Kit'
    New-Item -ItemType Directory -Path $taefGuest, $ackGuest -Force | Out-Null
    Copy-Item 'C:\BlinkStreamInput\TAEF\*' $taefGuest -Recurse -Force
    Copy-Item 'C:\BlinkStreamInput\ack\*' $ackGuest -Recurse -Force
    foreach ($registryPath in @('HKLM:\SOFTWARE\Microsoft\Windows Kits\Installed Roots', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows Kits\Installed Roots')) {
        New-Item $registryPath -Force | Out-Null
        New-ItemProperty $registryPath -Name KitsRoot10 -Value ($sdkGuest + '\') -PropertyType String -Force | Out-Null
    }
    $ack = Join-Path $sdkGuest 'App Certification Kit\appcert.exe'
    $wackReport = 'C:\BlinkStreamReport\wack.xml'
    & $ack test -appxpackagepath (Join-Path $env:TEMP 'BlinkStreamMsixTest\BlinkStream-test.msix') -reportoutputpath $wackReport
    $report.wackExitCode = $LASTEXITCODE
    $report.wackFinished = Test-Path -LiteralPath $wackReport
    $report.status = if ($report.wackFinished) { 'report-ready; inspect WACK result, not assumed passed' } else { 'WACK did not produce a report' }
} catch {
    $report.status = 'failed'
    $report.error = $_.Exception.Message
} finally { Save-Report }
