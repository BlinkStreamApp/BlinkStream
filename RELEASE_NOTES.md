## 🚀 What's New in Version 1.3.1 (Hotfix & The Immersion Update)

A targeted Hotfix release addressing UI/UX improvements, resolution selector additions, and critical component fixes, building on top of our monumental Immersion & Command Center Update!

### 🔧 v1.3.1 Hotfix & Bug Fixes
- **OAuth & Helix Authentication Loop Fix:** Engineered a robust dynamic OAuth Client ID auto-discovery mechanism (`getHelixClientId`) utilizing Twitch's official token validation endpoint. This eliminates false-positive HTTP 401 errors during session validation and permanently prevents automatic session logouts when launching standalone build binaries.
- **Channel Points Redeem Modal Z-Index Fix:** Resolved an issue where reward redemption modals appeared blurred or behind side panels by elevating modal layer stacking (`z-[999999]`) across `RedeemModal.jsx`, `RewardForm.jsx`, and `ActionModal.jsx`.
- **Expanded Pro Resolution Support:** Added official native dropdown support for modern high-bitrate streaming resolutions including **1440p60 (2K)**, **963p60**, and **936p60**. Relocated and integrated the Quality Selector directly inside the Player Settings menu.
- **Ultra-Compact eSports Player Settings Menu:** Complete UI overhaul of the video player settings gear panel (`w-64`, single-line rows, scrollable max-height) to prevent oversized layouts or cropped headers on smaller player windows.
- **WiFi LAN Remote Responsive Alignment:** Fixed window wrapping and responsive layout clipping in the WiFi Remote Control pairing screen.
- **Emote Rain & Metadata Correction:** Fixed bottom static positioning of floating emotes and restored robust Stream Live Metadata parsing across Twitch GQL endpoints.

### 🌧️ Real-Time Emote Rain & Dynamic Combo Meters
- **Live Emote Floating FX:** Emotes from Twitch, 7TV, BTTV, and FFZ magically bubble up across your video player in real-time. Engineered with strict RAM cap protections (max 20 active particles) to ensure **0% FPS drop or latency while gaming**.
- **Neon Combo Breakers:** Automated high-frequency burst detection in chat triggers vibrant neon-charged alerts on screen: **HYPERS COMBO**, **SUPER COMBO**, and **GODLIKE COMBO**.
- **Amber Mention Highlights:** Instantaneous millisecond detection of your username in chat, lighting up your personal mentions with an elegant golden glow and warm drop-shadow.

### 🔔 Smart Chat Tabs & Multi-Stream Command Grid
- **Intelligent Chat Navigation Bar:** Seamlessly filter and switch between **All Messages**, **@Mentions** (featuring a live unread badges counter), and **⭐ Featured Events** with a single click.
- **Multi-Stream Grid:** Monitor up to 4 simultaneous live broadcasts with independent audio mixer controls—the ultimate layout for esports tournaments and speedrun restreaming.

### 🛡️ Verified Stability & Automated Update System
- **100% Passing Test Suite:** Fully verified against our rigorous automated test harness (**296 tests passing** across moderation, encryption, recording, and chat engines).
- **OTA Auto-Updater Ready:** Configured with secure cryptographic signature verification via `updater.json` for background over-the-air updates.

### 💾 Available Downloads
- ⭐ **`BlinkStream-Setup_1.3.1_Custom.exe`** *(Recommended — 100% Custom Twitch-themed bootstrapper setup with Custom Directory Selector)*
- **`BlinkStream_1.3.1_Win_x64.exe`** *(Standard silent NSIS setup)*
- **`BlinkStream_1.3.1_Win_x64.msi`** *(Enterprise Windows MSI installer package)*
- **`BlinkStream_1.3.1_macOS_arm64.dmg`** *(Apple Silicon macOS Universal DMG)*
- **`BlinkStream_1.3.1_macOS_x64.dmg`** *(Intel macOS Universal DMG)*
- **`BlinkStream_1.3.1_Linux_x86_64.deb`** *(Debian / Ubuntu Linux Package)*
- **`BlinkStream_1.3.1_Linux_x86_64.AppImage`** *(Universal Linux AppImage)*
