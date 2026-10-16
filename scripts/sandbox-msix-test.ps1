$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Fail closed if someone double-clicks this on the host Windows installation.
if ($env:USERNAME -ne 'WDAGUtilityAccount' -or -not (Test-Path -LiteralPath 'C:\BlinkStreamInput\sandbox-only.marker')) {
    throw 'This script is only for Windows Sandbox; no host certificates or apps were changed.'
}
$report = @{ installed = $false; signatureVerified = $false; environment = 'Windows Sandbox'; network = 'disabled'; appLaunched = $false }
$reportPath = 'C:\BlinkStreamReport\result.json'
try {
    $report.network = (Get-Content -Raw 'C:\BlinkStreamInput\test-config.json' | ConvertFrom-Json).network
    $identity = Get-Content -Raw 'C:\BlinkStreamInput\identity.json' | ConvertFrom-Json
    $candidate = Get-Content -Raw 'C:\BlinkStreamInput\candidate.json' | ConvertFrom-Json
    $sha = [Security.Cryptography.SHA256]::Create()
    $inputStream = [IO.File]::OpenRead('C:\BlinkStreamInput\candidate.msix')
    try { $inputHash = ([BitConverter]::ToString($sha.ComputeHash($inputStream))).Replace('-', '') }
    finally { $inputStream.Dispose(); $sha.Dispose() }
    if ($inputHash -ne $candidate.sha256) { throw 'Guest candidate hash mismatch before signing' }
    $report.sourceSha256 = $inputHash
    $previous = Get-AppxPackage -Name $identity.name
    if ($previous) {
        if ($previous.PackageFamilyName -ne $identity.packageFamilyName) { throw 'Unexpected existing guest identity' }
        Get-Process blinkstream -ErrorAction SilentlyContinue | Where-Object { $_.Path -like ($previous.InstallLocation + '\*') } | Stop-Process
        Remove-AppxPackage -Package $previous.PackageFullName
    }
    $work = Join-Path $env:TEMP 'BlinkStreamMsixTest'
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    $package = Join-Path $work 'BlinkStream-test.msix'
    Copy-Item 'C:\BlinkStreamInput\candidate.msix' $package
    $certificate = New-SelfSignedCertificate -Type Custom -Subject $identity.publisher -KeyUsage DigitalSignature -KeyAlgorithm RSA -KeyLength 2048 -KeyExportPolicy NonExportable -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddDays(7) -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
    $publicCertificate = Join-Path $work 'sandbox-public.cer'
    Export-Certificate -Cert $certificate -FilePath $publicCertificate | Out-Null
    Import-Certificate -FilePath $publicCertificate -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
    & 'C:\BlinkStreamInput\signtool.exe' sign /fd SHA256 /sha1 $certificate.Thumbprint /s My $package
    if ($LASTEXITCODE -ne 0) { throw 'Sandbox signing failed' }
    & 'C:\BlinkStreamInput\signtool.exe' verify /pa $package
    if ($LASTEXITCODE -ne 0) { throw 'Sandbox signature verification failed' }
    $report.signatureVerified = $true
    Add-AppxPackage -Path $package
    $installedPackage = Get-AppxPackage -Name $identity.name
    if (-not $installedPackage -or $installedPackage.PackageFamilyName -ne $identity.packageFamilyName) { throw 'Installed identity does not match Partner Center' }
    $report.installed = $true
    $report.version = $installedPackage.Version.ToString()
    $report.packageFamilyName = $installedPackage.PackageFamilyName
    $report.status = 'Installation passed; GUI/online/dependency tests and WACK still pending'
    Write-Host 'Package installed only in Windows Sandbox. No app launched. Close Sandbox to discard the app and temporary certificate.' -ForegroundColor Green
} catch {
    $report.status = 'failed'
    $report.error = $_.Exception.Message
    Write-Host $report.error -ForegroundColor Red
} finally {
    $report | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8
}
if (-not $report.installed -or -not $report.signatureVerified) { exit 1 }
