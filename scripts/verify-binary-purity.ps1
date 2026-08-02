# Verificacion binaria de pureza - rapido con -split y Select-String
$exe = "C:\Users\alber\Desktop\IA Project\BlinkStream\blinkstream\src-tauri\target\release\blinkstream.exe"
if (-not (Test-Path $exe)) { Write-Host "❌ EXE no existe"; exit 1 }

# Convertir a string una sola vez (busqueda en memoria)
$bytes = [System.IO.File]::ReadAllBytes($exe)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)

Write-Host "=== STRINGS VIEJOS (NO deben aparecer) ==="
$oldStrings = @(
    "kimne78kx3ncx6brgo4mv6wki5h1ko",
    "thumbnailURL",
    "period:LAST_WEEK",
    "Math.floor(Math.random() * 1e7)",
    "bs_app_token_cache",
    "APP_TOKEN_CACHE_KEY"
)
$oldTotal = 0
foreach ($s in $oldStrings) {
    $count = ([regex]::Matches($text, [regex]::Escape($s))).Count
    if ($count -gt 0) {
        Write-Host "  ❌ VIEJO ENCONTRADO '$s': $count (debe ser 0)"
        $oldTotal += $count
    } else {
        Write-Host "  ✅ viejo '$s': 0"
    }
}

Write-Host ""
Write-Host "=== STRINGS NUEVOS (deben aparecer) ==="
$newStrings = @(
    "z8bat49d2evj5nkmg5kmkge24sa7z9",
    "thumbnailUrl",
    "startedAt",
    "endedAt"
)
foreach ($s in $newStrings) {
    $count = ([regex]::Matches($text, [regex]::Escape($s))).Count
    Write-Host "  nuevo '$s': $count"
}

Write-Host ""
if ($oldTotal -eq 0) {
    Write-Host "=== ✅ VERIFICACIÓN BINARIA: 0 strings viejos detectados ==="
} else {
    Write-Host "=== ❌ VERIFICACIÓN BINARIA: $oldTotal strings viejos detectados ==="
    exit 1
}
