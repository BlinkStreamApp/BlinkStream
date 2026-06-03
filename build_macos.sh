#!/bin/bash
# BlinkStream v1.0.0 — macOS Build Script
# Ejecutar en una Mac (Intel o Apple Silicon)
# Requisitos: Xcode CLT, Node.js 18+, Rust 1.77+, brew install streamlink

set -e

echo "🔨 Building BlinkStream v1.0.0 for macOS..."

# Instalar dependencias
which brew > /dev/null || { echo "❌ Instala Homebrew: https://brew.sh"; exit 1; }
brew list streamlink > /dev/null 2>&1 || brew install streamlink

# Frontend
pnpm install
pnpm build

# Rust backend
cd src-tauri

# Detectar arquitectura
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    TARGET="aarch64-apple-darwin"
    echo "📦 Building for Apple Silicon (ARM)..."
else
    TARGET="x86_64-apple-darwin"
    echo "📦 Building for Intel..."
fi

rustup target add $TARGET
cargo tauri build --target $TARGET

echo ""
echo "✅ Build completo:"
echo "   target/$TARGET/release/bundle/dmg/BlinkStream_*.dmg"
echo "   target/$TARGET/release/bundle/macos/BlinkStream.app"
