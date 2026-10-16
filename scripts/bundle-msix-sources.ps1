$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$bundleRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\src-tauri\target\msix'))
$sources = Join-Path $bundleRoot 'sources'
$inventoryFile = Join-Path $sources 'source-inventory.json'
$inventory = Get-Content -Raw $inventoryFile | ConvertFrom-Json
$output = Join-Path $bundleRoot 'BlinkStream-1.5.0-runtime-sources.zip'
$temporary = Join-Path $bundleRoot ('sources-' + [guid]::NewGuid().ToString('N') + '.zip')
function Source-Digest([string]$Path) {
    $hash = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { return ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $hash.Dispose() }
}
try {
    $zip = [IO.Compression.ZipFile]::Open($temporary, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($item in $inventory) {
            if ($item.file -notmatch '^[a-z0-9/-]+\.(tar\.gz|tar\.xz)$' -or $item.file.Contains('..')) { throw 'Unsafe source inventory path' }
            $path = Join-Path $sources $item.file
            if ((Source-Digest $path) -ne $item.sha256 -or (Get-Item $path).Length -ne $item.bytes) { throw "Source inventory mismatch: $($item.file)" }
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $path, $item.file, [IO.Compression.CompressionLevel]::NoCompression) | Out-Null
        }
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $inventoryFile, 'source-inventory.json') | Out-Null
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $PSScriptRoot '..\docs\guides\MSIX_RUNTIME_SOURCES.md'), 'PREPARATION_AND_REVIEW.md') | Out-Null
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $PSScriptRoot '..\src-tauri\msix\THIRD_PARTY.txt'), 'THIRD_PARTY.txt') | Out-Null
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $PSScriptRoot '..\docs\guides\MSIX_BUILDING_RUNTIME.md'), 'BUILDING_RUNTIME.md') | Out-Null
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $PSScriptRoot '..\src-tauri\msix\FFMPEG_CONFIGURATION.txt'), 'FFMPEG_CONFIGURATION.txt') | Out-Null
    } finally { $zip.Dispose() }
    if ((Get-Item $temporary).Length -ge 2147483648) { throw 'Source bundle exceeds GitHub per-asset 2 GiB limit' }
    Move-Item -LiteralPath $temporary -Destination $output -Force
    Write-Host "Source bundle: $output"
    Write-Host "SHA256: $(Source-Digest $output)"
    Write-Host 'Prepared locally only; completeness/build instructions and publication remain release gates.'
} finally {
    if (Test-Path -LiteralPath $temporary -PathType Leaf) { Remove-Item -LiteralPath $temporary -Force }
}
