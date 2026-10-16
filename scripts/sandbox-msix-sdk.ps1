$ErrorActionPreference = 'Stop'
if ($env:USERNAME -ne 'WDAGUtilityAccount' -or -not (Test-Path 'C:\BlinkStreamInput\sandbox-only.marker')) { throw 'Guest only' }
$report = @{status='installing SDK'; network='authorized-enabled'}
$path = 'C:\BlinkStreamReport\sdk.json'
try {
    $installer = 'C:\BlinkStreamInput\winsdksetup.exe'
    $signature = Get-AuthenticodeSignature -FilePath $installer
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(^|, )O=Microsoft Corporation(,|$)') { throw 'Microsoft SDK installer signature invalid' }
    $report | ConvertTo-Json | Set-Content $path -Encoding UTF8
    $process = Start-Process $installer -ArgumentList '/quiet /norestart /ceip off /features OptionId.WindowsSoftwareLogoToolkit' -WindowStyle Hidden -PassThru -Wait
    $report.exitCode = $process.ExitCode
    $report.appcert = Test-Path 'C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe'
    $report.status = if ($process.ExitCode -eq 0 -and $report.appcert) { 'SDK installed inside guest' } else { 'SDK installation failed or requires attention' }
} catch { $report.status='failed'; $report.error=$_.Exception.Message }
$report | ConvertTo-Json | Set-Content $path -Encoding UTF8
if ($report.status -ne 'SDK installed inside guest') { exit 1 }
