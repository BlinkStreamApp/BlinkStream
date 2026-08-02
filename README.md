<p align="center">
  <img src="src/assets/logo.png" alt="BlinkStream" width="200">
</p>

<h1 align="center">BlinkStream</h1>

<p align="center">
  <strong>Next-Generation Desktop Client for Twitch — Lightweight, Cross-Platform, and Ultra-Fast</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.1.0-e94560" alt="Version">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0f3460" alt="Platform">
  <img src="https://img.shields.io/badge/built%20with-Tauri%20v2%20%2B%20React%2019-16213e" alt="Stack">
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎯 **Custom Installer** | Immersive Twitch-themed installer with native custom installation directory selector |
| 📺 **Live Streams** | Smooth Twitch stream playback using integrated Streamlink + FFmpeg engine |
| 🎬 **Clips & VODs** | Dedicated video-on-demand and clip player with selectable multi-quality tiers |
| 💬 **Rich IRC Chat** | Real-time chat integration supporting third-party emotes (BTTV, 7TV, FFZ) and docking controls |
| 🛡️ **Advanced Moderation** | Complete moderation tools: timeout/ban management, chat slow-mode, and VIP/mod badges |
| 💎 **Channel Points** | Integrated channel point redemption tracking, custom reward execution, and live balance UI |
| 📼 **Local Recording** | Built-in live recording system with automatic disk space monitoring and background encoding |
| 🔐 **OAuth Authentication** | Secure Twitch login powered by Supabase Edge Functions with state-of-the-art token security |
| ⭐ **Cloud Sync Favorites** | Synchronize favorite streamers and custom watchlists securely via cloud storage |
| 🔍 **Smart Search** | Auto-complete channel discovery prioritizing online broadcasts with low-latency indicators |
| 🎭 **Theater Mode** | Distraction-free full-window viewing layout engineered for maximum immersion |
| 🌙 **Sleek Dark UI** | Responsive dark theme customized from 800px up to ultra-wide 4K displays |
| 🔒 **Hardened Security** | Strict Content Security Policy (CSP) with zero wildcards, rustls TLS, and secure keychain storage |
| ⚡ **Zero Bloat & Lazy Load** | Optimized chunk splitting and TTL sessionStorage caching for instantaneous startup times |
| 🔄 **Over-The-Air Updates** | Automated background checking and seamless self-updating via official GitHub Releases |

---

## 📦 Installation

