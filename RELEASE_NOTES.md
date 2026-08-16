## 🚀 What's New in Version 1.4.0 (Global Languages & Ultra-Low Latency Live Experience)

Welcome to **BlinkStream v1.4.0**! This major update brings full internationalization across 8 languages, real-time Twitch badges and custom colors in your own chat messages, an ultra-low latency playback pipeline paired to live chat, and a revamped performance statistics overlay.

---

### 🌍 Full Multi-Language Support (8 Languages)
- **100% Comprehensive Localization**: Complete, high-quality translations across the entire application for:
  - 🇪🇸 **Spanish (`es`)**
  - 🇬🇧 **English (`en`)**
  - 🇫🇷 **French (`fr`)**
  - 🇩🇪 **German (`de`)**
  - 🇵🇹 **Portuguese (`pt`)**
  - 🇯🇵 **Japanese (`ja`)**
  - 🇰🇷 **Korean (`ko`)**
  - 🇷🇺 **Russian (`ru`)**
- Full coverage for Mod View, User Inspector, Theme Studio, Wi-Fi Remote, Offline Player states, VODs/Clips, and the Auto-Updater.

---

### 💬 Real-Time Twitch Badges & Chat Customization
- **IRC `USERSTATE` Integration**: When sending messages in chat, your real badges (Subscriber, Moderator, VIP, Broadcaster, Prime, Turbo, Founder, etc.) and your custom Twitch username color are rendered immediately in optimistic UI.

---

### ⚡ Ultra-Low Latency Live Pipeline (LL-HLS)
- **Rust Backend Streamlink Flags**: Streamlink now requests `--twitch-low-latency` and `--hls-live-edge 1` directly from Twitch edges.
- **Aggressive HLS Live Edge Sync**:
  - Starts instantly at the absolute live edge (`startPosition: -1` on first buffer).
  - Smooth 1.2x auto-catchup when network hiccups occur to keep you synchronized with real-time chat.
  - Interactive **`● LIVE`** badge in the player controls to resync to the live edge with 1 click.

---

### 📊 Real-Time Stream Performance Overlay
- Press **Ctrl+D** or use Settings to open the updated stats card with dedicated metrics:
  - ⏱️ **Live Latency**: Exact delay to the broadcaster in seconds.
  - 🎞️ **RAM Buffer Ahead**: Pre-buffered video in memory to prevent stuttering.
  - ⚡ **Bitrate**, 📐 **Resolution/FPS**, and 📉 **Dropped Frame counter**.

---

### 💾 Available Downloads
- ⭐ **`BlinkStream_1.4.0_Win_x64.exe`** *(Recommended — NSIS installer with automatic update support)*
- **`BlinkStream_1.4.0_Win_x64.msi`** *(Enterprise Windows MSI installer package)*
- **`BlinkStream_1.4.0_macOS_arm64.dmg`** *(Apple Silicon macOS Universal DMG)*
- **`BlinkStream_1.4.0_macOS_x64.dmg`** *(Intel macOS Universal DMG)*
- **`BlinkStream_1.4.0_Linux_x86_64.deb`** *(Debian / Ubuntu Linux Package)*
- **`BlinkStream_1.4.0_Linux_x86_64.AppImage`** *(Universal Linux AppImage)*
