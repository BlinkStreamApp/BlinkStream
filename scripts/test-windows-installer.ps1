param([Parameter(Mandatory = $true)][string]$Installer)
$ErrorActionPreference = 'Stop'

# Never run installer smoke tests on a developer/user workstation.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or -not $env:RUNNER_TEMP) {
    throw 'Installer smoke test requires a disposable GitHub Windows runner'
}
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$config = Get-Content src-tauri/tauri.conf.json -Raw | ConvertFrom-Json
$env:BLINKSTREAM_SMOKE_INSTALLER = $installerPath
try {
    node --input-type=module -e '
      import {readFileSync} from "node:fs";
      import {verifyUpdaterArtifact} from "./scripts/build-updater-manifest.mjs";
      const p = process.env.BLINKSTREAM_SMOKE_INSTALLER;
      const c = JSON.parse(readFileSync("src-tauri/tauri.conf.json"));
      verifyUpdaterArtifact(readFileSync(p), readFileSync(p + ".sig", "utf8"), c.plugins.updater.pubkey);
    '
    if ($LASTEXITCODE -ne 0) { throw 'Installer signature verification failed' }
} finally { Remove-Item Env:BLINKSTREAM_SMOKE_INSTALLER }

$runnerRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\') + '\'
$installRoot = [IO.Path]::GetFullPath((Join-Path $runnerRoot ('blinkstream-smoke-' + [guid]::NewGuid())))
if (-not $installRoot.StartsWith($runnerRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Invalid installer smoke path'
}
New-Item -ItemType Directory -Path $installRoot | Out-Null
function Invoke-CheckedInstaller([string[]]$InstallerArguments) {
    $process = Start-Process -FilePath $installerPath -ArgumentList $InstallerArguments -PassThru -WindowStyle Hidden
    if (-not $process.WaitForExit(180000)) {
        Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
        throw 'Installer timed out'
    }
    if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
}
function Assert-InstalledVersion {
    $binary = Join-Path $installRoot 'blinkstream.exe'
    if (-not (Test-Path -LiteralPath $binary)) { throw 'Installed application is missing' }
    $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($binary).ProductVersion
    if ($version -notlike "$($config.version)*") { throw "Unexpected installed version: $version" }
    return (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash
}

# NSIS requires /D last; its value must not be quoted even when it contains spaces.
Invoke-CheckedInstaller -InstallerArguments @('/S', "/D=$installRoot")
$installedHash = Assert-InstalledVersion
# Tauri passive updater uses /P /R /UPDATE. /R restarts the app on the isolated runner.
Invoke-CheckedInstaller -InstallerArguments @('/P', '/R', '/UPDATE', "/D=$installRoot")
if ((Assert-InstalledVersion) -ne $installedHash) { throw 'Reinstall changed the packaged application bytes' }

# Stop only the smoke installation, never another application with the same name.
Get-Process -Name blinkstream -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -eq (Join-Path $installRoot 'blinkstream.exe')
} | Stop-Process
Write-Host "Verified signed NSIS install and passive updater-mode reinstall: $($config.version)"
Write-Host 'This is not a historical 1.4.1 trust-migration or GUI end-to-end test.'
