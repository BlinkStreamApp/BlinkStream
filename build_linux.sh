#!/bin/bash
# BlinkStream v1.0.0 — Linux Build Script
# Ejecutar en Linux x64 (Ubuntu 22.04+ recomendado)
# Requisitos: Node.js 18+, Rust 1.77+, build-essential, libwebkit2gtk, libgtk-3

set -e

echo "🔨 Building BlinkStream v1.0.0 for Linux..."

# Instalar dependencias
sudo apt update
sudo apt install -y build-essential curl wget file libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev

# Streamlink
which streamlink > /dev/null 2>&1 || sudo apt install -y streamlink

# Frontend
pnpm install
pnpm build

# Rust backend
cd src-tauri
rustup target add x86_64-unknown-linux-gnu

# Necesario para Tauri en Linux
sudo apt install -y libjavascriptcoregtk-4.1-dev libsoup-3.0-dev 2>/dev/null || true

cargo tauri build --target x86_64-unknown-linux-gnu

echo ""
echo "✅ Build completo:"
echo "   target/x86_64-unknown-linux-gnu/release/bundle/deb/BlinkStream_*.deb"
echo "   target/x86_64-unknown-linux-gnu/release/bundle/appimage/BlinkStream_*.AppImage"
