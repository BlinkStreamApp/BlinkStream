$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\src-tauri\target\msix\python-copyleft-sources'))
New-Item -ItemType Directory -Path $sourceRoot -Force | Out-Null
$inputs = @(
    @{file='pycountry-26.2.16.tar.gz'; bytes=7711342; sha256='5b6027d453fcd6060112b951dd010f01f168b51b4bf8a1f1fc8c95c8d94a0801'; url='https://files.pythonhosted.org/packages/de/1d/061b9e7a48b85cfd69f33c33d2ef784a531c359399ad764243399673c8f5/pycountry-26.2.16.tar.gz'},
    @{file='certifi-2026.7.22.tar.gz'; bytes=138112; sha256='741e2c3b351ddf169a738da9f2c048608ff7f2c5cc02f1ebc6b118bb090d5d55'; url='https://files.pythonhosted.org/packages/a3/c2/24167ea9858356b47a87a50d39908bfdb72ceeefe0041586e704e5376b3a/certifi-2026.7.22.tar.gz'},
    @{file='iso-codes_4.20.1.orig.tar.xz'; bytes=4702640; sha256='5d551f3ddb32548c4321e9011720fd97751af0107592f79ebffc939bd32f2268'; url='https://deb.debian.org/debian/pool/main/i/iso-codes/iso-codes_4.20.1.orig.tar.xz'},
    @{file='generate.py'; bytes=2027; sha256='ab8dd1654ce34561f68ba407aa0f0844f2047e021f6d3b6c7d404d8f8ad601d9'; url='https://raw.githubusercontent.com/pycountry/pycountry/4ba3951667c2ed98363a3640c9022cf1b7a59300/generate.py'}
)
function Source-Digest([IO.Stream]$Stream) {
    $digest = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($digest.ComputeHash($Stream))).Replace('-', '').ToLowerInvariant() }
    finally { $digest.Dispose() }
}
foreach ($item in $inputs) {
    $file = Join-Path $sourceRoot $item.file
    if (-not (Test-Path -LiteralPath $file)) {
        & curl.exe --fail --location --proto '=https' --proto-redir '=https' --output $file $item.url
        if ($LASTEXITCODE -ne 0) { throw "Source download failed: $($item.file)" }
    }
    $stream = [IO.File]::OpenRead($file)
    try { if ((Source-Digest $stream) -ne $item.sha256 -or $stream.Length -ne $item.bytes) { throw "Source mismatch: $($item.file)" } }
    finally { $stream.Dispose() }
}
$inventory = Join-Path $sourceRoot 'source-inventory.json'
$inputs | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $inventory -Encoding UTF8
$output = Join-Path ([IO.Path]::GetDirectoryName($sourceRoot)) 'BlinkStream-1.5.0-python-copyleft-sources.zip'
if (-not (Test-Path -LiteralPath $output)) {
    $archive = [IO.Compression.ZipFile]::Open($output, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($item in $inputs) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $sourceRoot $item.file), $item.file, [IO.Compression.CompressionLevel]::NoCompression) | Out-Null }
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $inventory, 'source-inventory.json', [IO.Compression.CompressionLevel]::NoCompression) | Out-Null
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $PSScriptRoot '..\docs\guides\MSIX_PYTHON_SOURCES.md'), 'SOURCES_AND_BUILDING.md', [IO.Compression.CompressionLevel]::NoCompression) | Out-Null
    } finally { $archive.Dispose() }
}
# Reuse existing archives only after checking all pinned payloads; never overwrite them.
$archive = [IO.Compression.ZipFile]::OpenRead($output)
try {
    foreach ($item in $inputs) {
        $entry = $archive.GetEntry($item.file)
        if (-not $entry -or $entry.Length -ne $item.bytes) { throw "Packaged source missing or wrong size: $($item.file)" }
        $stream = $entry.Open()
        try { if ((Source-Digest $stream) -ne $item.sha256) { throw "Packaged source hash mismatch: $($item.file)" } }
        finally { $stream.Dispose() }
    }
    if (-not $archive.GetEntry('SOURCES_AND_BUILDING.md') -or -not $archive.GetEntry('source-inventory.json')) { throw 'Source/build documentation missing' }
} finally { $archive.Dispose() }
$stream = [IO.File]::OpenRead($output)
try { Write-Output "SHA256: $(Source-Digest $stream)"; Write-Output "Bytes: $($stream.Length)" }
finally { $stream.Dispose() }
Write-Output "Source supplement verified: $output"
