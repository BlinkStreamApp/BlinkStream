# ==========================================
# BlinkStream — Wrapper de build para Windows (PowerShell)
# ==========================================
# Por que existe:
# En Windows + PowerShell, las env vars seteadas con `$env:X = "y"`
# NO se propagan siempre a procesos hijos (npm, cargo) cuando se
# cruza el boundary de la shell. Esto rompe builds de Tauri que
# dependen de `option_env!()` (e.g. TWITCH_CLIENT_ID, TWITCH_APP_CLIENT_SECRET).
#
# Este wrapper:
# 1. Lee el .env del root y del src-tauri/.
# 2. Setea las env vars en el proceso actual (no en $PROFILE).
# 3. Las exporta al proceso hijo via [Environment]::SetEnvironmentVariable
#    con target=Process (el hijo las hereda de forma fiable).
# 4. Invoca `npm run tauri build` con esas vars ya propagadas.
#
# Uso:
#   .\build-exe.ps1
#
# Si quieres sobrescribir valores en linea:
#   .\build-exe.ps1 -TwitchClientId "otro" -TwitchClientSecret "otro"
# ==========================================

[CmdletBinding()]
param(
    [string]$TwitchClientId = "",
    [string]$TwitchClientSecret = ""
)

$ErrorActionPreference = "Stop"

function Set-TwEnv {
    param([string]$Name, [string]$Value)
    if ($Value -and $Value.Trim().Length -gt 0) {
        [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
        Write-Host "[build-exe] $Name = $($Value.Substring(0, [Math]::Min(8, $Value.Length)))... ($($Value.Length) chars)" -ForegroundColor DarkGray
    }
}

# 1) Parsear .env del root (key=value simple, sin expanding)
$rootEnv = Join-Path $PSScriptRoot ".env"
if (Test-Path -LiteralPath $rootEnv) {
    Write-Host "[build-exe] Leyendo $rootEnv" -ForegroundColor Cyan
    Get-Content -LiteralPath $rootEnv | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line -match '^([A-Z_][A-Z0-9_]*)=(.*)$') {
            $name = $Matches[1]
            $value = $Matches[2].Trim()
            if ($name -like "TWITCH_*") {
                [Environment]::SetEnvironmentVariable($name, $value, "Process")
            }
        }
    }
}

# 2) Parsear src-tauri/.env (mismo formato)
$srcTauriEnv = Join-Path $PSScriptRoot "src-tauri\.env"
if (Test-Path -LiteralPath $srcTauriEnv) {
    Write-Host "[build-exe] Leyendo $srcTauriEnv" -ForegroundColor Cyan
    Get-Content -LiteralPath $srcTauriEnv | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line -match '^([A-Z_][A-Z0-9_]*)=(.*)$') {
            $name = $Matches[1]
            $value = $Matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

# 3) Sobrescribir con parametros CLI si vienen
if ($PSBoundParameters.ContainsKey("TwitchClientId") -and $TwitchClientId) {
    Set-TwEnv "TWITCH_CLIENT_ID" $TwitchClientId
}
if ($PSBoundParameters.ContainsKey("TwitchClientSecret") -and $TwitchClientSecret) {
    Set-TwEnv "TWITCH_APP_CLIENT_SECRET" $TwitchClientSecret
}

# 4) Verificacion previa: avisar si falta algo critico
$missing = @()
foreach ($name in @("TWITCH_CLIENT_ID", "TWITCH_APP_CLIENT_SECRET")) {
    $val = [Environment]::GetEnvironmentVariable($name, "Process")
    if (-not $val -or $val.Trim().Length -eq 0) {
        $missing += $name
    } else {
        Write-Host "[build-exe] OK  $name = $($val.Substring(0, [Math]::Min(8, $val.Length)))..." -ForegroundColor Green
    }
}
if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "[build-exe] ADVERTENCIA: faltan env vars criticas: $($missing -join ', ')" -ForegroundColor Yellow
    Write-Host "[build-exe]   El binario compilara con valores vacios para esas vars." -ForegroundColor Yellow
    Write-Host "[build-exe]   Revisa src-tauri/.env o pasalas como parametro." -ForegroundColor Yellow
    Write-Host ""
}

# 5) Limpiar cache de cargo solo si el operador lo pide
if ($env:BLINKSTREAM_BUILD_CLEAN -eq "1") {
    Write-Host "[build-exe] BLINKSTREAM_BUILD_CLEAN=1 -> ejecutando cargo clean" -ForegroundColor Magenta
    Push-Location (Join-Path $PSScriptRoot "src-tauri")
    try { cargo clean } catch { Write-Host "[build-exe] cargo clean fallo: $_" -ForegroundColor Red }
    Pop-Location
}

# 6) Anti-regresion: bloquear si hay patrones de bugs ya corregidos
Write-Host "[build-exe] Verificando regresiones..." -ForegroundColor Magenta
# Usar la misma PowerShell que corre este wrapper (compatible con PS 5.1).
# Si por alguna razon estamos en pwsh7, este mismo script ya es pwsh7.
& powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\scripts\check-legacy.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[build-exe] BUILD BLOQUEADO por regresion. Usa BLINKSTREAM_SKIP_REGRESSION=1 para forzar." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 7) Invocar tauri build con propagacion explicita
Write-Host ""
Write-Host "[build-exe] Ejecutando: npm run tauri build" -ForegroundColor Cyan
Write-Host ""

& npm run tauri build
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Write-Host "[build-exe] tauri build fallo con codigo $exitCode" -ForegroundColor Red
    exit $exitCode
}

Write-Host ""
Write-Host "[build-exe] Build OK. Binario en: src-tauri\target\release\blinkstream.exe" -ForegroundColor Green
