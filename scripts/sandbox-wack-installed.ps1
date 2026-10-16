$ErrorActionPreference = 'Stop'
if ($env:USERNAME -ne 'WDAGUtilityAccount' -or -not (Test-Path 'C:\BlinkStreamInput\sandbox-only.marker')) { throw 'Guest only' }
$report = @{status='running'; network='authorized-enabled'}
$output = 'C:\BlinkStreamReport\wack.xml'
try {
    $identity = Get-Content -Raw C:\BlinkStreamInput\identity.json | ConvertFrom-Json
    $package = Get-AppxPackage -Name $identity.name
    if (-not $package -or $package.PackageFamilyName -ne $identity.packageFamilyName) { throw 'Expected package not installed' }
    try { $report.wmi = (Get-CimInstance Win32_OperatingSystem).Version }
    catch { $report.wmiError = $_.Exception.Message }
    # Sandbox registration is broken; retain the explicit test-fixture boundary.
    $runtime = Get-Content -Raw C:\BlinkStreamReport\webview-context.json | ConvertFrom-Json
    if ($runtime.runtimeVersion -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw 'Invalid diagnostic runtime version' }
    $browserFolder = Join-Path 'C:\Program Files (x86)\Microsoft\EdgeWebView\Application' $runtime.runtimeVersion
    $signature = Get-AuthenticodeSignature (Join-Path $browserFolder 'msedgewebview2.exe')
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(^|, )O=Microsoft Corporation(,|$)') { throw 'Runtime signature invalid' }
    $env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER = $browserFolder
    $report.runtimeMode='explicit signed Evergreen path for Sandbox diagnostics; not normal registration'
    $ack = 'C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe'
    if (-not (Test-Path $ack)) { throw 'Official WACK installation missing' }
    $report | ConvertTo-Json | Set-Content C:\BlinkStreamReport\wack-status.json -Encoding UTF8
    & $ack test -appxpackagepath (Join-Path $env:TEMP 'BlinkStreamMsixTest\BlinkStream-test.msix') -reportoutputpath $output
    $report.exitCode = $LASTEXITCODE
    $report.reportExists = Test-Path $output
    $report.status = if ($report.reportExists) { 'report-ready; inspect results' } else { 'no-report; not passed' }
} catch { $report.status='failed'; $report.error=$_.Exception.Message }
$report | ConvertTo-Json | Set-Content C:\BlinkStreamReport\wack-status.json -Encoding UTF8
if ($report.status -ne 'report-ready; inspect results' -or $report.exitCode -ne 0) { exit 1 }
