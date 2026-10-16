$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\src-tauri\target\msix\sources'))
New-Item -ItemType Directory -Path $sourceRoot -Force | Out-Null
$archives = @(
    @{name='ffmpeg-source.tar.gz'; repo='FFmpeg/FFmpeg'; ref='9d4ca21220bfd3f06fc8bfc90ddf0f6d0a484611'; hash='693b19b88c741aa9e02566a40c9c090ca64f808aefdd7fcbff8e5d8cc42db04f'},
    @{name='ffmpeg-build-scripts.tar.gz'; repo='streamlink/FFmpeg-Builds'; ref='7def83d2a56f837b9dbb4b46e0d8b4617fa44cca'; hash='0e3eec2eef690a403d3e9505e716b309c8edbbc878dbbd4efaaa1be4a1a35645'},
    @{name='python-source.tar.gz'; repo='python/cpython'; ref='8e6e75d9102e39bed2a2b279203a396741180f12'; hash='dbcedce4cabe37f3c011f618cc5814f1886e4270f40cbe668e45f35f3251b10a'},
    @{name='streamlink-source.tar.gz'; repo='streamlink/streamlink'; ref='f33007410e7a2b5717a095a23b4978f774a1493a'; hash='263c1b9cd5f2e59d737138fbfc87e15370793b358d94e63584cf7d72260bcd08'},
    @{name='portable-build-scripts.tar.gz'; repo='streamlink/windows-builds'; ref='8.6.2-1'; hash='2d00bfafb1e6c28cc924fff7fce88bece5a0d98e2abcda1ba3970cc12e368438'}
)
$inventory = @()
foreach ($item in $archives) {
    $url = "https://codeload.github.com/$($item.repo)/tar.gz/$($item.ref)"
    $target = Join-Path $sourceRoot $item.name
    if (-not (Test-Path -LiteralPath $target)) {
        & curl.exe --fail --location --proto '=https' --proto-redir '=https' --output $target $url
        if ($LASTEXITCODE -ne 0) { throw "Source download failed: $($item.name)" }
    }
    $digest = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($target)
    try { $hash = ([BitConverter]::ToString($digest.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $digest.Dispose() }
    if ($hash -ne $item.hash) { throw "Pinned source hash mismatch: $($item.name)" }
    $inventory += @{file=$item.name; url=$url; sha256=$hash; bytes=(Get-Item $target).Length}
}
# Upstream's exact build run retains the download cache with dependency sources.
# Download only; never execute upstream build scripts on the user's machine.
$cacheDir = Join-Path $sourceRoot 'ffmpeg-dependencies'
$cache = Join-Path $cacheDir 'cache.tar.gz'
if (-not (Test-Path -LiteralPath $cache)) {
    & gh run download 32120843650 --repo streamlink/FFmpeg-Builds --name download-cache --dir $cacheDir
    if ($LASTEXITCODE -ne 0) { throw 'Dependency source cache unavailable; release remains blocked' }
}
$digest = [Security.Cryptography.SHA256]::Create()
$stream = [IO.File]::OpenRead($cache)
try { $cacheHash = ([BitConverter]::ToString($digest.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
finally { $stream.Dispose(); $digest.Dispose() }
if ($cacheHash -ne 'c8b882ef9e05746c69a35557fa1d18ae682f7b9efe9aa163f64f232e68d20c78') { throw 'Pinned dependency source cache hash mismatch' }
$entries = @(& tar.exe -tzf $cache)
if ($LASTEXITCODE -ne 0 -or $entries.Count -lt 50) { throw 'Dependency cache is incomplete or corrupt' }
$inventory += @{file='ffmpeg-dependencies/cache.tar.gz'; sha256=$cacheHash; bytes=(Get-Item $cache).Length; entries=$entries.Count; artifactId=9318578030; run=32120843650; buildCommit='7def83d2a56f837b9dbb4b46e0d8b4617fa44cca'}
$inventory | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $sourceRoot 'source-inventory.json') -Encoding UTF8
Write-Host 'Sources downloaded. Inventory and complete dependency/build correspondence must be reviewed before distribution.'
