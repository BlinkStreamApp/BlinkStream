# 🗺️ BlinkStream Official Product Roadmap

> *Engineering the future of high-performance, distraction-free desktop live streaming.*

Welcome to the official **BlinkStream Roadmap**. As an open-source engineering project built upon high-performance desktop native frameworks (Tauri, Vite, React, and Supabase), our mission is to deliver the cleanest, fastest, and most privacy-focused Twitch client ever conceived.

Below is our structured technical progression, detailing past milestones, our immediate release target, and upcoming enhancements across user experience (UI/UX) and core system functionality. We strictly adhere to sequential Semantic Versioning (SemVer).

---

## ✅ Phase 1: v1.1.x — Polish, Stability & Quality of Life [COMPLETED]
*Focus: Optimizing core architectures and introducing rapid QoL desktop workflows.*

### 🎨 UI & UX Improvements
- **Ultra-Clean Theatre Mode**: Minimalistic fullscreen overlay that auto-hides navigation controls and fades out unnecessary interface boundaries.
- **Collapsible Quick-Switcher Sidebar**: A responsive floating mini-dock showing real-time live avatars and view count badges of favorite followed channels for zero-friction switching.
- **Dynamic Theme Studio**: HSL color calibration toolkit allowing users to switch beyond standard Twitch Purple into custom themes (*Cyberpunk Yellow, Neon Cyan, Emerald Glow, and True OLED AMOLED Black*).

### ⚙️ Core Functionality
- **Intelligent Chat Anti-Spam Throttle**: Custom regular-expression and debounce engine to compress repetitive emoji flooding during massive tournament broadcasts.
- **Instant Highlight Snapshot**: One-click keyboard shortcut (`Ctrl + Shift + S`) to save uncompressed loss-less HD video frame snapshots directly to local disk.

---

## ✅ Phase 2: v1.2.x — Core Engine & Telemetry [COMPLETED]
*Focus: Rock-solid stability, HLS streaming fallback efficiency, and live diagnostics.*

### 🎨 UI & UX Improvements
- **Pro Telemetry Overlay ("Nerd Stats")**: Togglable HUD displaying real-time video resolution, HLS bitrate (Kbps), dropped frames count, and buffer latency.
- **Always-on-Top Floating Picture-in-Picture (PiP)**: A transparent, borderless floating mini-player designed to remain visible over full-screen video games or coding IDEs.

### ⚙️ Core Functionality
- **HLS Auto-Fallback & GraphQL Resilience**: Robust Twitch API interaction layer with token validation and error-tolerant playback stream reconstruction.
- **Local SQLite / Supabase Sync**: Real-time favorite channels and custom configuration persistence without relying on intrusive web telemetry.

---

## 🎯 Phase 3: v1.3.7 — The "Immersion & Command Center" Update (Hotfix) [CURRENT RELEASE]
*Focus: Multi-stream consumption, social chat interactivity, and dynamic glassmorphic player controls.*

### 🎨 UI & UX Improvements
- **Multi-Stream Grid Engine (Command Center)**: Simultaneously watch up to 4 live broadcasts on a unified responsive grid with independent audio mixing sliders—ideal for esports tournaments and collaborative creator events.
- **Redesigned Glassmorphism Quick Settings**: Sleek floating player gear panel allowing instant one-click toggles for Compact Mode, Audio-Only, Telemetry Stats, Overlay Chat, and Emote Effects without leaving the video.
- **Smart Chat Tabs Navigation**: Rapid switcher in the chatbox dividing messages into **💬 Todos**, **🔔 Menciones** (with real-time unread counter badge), and **⭐ Destacados** (Mods, VIPs, Bits, and Channel Points redemptions).

### ⚙️ Core Functionality
- **Real-Time Floating Emote Rain Engine**: Decoupled, high-performance particle overlay (`EmoteRainOverlay.jsx`) rendering incoming Twitch, 7TV, BetterTTV, and FFZ emotes gently floating across the player screen with a strict 20-particle RAM ceiling for zero gaming lag.
- **Neon Combo Meter HUD**: Automatic detection of chat emote burts (3+ repeats within 5 seconds), projecting dynamic tier badges onto the player HUD (*HYPERS COMBO*, *SUPER COMBO! 🔥*, and *GODLIKE COMBO! ⚡💀*).
- **User Mentions Neon Highlighting**: Automatic detection of `@username` tags, applying an amber/gold glowing border and gradient background to relevant messages.

---

## 📋 Phase 4: v1.4.x — Pro Mod View & Media Archive [NEXT MILESTONE]
*Focus: Desktop OS integration, professional moderation command center, and offline media saving.*

