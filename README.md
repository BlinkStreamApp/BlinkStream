<p align="center">
  <img src="src/assets/logo.png" alt="BlinkStream" width="200">
</p>

<h1 align="center">BlinkStream</h1>

<p align="center">
  <strong>Next-Generation Desktop Client for Twitch — Lightweight, Cross-Platform, and Ultra-Fast</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/source_version-1.4.3-e94560" alt="Source version 1.4.3">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0f3460" alt="Platform">
  <img src="https://img.shields.io/badge/built%20with-Tauri%20v2%20%2B%20React%2019-16213e" alt="Stack">
  <img src="https://img.shields.io/badge/languages-8%20Supported-9147ff" alt="Languages">
</p>

---

## ✨ Features

See [release notes](RELEASE_NOTES.md), [roadmap](ROADMAP.md) and
[updater verification](docs/guides/UPDATER_VERIFICATION.md) for evidence and validation limits.

| Feature | Description |
|---------|-------------|
| 🌍 **Global Localization** | Core interface supports 8 languages (ES, EN, FR, DE, PT, JA, KO, RU); new experimental screens may still contain Spanish copy |
| 💬 **Twitch Popout Chat & Channel Points** | Official native Twitch popout chat integrated directly into the workspace or as an Always-on-Top floating window with full Channel Points, reward redemption, and emotes |
| 🛡️ **Pro Mod View Workspace** | Dedicated multi-dock command center (`Ctrl+M`) with live mod logs, AutoMod queue, unban appeals, active viewers, predictions, and channel point redemptions |
| ⚡ **Low Latency (LL-HLS)** | Live-edge synchronization, dynamic catchup and one-click live resync; latency depends on stream/network conditions |
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
| 🔄 **Over-The-Air Updates** | Background/manual checks, user-confirmed installation and signature verification via GitHub Releases; legacy clients with a different trusted key need a manual transition |

---

## 📦 Installation

