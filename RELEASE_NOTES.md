## 🚀 What's New in Version 1.3.7 (Critical Playback & HLS Engine Hotfix)

A high-priority Hotfix release resolving critical video stream playback issues, HLS.js engine stability, and Content Security Policy compatibility across Windows, macOS, and Linux!

### 🔧 v1.3.7 Hotfix & Engine Fixes
- **Hls.js LoadStats Structure Fix (Black Screen Resolution):** Resolved an unhandled internal exception (`TypeError: Cannot set properties of undefined (setting 'start')`) in Hls.js's manifest parser. The custom `TauriPlaylistLoader` now properly mutates and passes the official `this.stats` (`LoadStats`) instance with all `loading`, `parsing`, and `bwEstimate` attributes, allowing segment downloads to schedule and play seamlessly.
- **Enhanced Content Security Policy (CSP):** Upgraded `connect-src`, `media-src`, and `img-src` directives to support `https:` transport, enabling seamless loading from Twitch's dynamic multi-level CDN subdomains (e.g., `*.hls.ttvnw.net`, `*.cloudfront.hls.ttvnw.net`, and `*.akamaized.net`).
- **Autoplay Resilience & Muted Fallback:** Implemented automatic muted playback fallback if host OS or browser policies restrict unmuted autoplay, ensuring immediate stream startup without stalling.
- **Native MSE Decoder Optimization:** Removed extraneous `crossOrigin` attributes on the video element that could cause Chromium/WebView2 decoder checks to fail on local MediaSource blobs.
- **Home Carousel & MultiStream Grid Fix:** Synchronized the robust playlist proxy and HLS handling across `VideoPlayer.jsx`, `StreamPreview.jsx`, and `GridCell.jsx`.

### 🌧️ Real-Time Emote Rain & Dynamic Combo Meters
- **Live Emote Floating FX:** Emotes from Twitch, 7TV, BTTV, and FFZ bubble up across your video player in real-time. Engineered with strict RAM cap protections (max 20 active particles) to ensure **0% FPS drop or latency while gaming**.
- **Neon Combo Breakers:** Automated high-frequency burst detection in chat triggers vibrant neon-charged alerts on screen: **HYPERS COMBO**, **SUPER COMBO**, and **GODLIKE COMBO**.
- **Amber Mention Highlights:** Instantaneous millisecond detection of your username in chat, lighting up your personal mentions with an elegant golden glow.

### 🔔 Smart Chat Tabs & Multi-Stream Command Grid
- **Intelligent Chat Navigation Bar:** Seamlessly filter and switch between **All Messages**, **@Mentions** (featuring a live unread badge counter), and **⭐ Featured Events** with a single click.
- **Multi-Stream Grid:** Monitor up to 4 simultaneous live broadcasts with independent audio mixer controls—the ultimate layout for esports tournaments and speedrun restreaming.

### 🛡️ Verified Stability & Automated Update System
- **100% Passing Test Suite:** Fully verified against our automated test harness (all frontend, release manifest, and security tests passing).
- **OTA Auto-Updater Ready:** Configured with secure cryptographic signature verification via `updater.json` for background over-the-air updates.

### 💾 Available Downloads
- ⭐ **`BlinkStream_1.3.7_Win_x64.exe`** *(Recommended — NSIS installer with automatic update support)*
- **`BlinkStream_1.3.7_Win_x64.msi`** *(Enterprise Windows MSI installer package)*
- **`BlinkStream_1.3.7_macOS_arm64.dmg`** *(Apple Silicon macOS Universal DMG)*
- **`BlinkStream_1.3.7_macOS_x64.dmg`** *(Intel macOS Universal DMG)*
- **`BlinkStream_1.3.7_Linux_x86_64.deb`** *(Debian / Ubuntu Linux Package)*
- **`BlinkStream_1.3.7_Linux_x86_64.AppImage`** *(Universal Linux AppImage)*
