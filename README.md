<p align="center">
  <img src="src/assets/logo.png" alt="BlinkStream" width="200">
</p>

<h1 align="center">BlinkStream</h1>

<p align="center">
  <strong>Next-Generation Desktop Client for Twitch — Lightweight, Cross-Platform, and Ultra-Fast</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.4.1-e94560" alt="Version">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0f3460" alt="Platform">
  <img src="https://img.shields.io/badge/built%20with-Tauri%20v2%20%2B%20React%2019-16213e" alt="Stack">
  <img src="https://img.shields.io/badge/languages-8%20Supported-9147ff" alt="Languages">
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🌍 **Global Localization** | 100% Comprehensive translations across 8 languages (ES, EN, FR, DE, PT, JA, KO, RU) |
| 💬 **Twitch Popout Chat & Channel Points** | Official native Twitch popout chat integrated directly into the workspace or as an Always-on-Top floating window with full Channel Points, reward redemption, and emotes |
| 🛡️ **Pro Mod View Workspace** | Dedicated multi-dock command center (`Ctrl+M`) with live mod logs, AutoMod queue, unban appeals, active viewers, predictions, and channel point redemptions |
| ⚡ **Ultra-Low Latency (LL-HLS)** | Aggressive live edge sync with instant 0-delay playback, dynamic 1.2x catchup, and 1-click live resync |
| 💬 **Rich IRC Chat & Badges** | Real-time chat with 7TV/BTTV/FFZ emotes, optimistic badge rendering (Sub, Mod, VIP, Founder, Turbo), and custom colors |
| 🎮 **Gamer Chat Overlay (HUD)** | Transparent always-on-top HUD with click-through and opacity controls to read chat over full-screen games |
| 🌧️ **Emote Rain & Combos** | Floating real-time emote particle overlays and dynamic neon Combo meter (HYPERS, SUPER, GODLIKE) |
| 🔔 **Smart Chat Tabs** | Quick navigation bar filtering between All messages, @Mentions with live counter, and ⭐ Featured events |
| 📺 **Live Streams** | Smooth Twitch stream playback using integrated Streamlink + FFmpeg engine |
| 🎬 **Clips & VODs** | Dedicated video-on-demand and clip player with selectable multi-quality tiers |
| 📼 **Local Recording** | Built-in live recording system with automatic disk space monitoring and background encoding |
| 🔐 **OAuth Authentication** | Secure Twitch login powered by Supabase Edge Functions with state-of-the-art token security |
| ⭐ **Cloud Sync Favorites** | Synchronize favorite streamers and custom watchlists securely via cloud storage |
| 🎨 **Theme Studio** | Deep theme customization (AMOLED Black, Cyberpunk Gold, Emerald) with selectable Google Fonts |
| 📊 **Pro Telemetry (Nerd Stats)** | Real-time live HUD measuring exact live broadcast delay, RAM buffer ahead, bitrate, resolution, FPS, and dropped frames |
| 📱 **Mobile Wi-Fi Remote** | Control playback, channel switching, and volume wirelessly from any smartphone or tablet |
| 🔒 **Hardened Security** | Strict Content Security Policy (CSP), rustls TLS, and secure OS keychain storage |
| 🔄 **Over-The-Air Updates** | Automated background checking and seamless self-updating via official GitHub Releases |

---

## 📦 Installation

### Windows
Download the official installer from [GitHub Releases](https://github.com/BlinkStreamApp/BlinkStream/releases). Existing installations update automatically:
- ⭐ **`BlinkStream_1.4.0_Win_x64.exe`** *(Recommended — NSIS installer and automatic updates)*
- `BlinkStream_1.4.0_Win_x64.msi` *(Enterprise MSI installer)*

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
# Download BlinkStream_1.4.0_macOS_arm64.dmg (Silicon) or x64.dmg (Intel) from Releases
```

### Linux (Debian / Ubuntu)
```bash
sudo apt install streamlink
# Download BlinkStream_1.4.0_Linux_x86_64.deb or .AppImage from Releases
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
sudo apt update && sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
pnpm install
pnpm build
pnpm tauri build
```

---

## 📄 License
Distributed under the **MIT License**. See `LICENSE` for more information.
