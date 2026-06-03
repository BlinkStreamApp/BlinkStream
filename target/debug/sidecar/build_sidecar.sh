#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# build_sidecar.sh — Build CTranslate2 sidecar for Linux/macOS
# ═══════════════════════════════════════════════════════════════
#
# Usage:
#   ./build_sidecar.sh                   # Default build (CPU)
#   ./build_sidecar.sh --cuda            # With CUDA support
#   ./build_sidecar.sh --skip-deps       # Skip dependency check
#
# Prerequisites:
#   - CMake ≥ 3.16
#   - C++17 compiler (g++ ≥ 8, clang ≥ 10, or AppleClang ≥ 14)
#   - nlohmann-json (system package or vcpkg)
#   - CTranslate2 (system package, vcpkg, or Python pip)
#
# Quick start:
#   brew install ctranslate2          # macOS
#   apt install libctranslate2-dev     # Debian/Ubuntu
#   pip install ctranslate2           # Any OS (CMake picks it up)
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
BUILD_TYPE="${BUILD_TYPE:-Release}"
USE_CUDA=false
SKIP_DEPS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --cuda) USE_CUDA=true; shift ;;
        --debug) BUILD_TYPE="Debug"; shift ;;
        --skip-deps) SKIP_DEPS=true; shift ;;
        --help|-h)
            echo "Usage: $0 [--cuda] [--debug] [--skip-deps]"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

echo "═══ BlinkStream Sidecar Builder ═══"
echo "Source:   ${SCRIPT_DIR}/ct2_server.cpp"
echo "Build:    ${BUILD_TYPE}"
echo "CUDA:     ${USE_CUDA}"

# ─── Check dependencies ───────────────────────────────────
if ! command -v cmake &>/dev/null; then
    echo "ERROR: CMake not found. Install: brew install cmake / apt install cmake"
    exit 1
fi
echo "[OK] CMake: $(cmake --version | head -1)"

# ─── CMake configuration ──────────────────────────────────
echo ""
echo "─── Configuring with CMake ───"
mkdir -p "${BUILD_DIR}"

CMAKE_ARGS=(
    -B "${BUILD_DIR}"
    -S "${SCRIPT_DIR}"
    -DCMAKE_BUILD_TYPE="${BUILD_TYPE}"
)

if ${USE_CUDA}; then
    CMAKE_ARGS+=(-DCMAKE_CUDA_ARCHITECTURES=all)
fi

# Try vcpkg if available
if [ -f "${SCRIPT_DIR}/../../vcpkg/scripts/buildsystems/vcpkg.cmake" ]; then
    CMAKE_ARGS+=(
        -DCMAKE_TOOLCHAIN_FILE="${SCRIPT_DIR}/../../vcpkg/scripts/buildsystems/vcpkg.cmake"
    )
    echo "[INFO] Using vcpkg toolchain"
elif [ -f "/usr/local/share/vcpkg/scripts/buildsystems/vcpkg.cmake" ]; then
    CMAKE_ARGS+=(
        -DCMAKE_TOOLCHAIN_FILE="/usr/local/share/vcpkg/scripts/buildsystems/vcpkg.cmake"
    )
    echo "[INFO] Using vcpkg toolchain"
fi

echo "CMake arguments:"
printf '  %s\n' "${CMAKE_ARGS[@]}"

cmake "${CMAKE_ARGS[@]}"

# ─── Build ─────────────────────────────────────────────────
echo ""
echo "─── Building ───"
cmake --build "${BUILD_DIR}" --config "${BUILD_TYPE}" -j "$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)"

# ─── Copy binary ───────────────────────────────────────────
# Find the built binary
SOURCE=""
for candidate in "${BUILD_DIR}/ct2-server" "${BUILD_DIR}/${BUILD_TYPE}/ct2-server"; do
    if [ -f "${candidate}" ]; then
        SOURCE="${candidate}"
        break
    fi
done

if [ -n "${SOURCE}" ]; then
    # Copy as ct2-server (for PATH and which::which)
    TARGET="${SCRIPT_DIR}/ct2-server"
    cp "${SOURCE}" "${TARGET}"
    chmod +x "${TARGET}"
    echo ""
    echo "[OK] Binary (base): ${TARGET}"

    # Copy with target-triple name (for resource_dir search)
    # Detect architecture and platform for full triple
    ARCH="$(uname -m)"
    case "$(uname -s)" in
        Linux)  TRIPLE="${ARCH}-unknown-linux-gnu" ;;
        Darwin)
            if [ "${ARCH}" = "arm64" ]; then
                TRIPLE="aarch64-apple-darwin"
            else
                TRIPLE="x86_64-apple-darwin"
            fi
            ;;
        *)      TRIPLE="${ARCH}-unknown-linux-gnu" ;;
    esac
    TRIPLE_TARGET="${SCRIPT_DIR}/ct2-server-${TRIPLE}"
    cp "${SOURCE}" "${TRIPLE_TARGET}"
    chmod +x "${TRIPLE_TARGET}"
    echo "[OK] Binary (triple): ${TRIPLE_TARGET}"
else
    echo "WARNING: Binary not found, check: ${BUILD_DIR}"
fi

echo ""
echo "═══ Build complete ═══"
echo ""
echo "To test:"
echo "  echo '{\"command\":\"ping\"}' | ${TARGET}"
echo ""
echo "To use in BlinkStream, ensure the binary is in PATH or in:"
echo "  ${SCRIPT_DIR}"