### Windows
Download the official installer from [GitHub Releases](https://github.com/BlinkStreamApp/BlinkStream/releases). Existing installations update automatically:
- ⭐ **`BlinkStream-Setup_1.1.0_Custom.exe`** *(Recommended — 100% Custom Twitch-themed setup with path selection)*
- `BlinkStream_1.1.0_Win_x64.exe` *(Standard NSIS installer)*
- `BlinkStream_1.1.0_Win_x64.msi` *(Enterprise MSI installer)*

> [!NOTE]  
> **Important Note Regarding Windows Defender / SmartScreen Notifications (False Positives):**  
> Because BlinkStream is an independent, free open-source software project distributed without costly commercial EV (Extended Validation) code signing certificates ($300+/year), Microsoft Defender may occasionally flag brand-new compiled builds with machine learning heuristics warnings upon initial download (such as `Trojan:Win32/Wacatac.B!ml` or SmartScreen screen blocks).  
> 
> **Why does this happen?** The `!ml` suffix stands for *Machine Learning*. When downloading unsigned executables that perform legitimate installation procedures (creating shortcuts, registering uninstall entries), automated predictive heuristic models may temporarily flag newly released binaries simply due to their initial "zero reputation" score in cloud databases.  
> 
> **How to proceed:**  
> - **Windows Security / Defender:** Open the threat log and select **Actions** ➔ **Allow on device** (or *Restore*).  
> - **Windows SmartScreen Prompt:** Click **More info** ➔ **Run anyway**.  
> - *Transparency guarantee:* Every single BlinkStream binary is compiled directly within public, highly monitored GitHub Actions cloud runner infrastructure with automated security auditing. Users are encouraged to inspect source workflows or compile binaries locally using our build instructions below!

### macOS
```bash
brew install streamlink
# Download BlinkStream_1.1.0_macOS_arm64.dmg (Silicon) or x64.dmg (Intel) from Releases
```

### Linux (Debian / Ubuntu)
```bash
sudo apt install streamlink
# Download BlinkStream_1.1.0_Linux_x86_64.deb or .AppImage from Releases
```

---

## 🔨 Building from Source

### Prerequisites
- **Node.js** 22+
- **pnpm** 10+
- **Rust** 1.88.0+ (pinned in `rust-toolchain.toml`)
- **Streamlink** (installed and globally available in PATH)

### Windows
```powershell
winget install Streamlink.Streamlink
pnpm install
pnpm build
pnpm tauri build
```

### macOS
```bash
brew install streamlink
pnpm install
pnpm build
pnpm tauri build --bundles app
```

### Linux
```bash
sudo apt install streamlink libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev
pnpm install
pnpm build
pnpm tauri build
```

---

## 🏗️ Architecture

```
blinkstream/
├── src/                     # React 19 + Tailwind CSS Frontend
│   ├── components/          # Modularized UI Components
│   │   ├── installer/       # Custom Windows Setup & Directory Picker
│   │   ├── moderation/      # Mod Panel, Timeout/Ban controllers
│   │   ├── channelpoints/   # Twitch Reward Redemptions UI
│   │   ├── recording/       # Video Recording Controller & Disk Monitor
│   │   ├── HomeScreen.jsx   # Main Navigation & Carousel Hub
│   │   └── ...
│   ├── hooks/               # Custom state hooks (useAuth, useRecording, etc.)
│   └── utils/               # Twitch API integrations, encryption, & analytics
├── src-tauri/               # Rust Backend (Tauri v2.11)
│   ├── src/
│   │   ├── installer.rs     # Windows Registry, shortcuts, & custom setup commands
│   │   ├── recorder.rs      # Cross-platform stream capture & POSIX fs storage metrics
│   │   ├── lib.rs           # Core IPC bindings & single-instance management
│   │   └── main.rs          # Application Entrypoint
│   └── tauri.conf.json      # Hardened security manifest & bundler targets
└── .github/workflows/       # CI/CD Pipelines (Multi-OS Automated Builds)
```

---

## 🔧 Technical Stack

| Layer | Technology |
|-------|------------|
| **Desktop Shell** | Tauri v2.11 |
| **Frontend Runtime** | React 19 + Tailwind CSS 3 |
| **Backend Core** | Rust 1.88.0 (Async Tokio engine) |
| **Module Bundler** | Vite 8 + pnpm workspaces |
| **Video Streaming** | HLS.js + Streamlink + FFmpeg |
| **Authentication** | Supabase Edge Functions + Twitch OAuth 2.0 |
| **Chat Transport** | WebSocket IRC (`wss://irc-ws.chat.twitch.tv`) |
| **CI/CD Automation** | GitHub Actions (Windows, macOS ARM/Intel, Linux) |

---

## 📊 Performance & Security Metrics

| Metric | Value |
|--------|-------|
| **Windows Installer Size** | ~3.8 MB (Ultra-lightweight footprint) |
| **Initial Bundle Load** | ~280 KB minified & compressed |
| **Security Auditing** | **0 Known Vulnerabilities** across Rust and npm dependency graphs |
| **Automated Test Suite** | **287 Unit & Integration Tests** passing (Vitest 4) |
| **Content Security Policy** | 9 restrictive directives, **0 wildcards allowed** |
| **Supported Platforms** | Windows 10/11, macOS 13+ (Silicon & Intel), Ubuntu/Debian Linux |

---

## 📄 License

MIT License © BlinkStream Team

---

<p align="center">
  <sub>Built with Tauri v2, React 19, and Rust. No cloud bloat. No compromise.</sub>
</p>
