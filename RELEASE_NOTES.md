## 🚀 What's New in Version 1.4.1 (Twitch PubSub Channel Points & Mod View Polish)

Welcome to **BlinkStream v1.4.1**! This patch release brings 100% Channel Points redemption detection via Twitch PubSub WebSocket, streamlined Mod Quick Actions with horizontal selectors, and robust native WebView2 lifecycle management.

---

### 💎 100% Twitch PubSub Channel Points Detection
- **Real-Time WebSocket Integration (`wss://pubsub-edge.twitch.tv/v1`)**:
  - Subscribes directly to `community-points-channel-v1.<broadcasterId>`.
  - Captures **all** custom channel point redemptions in real time, including textless rewards (sound alerts, emotes, hydrate, stretch) and text-input rewards (TTS, user messages).
- **Activity Feed Integration**: Incoming redemptions are displayed seamlessly in Mod View's live activity feed with automatic deduplication.
- **Helix 403 Circuit Breaker**: Gracefully stops failed queries when broadcaster OAuth scopes are absent.

---

### 🛡️ Mod Quick Actions Bar: Inline Pill Selectors
- **Horizontal Pill Selectors for Slow Mode & Followers Mode**:
  - Replaced vertical floating menus with sleek inline selectors directly in the top action bar (`[ ⏱️ Lento: (Off) (3s) (10s) (30s) (60s) (120s) ✕ ]`).
  - Completely eliminates any menu occlusion or clipping by child WebViews.
  - Auto-closes smoothly on click-outside or pressing `Escape`.

---

### 🪟 Native Child WebView2 Fixes & Window Management
- **Modal Lifecycle Coordination**:
  - When opening Settings, About, or any overlay modal, the embedded Twitch chat window yields properly off-screen.
  - On closing modals, the native WebView2 position `(x, y)` and size `(width, height)` are restored instantly, eliminating black screen bugs.

---

### 🌙 Video Player Enhancements
- **Night Mode Icon**: Loaded missing PhosphorIcon `Moon` for the dynamic audio compressor/night mode toggle.

---

### 💾 Available Downloads
- ⭐ **`BlinkStream_1.4.1_Win_x64.exe`** *(Recommended — NSIS installer with automatic update support)*
- **`BlinkStream_1.4.1_Win_x64.msi`** *(Enterprise Windows MSI installer package)*
- **`BlinkStream_1.4.1_macOS_arm64.dmg`** *(Apple Silicon macOS Universal DMG)*
- **`BlinkStream_1.4.1_macOS_x64.dmg`** *(Intel macOS Universal DMG)*
- **`BlinkStream_1.4.1_Linux_x86_64.deb`** *(Debian / Ubuntu Linux Package)*
- **`BlinkStream_1.4.1_Linux_x86_64.AppImage`** *(Universal Linux AppImage)*
