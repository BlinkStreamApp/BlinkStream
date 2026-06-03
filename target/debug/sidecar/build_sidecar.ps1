<#
.SYNOPSIS
    Builds the CTranslate2 sidecar binary (ct2-server.exe) for BlinkStream.

.DESCRIPTION
    This script compiles ct2_server.cpp into a Windows executable using
    CMake + MSVC and vcpkg for dependency management.

    Prerequisites:
      1. Visual Studio 2019+ with "Desktop development with C++" workload
      2. CMake ≥ 3.16 (install: winget install Kitware.CMake)
      3. vcpkg (install: git clone https://github.com/Microsoft/vcpkg.git; .\bootstrap-vcpkg.bat)
      4. git

    Usage:
      .\build_sidecar.ps1                           # Build with defaults
      .\build_sidecar.ps1 -VcpkgDir "C:\vcpkg"      # Custom vcpkg path
      .\build_sidecar.ps1 -UseCUDA $true            # Enable CUDA GPU acceleration
      .\build_sidecar.ps1 -SkipVcpkg $true          # Use already-installed deps

.PARAMETER VcpkgDir
    Path to vcpkg installation directory. Default: ..\..\vcpkg (relative to script)

.PARAMETER BuildType
    Build configuration: Release (default) or Debug

.PARAMETER UseCUDA
    Enable CUDA GPU acceleration for CTranslate2. Default: $false

.PARAMETER SkipVcpkg
    Skip vcpkg dependency installation. Default: $false

.PARAMETER NoBuild
    Only install dependencies, don't build. Default: $false

.EXAMPLE
    .\build_sidecar.ps1
    Builds ct2-server.exe in Release mode with CPU support.

.EXAMPLE
    .\build_sidecar.ps1 -UseCUDA $true -BuildType Debug
    Builds with CUDA GPU support in Debug configuration.
#>

param(
    [string]$VcpkgDir = "",
    [ValidateSet("Release", "Debug")]
    [string]$BuildType = "Release",
    [switch]$UseCUDA = $false,
    [switch]$SkipVcpkg = $false,
    [switch]$NoBuild = $false
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $PSCommandPath
$ProjectRoot = Resolve-Path "$ScriptDir/.."

# ─── 1. Detectar vcpkg ─────────────────────────────────────
if (-not $VcpkgDir) {
    # Buscar vcpkg en ubicaciones comunes
    $candidates = @(
        "$ScriptDir/../../vcpkg",
        "$env:USERPROFILE/vcpkg",
        "C:/vcpkg",
        "C:/dev/vcpkg",
        "C:/tools/vcpkg"
    )
    foreach ($dir in $candidates) {
        if (Test-Path "$dir/vcpkg.exe") {
            $VcpkgDir = Resolve-Path $dir
            break
        }
    }
    if (-not $VcpkgDir) {
        # Preguntar al usuario
        $VcpkgDir = Read-Host "Enter vcpkg installation directory"
    }
}

Write-Host "═══ BlinkStream Sidecar Builder ═══" -ForegroundColor Cyan
Write-Host "Source:     $ScriptDir\ct2_server.cpp"
Write-Host "Vcpkg:      $VcpkgDir"
Write-Host "Build type: $BuildType"
Write-Host "CUDA:       $(if ($UseCUDA) { 'YES' } else { 'no' })"
Write-Host ""

# ─── 2. Verificar requisitos ────────────────────────────────

# CMake
try {
    $cmakeVer = & cmake --version 2>&1 | Select-String -Pattern "cmake version" | ForEach-Object { $_.ToString() }
    Write-Host "[OK] CMake: $cmakeVer" -ForegroundColor Green
} catch {
    Write-Error "CMake not found. Install it first: winget install Kitware.CMake"
    exit 1
}

# MSVC (Visual Studio)
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vswhere)) {
    $vswhere = "${env:ProgramFiles}\Microsoft Visual Studio\Installer\vswhere.exe"
}
$msvcDir = ""
if (Test-Path $vswhere) {
    $msvcDir = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
}
if ($msvcDir) {
    Write-Host "[OK] Visual Studio: $msvcDir" -ForegroundColor Green
} else {
    Write-Error "Visual Studio with C++ tools not found. Install 'Desktop development with C++' workload."
    exit 1
}