### Windows
Download an already published installer from [GitHub Releases](https://github.com/BlinkStreamApp/BlinkStream/releases/latest).
Version 1.4.3 is available. Updates require a compatible signing key and your confirmation.

- ⭐ **`BlinkStream_1.4.3_Win_x64.exe`** *(Recommended NSIS installer, used by the updater)*
- `BlinkStream_1.4.3_Win_x64.msi` *(Enterprise MSI installer)*

Install streaming dependencies and download the official installer from PowerShell:

```powershell
winget install --id Streamlink.Streamlink --exact
winget install --id Gyan.FFmpeg --exact
Invoke-WebRequest -Uri "https://github.com/BlinkStreamApp/BlinkStream/releases/download/v1.4.3/BlinkStream_1.4.3_Win_x64.exe" -OutFile "BlinkStream_1.4.3_Win_x64.exe"
# Review the download and the warning below before running:
.\BlinkStream_1.4.3_Win_x64.exe
```

Restart your terminal/application after installing dependencies so PATH changes are visible.
BlinkStream can also attempt dependency setup through winget on Windows when tools are missing.

> [!NOTE]  
> **SmartScreen and Microsoft Defender are different warnings.** BlinkStream's Windows binaries
> are not Authenticode-signed, so SmartScreen may show an unknown-publisher/reputation warning.
> Download only from this repository's official Releases and check the release/workflow provenance.
> If the warning is only SmartScreen's reputation warning, and you have verified and trust the file,
> you can choose **More info → Run anyway**, if Windows policy permits it.
>
> If **Defender reports malware or a Trojan**, do not assume it is a false positive or allow it
> merely because the app is unsigned. Keep protection enabled, leave the file quarantined and
> report the exact detection and release to the maintainers for investigation.
> Updater signatures verify authenticity/integrity; they are not Authenticode certificates or malware scans.

See [Microsoft's SmartScreen overview](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/) for reputation-based protection.

### macOS

```bash
brew install streamlink ffmpeg
# Apple Silicon; for Intel replace arm64 with x64 in the filename and URL.
curl -fLO "https://github.com/BlinkStreamApp/BlinkStream/releases/download/v1.4.3/BlinkStream_1.4.3_macOS_arm64.dmg"
open BlinkStream_1.4.3_macOS_arm64.dmg
```

Drag BlinkStream into Applications. macOS 11+ is configured as the minimum; choose the
installer matching your CPU. Updater signatures do not imply Apple notarization.

### Linux (Debian / Ubuntu)

```bash
sudo apt update
sudo apt install streamlink ffmpeg
curl -fLO "https://github.com/BlinkStreamApp/BlinkStream/releases/download/v1.4.3/BlinkStream_1.4.3_Linux_x86_64.deb"
sudo apt install ./BlinkStream_1.4.3_Linux_x86_64.deb
```

Alternatively, use the x86_64 AppImage:

```bash
curl -fLO "https://github.com/BlinkStreamApp/BlinkStream/releases/download/v1.4.3/BlinkStream_1.4.3_Linux_x86_64.AppImage"
chmod +x BlinkStream_1.4.3_Linux_x86_64.AppImage
./BlinkStream_1.4.3_Linux_x86_64.AppImage
```

AppImage may require FUSE support depending on the distribution.
Integrated Linux updates use AppImage. Installations from `.deb` require a manual/package update;
the native updater does not replace the system package manager.

---

## 🔨 Building from Source

### Prerequisites

- **Git**, **Node.js 22.12+** and **pnpm 10**.
- **Rust via rustup**: this repository pins **1.88.0** in `rust-toolchain.toml`.
- **Streamlink and FFmpeg** installed and available in PATH.
- **Windows:** Visual Studio Build Tools with **Desktop development with C++**, Windows SDK and WebView2 Runtime.
- **macOS:** Xcode Command Line Tools (`xcode-select --install`).
- **Linux:** WebKitGTK 4.1/GTK3 and native development libraries listed below.

See [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/) for OS setup.

### Get the source

```bash
git clone https://github.com/BlinkStreamApp/BlinkStream.git
cd BlinkStream
npm install --global pnpm@10
pnpm install --frozen-lockfile
```

Run subsequent commands from the repository root. To reproduce the published source,
check out tag `v1.4.3` before installing dependencies; `master` includes later documentation/changes.

### Configuration

For local configuration, copy `.env.example` to `.env` (`Copy-Item .env.example .env`
on PowerShell; `cp .env.example .env` on macOS/Linux) and review the placeholders.
Do not paste real secrets into README files, commits or variables prefixed `VITE_`:
those variables can be exposed in the frontend bundle.

The current auth/data client targets BlinkStream's configured Supabase backend;
changing `VITE_SUPABASE_URL` alone does **not** redirect it to a different project.
Some example variables and setup notes are legacy. A self-hosted backend requires
reviewing the client URLs, Edge Functions, native build-time configuration and CSP.
Native `option_env!` settings are build-time variables; the frontend `.env` is not
automatically loaded into Cargo. OAuth client secrets belong server-side; existing
legacy secret-dependent paths need security review, not frontend secret configuration.
See [Twitch setup notes](docs/TWITCH_APP_SETUP.md) and [security guidelines](docs/SECURITY.md).

### Development

```bash
pnpm tauri dev
```

This starts both Vite and the native desktop app. `pnpm dev` starts only the frontend:
it is useful for UI work but does not provide native playback, keychain or updater IPC.

### Windows
```powershell
winget install Streamlink.Streamlink
winget install --id Gyan.FFmpeg --exact
pnpm tauri build
```

### macOS
```bash
brew install streamlink ffmpeg
pnpm tauri build --bundles app
```

### Linux
```bash
sudo apt update
sudo apt install -y streamlink ffmpeg build-essential pkg-config curl wget file libssl-dev libxdo-dev libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
pnpm tauri build
```

---

`pnpm tauri build` runs the frontend build automatically. Bundles are written under
`src-tauri/target/release/bundle/` (or `target/<target>/release/bundle/` for an explicit target).
For a local executable without installers, use `pnpm tauri build --no-bundle`.
The macOS command above creates an app bundle; official CI additionally packages DMGs/update archives.
Release updater signing requires the authorized signing environment; a local build does not
create an official signed update. Do not substitute or commit signing keys.

## 🏗️ Architecture

```text
blinkstream/
├── src/                     # React interface
│   ├── components/          # Player, chat, Drops, moderation, multistream and settings
│   ├── hooks/               # Authentication, follows/pins, playback and recording state
│   └── utils/               # Twitch/cloud clients, HLS, storage and shared utilities
├── src-tauri/               # Tauri/Rust desktop backend
│   ├── src/
│   │   ├── lib.rs           # IPC commands, credentials, streaming and native lifecycle
│   │   ├── recorder.rs      # FFmpeg recording and disk operations
│   │   ├── companion.rs     # Wi-Fi remote server
│   │   ├── embedded_drops.rs # Official inventory webview lifecycle
│   │   └── drops_watch.rs   # Experimental measured-playback reporting
│   ├── capabilities/       # Native permission boundaries
│   ├── vendor/glib/        # Reviewed GTK3 security backport for Linux
│   └── tauri*.conf.json     # App, CSP, bundles and updater configuration
├── supabase/                # OAuth/data Edge Functions and database migrations
├── public/                  # Static frontend assets
├── docs/                    # GitHub Pages, architecture decisions and operating guides
├── scripts/                 # Build, backup, release verification and installer checks
└── .github/workflows/       # Quality gates and multi-platform release builds
```

React uses hooks/services and Tauri IPC for privileged desktop operations. Rust manages
external Streamlink/FFmpeg processes, OS credentials and native webviews; hls.js handles
video playback in the interface. Twitch supplies Helix/GQL, IRC and EventSub integrations;
Supabase hosts OAuth/data services. Remote Twitch views do not inherit app IPC privileges.
Manual pins are account-scoped and separate from live Twitch follows; logout clears active
account data and recent history without deleting preferences or shared Twitch cookies.

## 🔧 Technical Stack

| Layer | Technology |
|-------|------------|
| **Desktop shell** | Tauri 2.11, Rust 1.88.0, Tokio, platform webviews |
| **Frontend** | React 19, Tailwind CSS 4, Phosphor icons |
| **Build tooling** | Vite 8, Node.js 22.12+, pnpm 10 |
| **Streaming / recording** | hls.js 1.6, external Streamlink and FFmpeg |
| **Cloud / authentication** | Supabase Postgres and Deno Edge Functions; Twitch OAuth |
| **Twitch integrations** | Helix/GQL, WebSocket IRC, EventSub; embedded official chat/inventory |
| **Testing** | Vitest, Testing Library, Node test runner, Cargo and Deno |
| **Distribution** | NSIS/MSI, macOS app/DMG/update archives, Linux AppImage/deb |
| **CI/CD** | GitHub Actions; Windows x64, macOS Intel/Apple Silicon and Linux x64 |

Exact dependency constraints and resolved versions live in `package.json`, `pnpm-lock.yaml`,
`src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`.

---

## 🧪 Testing & Quality

```bash
pnpm lint
pnpm test
pnpm test:release
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Optional frontend commands: `pnpm test:watch`, `pnpm test:ui` and `pnpm test:coverage`.
CI also runs OAuth security/Edge Function tests and optimized GLib regression tests on Linux.
Tests/builds do not replace real desktop/account validation; see [updater evidence](docs/guides/UPDATER_VERIFICATION.md).

## 🚀 CI/CD & Releases

The release workflow validates pushes to `master` and builds all four desktop targets.
Publication is triggered by a version tag only after quality, bundles, Windows installer smoke
and signature verification pass. CI publishes the complete release and updates `updater.json`.
The app checks for updates automatically or manually; installation requires user confirmation.
Small compatible fixes use stable PATCH releases, not suffixes on an already published version.
See [hotfix procedure](docs/guides/HOTFIX_RELEASES.md) and [roadmap](ROADMAP.md).

---

## 📄 License

The project declares **MIT** in [its native package manifest](src-tauri/Cargo.toml).
A standalone root `LICENSE` file is not currently included. Third-party libraries and tools
retain their own licenses; vendored GLib includes its upstream license and copyright notices.
