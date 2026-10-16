$ErrorActionPreference = 'Stop'
if ($env:USERNAME -ne 'WDAGUtilityAccount' -or -not (Test-Path 'C:\BlinkStreamInput\sandbox-only.marker')) { throw 'Guest only' }
$report = @{status='installing WebView2'; scope='guest only'}
$path = 'C:\BlinkStreamReport\webview2.json'
try {
    $installer = 'C:\BlinkStreamInput\MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
    $signature = Get-AuthenticodeSignature $installer
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(^|, )O=Microsoft Corporation(,|$)') { throw 'Invalid Microsoft signature' }
    $report | ConvertTo-Json | Set-Content $path -Encoding UTF8
    $process = Start-Process $installer -ArgumentList '/silent /install' -WindowStyle Hidden -PassThru -Wait
    $report.exitCode = $process.ExitCode
    $report.status = if ($process.ExitCode -eq 0) { 'installed; reopen app to verify runtime availability' } else { 'installation failed' }
} catch { $report.status='failed';$report.error=$_.Exception.Message }
$report | ConvertTo-Json | Set-Content $path -Encoding UTF8
if ($report.status -ne 'installed; reopen app to verify runtime availability') { exit 1 }