# vcpkg
if (-not (Test-Path "$VcpkgDir/vcpkg.exe")) {
    Write-Error "vcpkg not found at $VcpkgDir. Clone it: git clone https://github.com/Microsoft/vcpkg.git"
    exit 1
}
Write-Host "[OK] vcpkg: $VcpkgDir" -ForegroundColor Green

# ─── 3. Instalar dependencias (vcpkg) ───────────────────────
if (-not $SkipVcpkg) {
    Write-Host "`n─── Installing dependencies via vcpkg ───" -ForegroundColor Yellow

    # nlohmann-json (siempre necesario)
    & "$VcpkgDir/vcpkg" install nlohmann-json:x64-windows
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install nlohmann-json"
        exit 1
    }
    Write-Host "[OK] nlohmann-json installed" -ForegroundColor Green

    # CTranslate2
    $ct2Triplet = if ($UseCUDA) { "x64-windows" } else { "x64-windows" }
    $ct2Features = if ($UseCUDA) { "ctranslate2[cuda]" } else { "ctranslate2" }
    & "$VcpkgDir/vcpkg" install "$ct2Features`:$ct2Triplet"
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "CTranslate2 installation via vcpkg failed."
        Write-Warning "Falling back to Python pip installation method."
        Write-Warning "Install CTranslate2 manually: pip install ctranslate2"
        Write-Warning "Then re-run with -SkipVcpkg"
    } else {
        Write-Host "[OK] CTranslate2 installed" -ForegroundColor Green
    }
}

if ($NoBuild) {
    Write-Host "`nDependencies installed. Skipping build (-NoBuild flag)." -ForegroundColor Cyan
    exit 0
}

# ─── 4. Configurar y compilar con CMake ─────────────────────
Write-Host "`n─── Configuring with CMake ───" -ForegroundColor Yellow

$buildDir = "$ScriptDir/build"
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$cmakeArgs = @(
    "-B", $buildDir,
    "-S", $ScriptDir,
    "-DCMAKE_BUILD_TYPE=$BuildType",
    "-DCMAKE_TOOLCHAIN_FILE=$VcpkgDir/scripts/buildsystems/vcpkg.cmake",
    "-DVCPKG_TARGET_TRIPLET=x64-windows"
)

if ($UseCUDA) {
    $cmakeArgs += "-DCMAKE_CUDA_ARCHITECTURES=all"
}

Write-Host "CMake arguments:" -ForegroundColor Gray
$cmakeArgs | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

& cmake @cmakeArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "CMake configuration failed"
    exit 1
}

Write-Host "`n─── Building ───" -ForegroundColor Yellow
& cmake --build $buildDir --config $BuildType
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed"
    exit 1
}

# ─── 5. Copiar binario al directorio sidecar/ ──────────────
$sourceCandidates = @(
    "$buildDir/$BuildType/ct2-server.exe",
    "$buildDir/ct2-server.exe"
)

$sourceBinary = $null
foreach ($candidate in $sourceCandidates) {
    if (Test-Path $candidate) {
        $sourceBinary = $candidate
        break
    }
}

if ($sourceBinary) {
    # Copiar como ct2-server.exe (para PATH y which::which)
    $targetBinary = "$ScriptDir/ct2-server.exe"
    Copy-Item -Path $sourceBinary -Destination $targetBinary -Force
    Write-Host "[OK] Binary (base): $targetBinary" -ForegroundColor Green

    # Copiar también con el nombre de target triple (para búsqueda por resource_dir)
    $targetTriple = if ($UseCUDA) { "x86_64-pc-windows-msvc" } else { "x86_64-pc-windows-msvc" }
    $tripleBinary = "$ScriptDir/ct2-server-$targetTriple.exe"
    Copy-Item -Path $sourceBinary -Destination $tripleBinary -Force
    Write-Host "[OK] Binary (triple): $tripleBinary" -ForegroundColor Green
} else {
    Write-Warning "Binary not found. Check build output in: $buildDir"
}

Write-Host "`n═══ Build complete ═══" -ForegroundColor Cyan
Write-Host ""
Write-Host "To test the sidecar:"
Write-Host "  echo '{\`"command\`":\`"ping\`"}' | & '$targetBinary'"
Write-Host ""
Write-Host "To use in BlinkStream, ensure the binary is in the PATH or in:"
Write-Host "  $ScriptDir"