### 🎨 UI & UX Improvements
- **Pro Mod View (Centro de Mando para Moderadores)**: Workspace dedicado en cuadrícula multi-panel exclusivo para moderadores y broadcasters (`Ctrl + M` / Botón 🛡️):
  - **Live Stream & Chat Integrado**: Monitor de transmisión a baja latencia junto a chat enriquecido con botones rápidos de sanción por línea.
  - **Tarjeta de Inspección de Usuario (User Card Inspector)**: Al hacer clic en cualquier espectador se despliega historial de mensajes, antigüedad de cuenta, sanciones pasadas y botones de acción rápida (1s purga, 10m, 24h, Ban).
  - **Barra Superior de Acciones Rápidas (Quick Channel Actions)**: Toggles de 1 clic para Modo Escudo (Shield Mode), Modo Lento (Slow Mode), Solo Emotes, Solo Seguidores, Solo Suscriptores y Limpieza de Chat.
  - **Feed de Registro de Auditoría en Vivo (Mod Action Log)**: Registro cronológico en tiempo real de todas las acciones ejecutadas por otros moderadores y AutoMod.
  - **Lista de Moderadores Conectados**: Panel con los moderadores del equipo activos en la sesión actual.
- **Haptic Windows Toast Notifications (Smart Streamer Tracker)**: Real-time native OS desktop alerts triggered the exact millisecond a favorite channel goes live, featuring instant-click deep linking into the player.
- **Live / Offline Filter Toggle**: One-click quick filter on the favorite streamer sidebar to instantly isolate channels currently broadcasting.

### ⚙️ Core Functionality
- **VOD & Clip Archive Downloader**: Integrated high-speed asynchronous download manager supporting direct MP4 video downloading and background batch management for offline viewing and content editing.

---

## 📋 Phase 5: v1.5.x — Interactive Rewards & Automation
*Focus: Engaging with broadcast economies and peripheral integrations.*

### 🎨 UI & UX Improvements
- **Native Glassmorphism Polls & Predictions Widget**: Interactive popup banners integrated directly into the video player window, enabling instantaneous prediction bets and voting without having to scroll or open the chatbox.

### ⚙️ Core Functionality
- **Automated Twitch Drops Tracker & Claimer**: A clean background service monitoring active gaming campaign progress percentages and automatically executing inventory claims for in-game rewards.
- **Stream Deck & Macro Integration**: Customizable global keyboard hotkeys and HTTP endpoints to bind scene switches, mute controls, or prediction redemptions directly to external physical keypads.

---

## 🔮 Phase 6: v1.6.x — Smart Replays & Local Summaries
*Focus: Advanced playback synchronization and lightweight on-device AI intelligence.*

### 🎨 UI & UX Improvements
- **Customizable Chat Badges & Fonts**: Ability to apply custom typography from Google Fonts, scale line heights, and override standard chat badges with local PNG/WebP assets.
- **Bandwidth Saver Mode**: Automatic quality down-scaling (e.g., to 160p or Audio-Only) when the desktop window is minimized to the system tray to conserve bandwidth and CPU resources.

### ⚙️ Core Functionality
- **Time-Synchronized Offline Chat Replay**: Full historical chat playback synced precisely to timestamps when watching archived VODs or past stream highlights.
- **Local AI Stream Recap Engine**: Lightweight on-device processing (via Local LLM / Ollama bridges) to generate 3-bullet text summaries of stream highlights or intense chat segments missed while away from keyboard (AFK).

---

## 🌌 Phase 7: v2.0.0 — The Open Horizon (2027)
*Focus: Ecosystem expansion, ultimate platform portability, and breaking language barriers.*

### 🌐 Ecosystem & Platforms
- **Universal Linux & macOS Apple Silicon Support**: Official verified distribution bundles for Linux (AppImage/Flatpak) and native ARM64 Apple M-series architectures.
- **Mobile Wi-Fi Companion Remote**: Turn your smartphone or tablet into an instantaneous interactive wireless remote control for your living room BlinkStream desktop setup.

### 🔌 Extensibility & Next-Gen AI
- **Real-Time AI Live Translation & Subtitles Engine**: Advanced multi-lingual speech-to-text (Whisper/Silero VAD) and neural translation pipeline producing ultra-low-latency neon subtitle overlays directly over foreign broadcasts (e.g., English/Japanese ➔ Spanish).
- **BlinkStream Plugin & Widget SDK**: Secure sandboxed API empowering external developers to build custom overlay extensions and bot integrations natively inside the client.

---

## 🤝 Contributing to the Roadmap
This roadmap is an active, sequential document driven by developer insights and community feedback. If you wish to propose a feature or contribute:
1. Check our [GitHub Issues](https://github.com/BlinkStreamApp/BlinkStream/issues) for ongoing discussions.
2. Submit a feature request detailing technical specifications and UI/UX impact.
3. Fork the repository and open a Pull Request targeting active sequential milestones.
