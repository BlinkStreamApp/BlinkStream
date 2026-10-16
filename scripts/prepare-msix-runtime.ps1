param([Parameter(Mandatory = $true)][string]$PackageDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pin = Get-Content -Raw (Join-Path $runtimeRoot 'src-tauri\msix\runtime.json') | ConvertFrom-Json
$cache = Join-Path $runtimeRoot 'src-tauri\target\msix\runtime'
New-Item -ItemType Directory -Path $cache -Force | Out-Null
$archive = Join-Path $cache ('streamlink-' + $pin.tag + '.zip')
if (-not (Test-Path -LiteralPath $archive)) {
    & curl.exe --fail --location --proto '=https' --proto-redir '=https' --output $archive $pin.url
    if ($LASTEXITCODE -ne 0) { throw 'Official runtime download failed' }
}
$digest = [Security.Cryptography.SHA256]::Create()
$stream = [IO.File]::OpenRead($archive)
try { $actual = ([BitConverter]::ToString($digest.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
finally { $stream.Dispose(); $digest.Dispose() }
if ($actual -ne $pin.sha256) { throw 'Runtime SHA256 mismatch; refusing extraction' }
$packageRoot = [IO.Path]::GetFullPath($PackageDirectory)
$allowedRoot = [IO.Path]::GetFullPath((Join-Path $runtimeRoot 'src-tauri\target\msix')) + '\'
if (-not $packageRoot.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Staging must be within target/msix' }
$destination = Join-Path $packageRoot 'runtime\streamlink'
if (Test-Path -LiteralPath $destination) { throw 'Runtime staging already exists' }
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
    $total = 0L
    $names = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName
        if (-not $name.StartsWith($pin.prefix, [StringComparison]::Ordinal)) { throw 'Unexpected ZIP prefix' }
        $relative = $name.Substring($pin.prefix.Length)
        if (-not $relative) { continue }
        if ($relative -match '(^/|\\|:|(^|/)\.\.?(/|$))' -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw 'Unsafe ZIP entry' }
        if (-not $names.Add($relative.TrimEnd('/'))) { throw 'Duplicate ZIP entry' }
        $target = [IO.Path]::GetFullPath((Join-Path $destination $relative))
        if (-not $target.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'ZIP path escapes destination' }
        $total += $entry.Length
        if ($total -gt 536870912 -or $zip.Entries.Count -gt 10000) { throw 'Runtime extraction size limit' }
    }
    foreach ($entry in $zip.Entries) {
        $relative = $entry.FullName.Substring($pin.prefix.Length)
        if (-not $relative) { continue }
        $target = Join-Path $destination $relative
        if ($relative.EndsWith('/')) { New-Item -ItemType Directory -Path $target -Force | Out-Null; continue }
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
    }
} finally { $zip.Dispose() }
foreach ($required in @('bin\streamlink.exe', 'ffmpeg\ffmpeg.exe', 'Python\python.exe', 'LICENSE.txt', 'Python\LICENSE.txt', 'ffmpeg\LICENSE.txt', 'ffmpeg\BUILDINFO.txt')) {
    if (-not (Test-Path -LiteralPath (Join-Path $destination $required) -PathType Leaf)) { throw "Missing runtime file: $required" }
}
Copy-Item -LiteralPath (Join-Path $runtimeRoot 'src-tauri\msix\runtime.json') -Destination (Join-Path $destination 'PROVENANCE.json')
Write-Host "Verified portable runtime staged with original licenses ($total bytes)."
