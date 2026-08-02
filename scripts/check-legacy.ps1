# ==========================================
# BlinkStream - Anti-regresion pre-build
# Bloquea el build si encuentra strings de bugs ya corregidos.
# Override de emergencia: BLINKSTREAM_SKIP_REGRESSION=1
# Excepciones legitimas por linea: anadir "// ALLOWED-REGRESSION: <razon>"
# en la misma linea del match. Caso tipico: WT-20260628-138 restaura
# kimne78kx3ncx6brgo4mv6wki5h1ko en src/utils/twitch.js porque Twitch
# GQL SOLO acepta ese first-party Client ID.
# ==========================================
[CmdletBinding()] param(
    [string]$RepoRoot = ""
)

# PS 5.1 quirk: resolver RepoRoot fuera del param() para que $PSScriptRoot funcione
if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

$ErrorActionPreference = "Stop"
if ($env:BLINKSTREAM_SKIP_REGRESSION -eq "1") {
    Write-Host "[check-legacy] SKIP forzado por env var" -ForegroundColor Yellow
    exit 0
}

# Patrones. Formato: id|regex|descripcion
$patterns = @(
    @{ id = "math-random-cache";      re = "Math\.floor\(Math\.random\(\)\s*\*\s*1e7\)";  desc = "CWE-330 Math.random en cache-buster" }
    @{ id = "bs_app_token_cache";     re = "bs_app_token_cache|APP_TOKEN_CACHE_KEY";     desc = "Token App Access persistido en localStorage" }
    @{ id = "window-open-tabnab";     re = "window\.open\(";                              desc = "window.open sin noopener,noreferrer" }
    @{ id = "gql-string-interp";      re = 'user\(login:\s*"\$\{|channelName:\s*"\$\{';  desc = "Interpolacion directa en GQL (CWE-94)" }
    @{ id = "invoke-outside-guard";   re = "^\s*invoke\(['""]";                          desc = "invoke() sin guard isTauri()" }
    @{ id = "tw-legacy-mojibake";     re = "[Ã¡Ã©Ã­Ã³ÃºÃ±]";                              desc = "Encoding UTF-8 mal decodificado" }
    @{ id = "legacy-blob-preview";    re = "URL\.createObjectURL";                        desc = "Blob URL en preview live (rompe live streams)" }
    @{ id = "thumbnailURL-mayus";     re = "thumbnailURL";                                desc = "Campo case-incorrecto en GQL" }
    @{ id = "period-LAST_WEEK";       re = "period\s*:\s*\{\s*filter\s*:\s*LAST_WEEK";  desc = "Enum GQL obsoleto (criterio de clips)" }
    @{ id = "kimne78-legacy";         re = "kimne78kx3ncx6brgo4mv6wki5h1ko";            desc = "Client ID first-party de Twitch (LEGITIMO en src/utils/twitch.js con ALLOWED-REGRESSION; bloqueado en otros archivos)" }
)

# Globs a escanear (relativos a RepoRoot, recursivos)
$includeGlobs = @("src\**\*.js", "src\**\*.jsx", "src-tauri\**\*.rs", "supabase\functions\**\index.ts")
$excludeGlobs = @("**\node_modules\**", "**\dist\**", "**\target\**", "**\coverage\**",
                  "**\.mojibake_backup\**", "**\*.test.*", "**\__mocks__\**", "**\audit-*")

# Recolectar archivos (cambiar CWD al RepoRoot para que los wildcards relativos funcionen
# de forma consistente en PS 5.1 entre maquinas con/sin Resolve-Path raro)
$prevCwd = $PWD
try {
    Set-Location -LiteralPath $RepoRoot
    $files = @()
    foreach ($g in $includeGlobs) {
        $found = Get-ChildItem -Path $g -File -ErrorAction SilentlyContinue
        if ($found) { $files += $found }
    }
}
finally {
    Set-Location -LiteralPath $prevCwd
}

$files = $files | Where-Object {
    $rel = $_.FullName.Substring($RepoRoot.Length)
    $excluded = $false
    foreach ($ex in $excludeGlobs) {
        if ($rel -like "*$ex*") { $excluded = $true; break }
    }
    -not $excluded
}

$findings = @()
foreach ($f in $files) {
    $content = Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    foreach ($p in $patterns) {
        $matches = [regex]::Matches($content, $p.re, [System.Text.RegularExpressions.RegexOptions]::Multiline)
        foreach ($m in $matches) {
            $lineNum = ($content.Substring(0, $m.Index) -split "`n").Count
            $lineText = ($content -split "`n")[$lineNum - 1]
            # Permitir si tiene ALLOWED-REGRESSION en la misma linea
            if ($lineText -match "ALLOWED-REGRESSION\s*:") {
                Write-Host "[check-legacy] ALLOW  $($f.Name):$lineNum  [$($p.id)]" -ForegroundColor DarkYellow
                continue
            }
            $snippet = $m.Value.Substring(0, [Math]::Min(80, $m.Value.Length))
            $findings += [PSCustomObject]@{
                File = $f.FullName.Substring($RepoRoot.Length+1)
                Line = $lineNum
                Id = $p.id
                Desc = $p.desc
                Snip = $snippet
            }
        }
    }
}

if ($findings.Count -gt 0) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host "  [check-legacy] REGRESIONES DETECTADAS - BUILD BLOQUEADO" -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red
    foreach ($f in $findings) {
        Write-Host "  - $($f.File):$($f.Line)  [$($f.Id)]" -ForegroundColor Red
        Write-Host "      $($f.Desc)" -ForegroundColor Gray
        Write-Host "      match: $($f.Snip)" -ForegroundColor DarkGray
    }
    Write-Host ""
    Write-Host "  Falso positivo? Anade en la linea:  // ALLOWED-REGRESSION: <razon>" -ForegroundColor Yellow
    Write-Host "  Emergencia?  set BLINKSTREAM_SKIP_REGRESSION=1 && npm run build" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "[check-legacy] OK (0 regresiones, $($files.Count) archivos escaneados)" -ForegroundColor Green
exit 0
