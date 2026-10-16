param([string]$SdkVersion = '10.0.26100.0')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Get-MsixDigest([string]$Path) {
    $digest = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { return ([BitConverter]::ToString($digest.ComputeHash($stream))).Replace('-', '') }
    finally { $stream.Dispose(); $digest.Dispose() }
}
if ($SdkVersion -notmatch '^10\.0\.\d+\.0$') { throw 'Invalid Windows SDK version' }
$msixRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$msixOutputDir = Join-Path $msixRoot 'src-tauri\target\msix'
$msixStage = Join-Path $msixOutputDir ('build-' + [guid]::NewGuid().ToString('N'))
$makeAppx = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin\$SdkVersion\x64\makeappx.exe"
$makePri = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin\$SdkVersion\x64\makepri.exe"
if (-not (Test-Path -LiteralPath $makeAppx -PathType Leaf)) { throw 'Windows SDK MakeAppx not found' }
if (-not (Test-Path -LiteralPath $makePri -PathType Leaf)) { throw 'Windows SDK MakePRI not found' }
$priorChannel = $env:VITE_DISTRIBUTION_CHANNEL
Push-Location $msixRoot
try {
    New-Item -ItemType Directory -Path $msixStage -Force | Out-Null
    & node scripts/msix.mjs $msixStage
    if ($LASTEXITCODE -ne 0) { throw 'MSIX preparation failed' }
    & (Join-Path $PSScriptRoot 'prepare-msix-icons.ps1') -Source (Join-Path $msixRoot 'src\assets\app-icon.png') -Plan (Join-Path $msixStage 'icon-assets.json') -Destination (Join-Path $msixStage 'Package\Assets')
    & $makePri new /pr (Join-Path $msixStage 'Package') /cf (Join-Path $msixStage 'priconfig.xml') /mn (Join-Path $msixStage 'Package\AppxManifest.xml') /of (Join-Path $msixStage 'Package\resources.pri') /o *> (Join-Path $msixOutputDir 'makepri.log')
    if ($LASTEXITCODE -ne 0) { throw 'MakePRI resource indexing failed' }
    & (Join-Path $PSScriptRoot 'prepare-msix-runtime.ps1') -PackageDirectory (Join-Path $msixStage 'Package')
    $env:VITE_DISTRIBUTION_CHANNEL = 'microsoft-store'
    & pnpm tauri build --no-bundle --features microsoft-store --config (Join-Path $msixStage 'tauri.store.json')
    if ($LASTEXITCODE -ne 0) { throw 'Store build failed; no package produced' }
    $msixPackageDir = Join-Path $msixStage 'Package'
    Copy-Item -LiteralPath (Join-Path $msixRoot 'src-tauri\target\release\blinkstream.exe') -Destination (Join-Path $msixPackageDir 'blinkstream.exe')
    $metadata = Get-Content -Raw -LiteralPath (Join-Path $msixStage 'candidate.json') | ConvertFrom-Json
    $msixFile = Join-Path $msixOutputDir "BlinkStream_$($metadata.version)_x64.msix"
    & $makeAppx pack /d $msixPackageDir /p $msixFile /o *> (Join-Path $msixOutputDir 'pack.log')
    if ($LASTEXITCODE -ne 0) { throw 'MakeAppx validation/pack failed' }
    $verification = Join-Path $msixStage 'Verification'
    & $makeAppx unpack /p $msixFile /d $verification *> (Join-Path $msixOutputDir 'unpack.log')
    if ($LASTEXITCODE -ne 0) { throw 'MSIX unpack verification failed' }
    if ((Get-MsixDigest (Join-Path $verification 'blinkstream.exe')) -ne (Get-MsixDigest (Join-Path $msixPackageDir 'blinkstream.exe'))) { throw 'Packaged executable hash mismatch' }
    if ((Get-Content -Raw (Join-Path $verification 'AppxManifest.xml')) -ne (Get-Content -Raw (Join-Path $msixPackageDir 'AppxManifest.xml'))) { throw 'Packaged manifest mismatch' }
    foreach ($asset in (Get-Content -Raw (Join-Path $msixStage 'icon-assets.json') | ConvertFrom-Json)) {
        if ((Get-MsixDigest (Join-Path $verification "Assets\$($asset.name)")) -ne (Get-MsixDigest (Join-Path $msixPackageDir "Assets\$($asset.name)"))) { throw "Packaged icon mismatch: $($asset.name)" }
    }
    if ((Get-MsixDigest (Join-Path $verification 'resources.pri')) -ne (Get-MsixDigest (Join-Path $msixPackageDir 'resources.pri'))) { throw 'Packaged PRI mismatch' }
    & $makePri dump /if (Join-Path $verification 'resources.pri') /of (Join-Path $msixOutputDir 'resources.xml') /dt detailed /o *> (Join-Path $msixOutputDir 'makepri-dump.log')
    if ($LASTEXITCODE -ne 0) { throw 'Packaged PRI dump failed' }
    $resourceDump = Get-Content -Raw (Join-Path $msixOutputDir 'resources.xml')
    if (-not $resourceDump.Contains('/Files/Assets/Square44x44Logo.png')) { throw 'PRI resource path does not match manifest Assets path' }
    foreach ($asset in (Get-Content -Raw (Join-Path $msixStage 'icon-assets.json') | ConvertFrom-Json)) {
        if (-not $resourceDump.Contains($asset.name)) { throw "Icon missing from PRI: $($asset.name)" }
    }
    foreach ($relative in @('runtime\streamlink\bin\streamlink.exe', 'runtime\streamlink\ffmpeg\ffmpeg.exe', 'runtime\streamlink\Python\python314.dll')) {
        if ((Get-MsixDigest (Join-Path $verification $relative)) -ne (Get-MsixDigest (Join-Path $msixPackageDir $relative))) { throw "Packaged runtime hash mismatch: $relative" }
    }
    $msixHash = Get-MsixDigest $msixFile
    $metadata | Add-Member -NotePropertyName sha256 -NotePropertyValue $msixHash
    $metadata | Add-Member -NotePropertyName bytes -NotePropertyValue (Get-Item $msixFile).Length
    $metadata | Add-Member -NotePropertyName runtime -NotePropertyValue (Get-Content -Raw (Join-Path $msixRoot 'src-tauri\msix\runtime.json') | ConvertFrom-Json)
    $metadata | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $msixOutputDir 'candidate.json') -Encoding UTF8
    Write-Host "SHA256: $msixHash"
    Write-Host 'Unsigned Store candidate generated. Not installed, signed, uploaded or certified.'
} finally {
    $env:VITE_DISTRIBUTION_CHANNEL = $priorChannel
    Pop-Location
    $resolvedStage = [IO.Path]::GetFullPath($msixStage)
    if ($resolvedStage.StartsWith([IO.Path]::GetFullPath($msixOutputDir) + '\') -and (Split-Path $resolvedStage -Leaf) -match '^build-[a-f0-9]{32}$' -and (Test-Path -LiteralPath $resolvedStage)) {
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
}
