$ErrorActionPreference = 'Stop'
if ($env:USERNAME -ne 'WDAGUtilityAccount' -or -not (Test-Path 'C:\BlinkStreamInput\sandbox-only.marker')) { throw 'Guest only' }
$report = @{scope='diagnostic guest process only'; workaround='explicit installed Evergreen folder; does not prove normal runtime registration'}
try {
    $identity = Get-Content -Raw C:\BlinkStreamInput\identity.json | ConvertFrom-Json
    $package = Get-AppxPackage -Name $identity.name
    $folders = Get-ChildItem 'C:\Program Files (x86)\Microsoft\EdgeWebView\Application' -Directory | Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } | Sort-Object { [version]$_.Name } -Descending
    $runtime = $null
    foreach ($folder in $folders) {
        $executable = Join-Path $folder.FullName 'msedgewebview2.exe'
        if (-not (Test-Path $executable)) { continue }
        $signature = Get-AuthenticodeSignature $executable
        if ($signature.Status -eq 'Valid' -and $signature.SignerCertificate.Subject -match '(^|, )O=Microsoft Corporation(,|$)') { $runtime=$folder; break }
    }
    if (-not $runtime) { throw 'No signed installed Evergreen runtime found' }
    Get-Process blinkstream -ErrorAction SilentlyContinue | Where-Object { $_.Path -like ($package.InstallLocation + '\*') } | Stop-Process
    $report.runtimeVersion = $runtime.Name
    $arguments = '/d /s /c "set "WEBVIEW2_BROWSER_EXECUTABLE_FOLDER=' + $runtime.FullName + '"&& "' + (Join-Path $package.InstallLocation 'blinkstream.exe') + '""'
    Invoke-CommandInDesktopPackage -PackageFamilyName $identity.packageFamilyName -AppId BlinkStream -Command C:\Windows\System32\cmd.exe -Args $arguments -PreventBreakaway
    Start-Sleep -Seconds 30
    $report.processes = @(Get-Process blinkstream,msedgewebview2 -ErrorAction SilentlyContinue | Select-Object Name,Id,MainWindowHandle,Responding)
    $report.status='launched; inspect UI and test manually, not assumed passed'
} catch { $report.status='failed';$report.error=$_.Exception.Message }
$report | ConvertTo-Json -Depth 4 | Set-Content C:\BlinkStreamReport\webview-context.json -Encoding UTF8
