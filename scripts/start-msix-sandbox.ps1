param([switch]$Network)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Starts an isolated guest; never creates host certificates or installs the host app.
$sandboxRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sandboxCli = (Get-Command wsb.exe -ErrorAction Stop).Source
Push-Location $sandboxRoot
try {
    $arguments = @('scripts/prepare-msix-sandbox.mjs')
    if ($Network) { $arguments += '--network' }
    $paths = & node @arguments | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Sandbox test preparation failed' }
    $config = Get-Content -Raw -LiteralPath $paths.config
    $instance = & $sandboxCli start --config $config --raw | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $instance.Id) { throw 'Sandbox did not start' }
    & $sandboxCli connect --id $instance.Id --raw
    if ($LASTEXITCODE -ne 0) { throw 'Sandbox started, but its desktop connection failed' }
    Write-Host "Sandbox ID: $($instance.Id)"
    Write-Host "Guest report: $($paths.report)"
    Write-Host 'Certificates and app are installed only inside Sandbox. Close it to discard them.'
} finally { Pop-Location }
