# 🗺️ BlinkStream Official Product Roadmap

> *Engineering the future of high-performance, distraction-free desktop live streaming.*

Welcome to the official **BlinkStream Roadmap**. Built upon high-performance desktop native frameworks (Tauri v2 in Rust, React 19, Tailwind CSS and Supabase), our mission is to deliver the cleanest, fastest, and most privacy-focused Twitch desktop client ever conceived.

We strictly follow sequential Semantic Versioning (SemVer).

---

## ✅ Phase 1: v1.1.x — Polish, Stability & Quality of Life [COMPLETED]
*Focus: Optimizing core architectures and introducing rapid QoL desktop workflows.*

### 🎨 UI & UX Improvements
- **Ultra-Clean Theatre Mode**: Minimalistic fullscreen overlay that auto-hides navigation controls and fades out interface boundaries (`T`).
- **Collapsible Quick-Switcher Sidebar**: Floating mini-dock showing real-time live avatars and viewer badges for zero-friction switching.
- **Dynamic Theme Studio**: HSL color calibration toolkit (*Cyberpunk Yellow, Neon Cyan, Emerald Glow, and True OLED AMOLED Black*).

### ⚙️ Core Functionality
- **Intelligent Chat Anti-Spam Throttle**: Regex & debounce engine to compress repetitive emoji flooding during massive events.
- **Instant Highlight Snapshot**: One-click keyboard shortcut (`Ctrl + Shift + S`) to save loss-less HD video frames directly to disk.

---

## ✅ Phase 2: v1.2.x — Core Engine & Telemetry [COMPLETED]
*Focus: Rock-solid stability, HLS streaming fallback efficiency, and live diagnostics.*

### 🎨 UI & UX Improvements
- **Pro Telemetry Overlay ("Nerd Stats")**: Togglable HUD displaying resolution, HLS bitrate (Kbps), dropped frames, and buffer latency.
- **Always-on-Top Floating Picture-in-Picture (PiP)**: Transparent, borderless floating mini-player.

### ⚙️ Core Functionality
- **HLS Auto-Fallback & GraphQL Resilience**: Robust Twitch API interaction layer with token validation and error-tolerant stream reconstruction.
- **Local SQLite / Supabase Sync**: Real-time favorite channels and custom configuration persistence with offline circuit-breaker.

---

## ✅ Phase 3: v1.3.x — The "Immersion & Command Center" Update [COMPLETED]
*Focus: Multi-stream consumption, social chat interactivity, and dynamic glassmorphic player controls.*

### 🎨 UI & UX Improvements
- **Multi-Stream Grid Engine (Command Center)**: Simultaneously watch up to 4 broadcasts with independent audio mixing sliders.
- **Glassmorphic Quick Settings**: Floating player gear panel for instant toggles without leaving the stream.
- **Smart Chat Tabs Navigation**: Message switcher dividing chat into **💬 Todos**, **🔔 Menciones** (unread badge), and **⭐ Destacados** (Mods, VIPs, Bits, Rewards).

### ⚙️ Core Functionality
- **Real-Time Floating Emote Rain Engine**: Decoupled particle overlay rendering Twitch, 7TV, BTTV, and FFZ emotes (strict 20-particle limit).
- **Neon Combo Meter HUD**: Automatic detection of chat emote bursts (*HYPERS COMBO*, *SUPER COMBO! 🔥*, *GODLIKE COMBO! ⚡💀*).
- **Mobile Wi-Fi Remote Companion**: Local HTTP/WebSocket pairing server to control playback and volume from smartphones/tablets.

---

## ✅ Phase 4: v1.4.0 — Pro Mod View, Channel Points PubSub & Multi-Window [CURRENT RELEASE]
*Focus: Professional multi-dock moderation workspace, 100% Channel Points PubSub detection, 8-language localization, and flawless Tauri WebView2 child window integration.*

### 🎨 UI & UX Improvements
- **Pro Mod View 2.0 (Centro de Mando para Moderadores)**:
  - **Live Stream & Chat Integrado**: Acciones de moderación directas por mensaje (`1s purga`, `10m timeout`, `ban`).
  - **Inspector de Usuario (User Card Inspector)**: Antigüedad de cuenta, historial de sanciones y mensajes previos.
  - **Barra Superior de Acciones Rápidas con Selectores Pill Horizontales**: Toggles de 1 clic para Modo Escudo, Modo Lento (`Off`, `3s`, `10s`, `30s`, `60s`, `120s`), Solo Emotes, Solo Seguidores (`Todos`, `0m`, `10m`, `30m`, `1d`), Solo Suscriptores y Vaciar Chat.
  - **Feed de Actividad en Tiempo Real**: Deduplicación inteligente entre avisos IRC y eventos PubSub.
  - **Distribución Modular Personalizable**: Cuadrícula reconfigurable con persistencia local.
- **Global Localization (8 Idiomas)**: Traducción completa en Español (`es`), Inglés (`en`), Francés (`fr`), Alemán (`de`), Portugués (`pt`), Japonés (`ja`), Coreano (`ko`) y Ruso (`ru`).
- **IRC Real-Time Badges & User Color**: Renderizado inmediato de insignias oficiales y colores de usuario.

### ⚙️ Core Functionality
- **Twitch PubSub WebSocket Engine (`wss://pubsub-edge.twitch.tv`)**:
  - Detección instantánea del 100% de canjes de Puntos de Canal (`community-points-channel-v1`), tanto con texto (TTS, mensajes) como sin texto (alertas sonoras, emotes, hidratación).
  - Panel de gestión de recompensas Helix con mitigación automática de errores 403.
- **Gestión Nativa de Ventanas WebView2 en Windows**:
  - Chat popout desacoplable a ventana independiente (*Always-on-Top*).
  - Coordinación perfecta con modales (Settings, About): ocultación fuera de pantalla y restauración milimétrica de coordenadas `(x, y)` y tamaño sin bloqueos ni pantallas negras.
- **Ultra-Low Latency Pipeline (LL-HLS)**: Flags `--twitch-low-latency` y `--hls-live-edge 1` con auto-recuperación 1.2x.

---

## 🎯 Phase 5: v1.5.0 — Moderation Suite, Predictions, Live DVR & Media Tools [NEXT IMMEDIATE MILESTONE]
*Focus: Advanced mod feed filtering, interactive prediction widgets, hotkeys, live DVR timeline, and acoustic comfort compression.*

### 🎨 UI & UX Improvements
- **🌟 Feed de Actividad Avanzado**:
  - Píldoras de filtro en vivo: `[ Todos ]` `[ 💎 Canjes ]` `[ ⭐ Subs & Raids ]` `[ 🛡️ Moderación ]`.
  - Contador de sesión: Indicador visual en tiempo real de puntos acumulados / canjeados (ej. `💎 13,450 pts hoy`).
  - Búsqueda instantánea de usuarios o recompensas en el historial.
- **🎲 Widget de Predicciones y Encuestas en Vivo (Predictions & Polls)**:
  - Creación y gestión en 1 clic de apuestas/votaciones desde Mod View sin abrir la web de Twitch.
  - Barras dinámicas de porcentajes y puntos apostados en tiempo real.
  - Declaración de opción ganadora o cancelación con devolución de puntos.
- **⌨️ Hotkeys & Shortcuts Globales**:
  - `Ctrl + Shift + S`: Activar / Desactivar Modo Escudo.
  - `Ctrl + Shift + C`: Vaciar chat del canal.
  - `Espacio` / `K`: Pausar scroll del chat para lectura rápida.
  - `M`: Silenciar / Activar sonido instantáneo.
- **Overlay Gamer Transparente (Click-Through Chat HUD)**: Mini-ventana translúcida para jugar en pantalla completa sin interrumpir clics.
- **Live Stream Rewind & DVR Timeline**: Rebobinado instantáneo en buffer RAM (`J`/`K`/`L`) y rebobinado completo con botón `[🔴 EN VIVO]`.

### ⚙️ Core Functionality
- **🔊 Alertas Visuales y Sonoras de Moderación**: Notificaciones acústicas sutiles configurables ante canjes prioritarios o picos inusuales de actividad.
- **Modo Nocturno / Compresor de Audio (Loudness Equalizer)**: Compresión de rango dinámico por software (Web Audio API) para amortiguar gritos y explosiones y amplificar diálogos suaves.
- **Audio Estéreo Separado en Multi-Stream**: Enrutado binaural (Canal 1 a oído izquierdo, Canal 2 a oído derecho).
- **Automated Twitch Drops Tracker & Auto-Claimer**: Monitor de campañas de Drops con progreso y reclamo automático.
- **Descargador de VODs y Clips con Recorte Temporal**: Descarga en MP4 seleccionando marcas de inicio y fin (*ej. min 12:30 al 18:45*).

---

## 📋 Phase 6: v1.6.0 — Chat Translator, Discord RPC & Ecosystem [PLANNED]
*Focus: Real-time translation, peripheral integration, and automated community engagement.*

### 🎨 UI & UX Improvements
- **Traductor en Vivo de Chat Multilingüe**: Traducción en tiempo real de mensajes a tu idioma nativo con un solo clic.
- **Tipografías y Badges Personalizables**: Integración de fuentes Google Fonts, interlineado y reemplazo de iconos estándar.
- **Bandwidth Saver Mode**: Reducción automática a 160p o solo audio al minimizar a la bandeja del sistema.

### ⚙️ Core Functionality
- **🎮 Discord Rich Presence (RPC)**:
  - Estado detallado en Discord con canal, categoría/juego, carátula y botón interactivo *"Ver en BlinkStream"*.
- **🎛️ Plugin Oficial para Elgato Stream Deck**:
  - Acciones físicas en hardware: cambio de canal, silenciar, activar PiP, lanzar canjes de puntos y activar Modo Escudo.
- **Asistente Automatizado de Puntos de Canal**: Reglas de apuesta inteligentes para pronósticos.
- **Historial de Chat Sincronizado en VODs (Time-Synced Replay)**: Reproducción del chat original alineado al segundo exacto.

---

## 🌌 Phase 7: v2.0.0 — On-Device AI Intelligence & Global Overlays [HORIZON]
*Focus: Lightweight on-device intelligence, OBS integration, and multi-platform broadcasting.*

### 🧠 On-Device AI & Analytics
- **Resumen Inteligente "Me lo perdí" (AFK Catch-Up)**: Resumen en 3 viñetas de lo ocurrido en el directo durante una pausa mediante modelos locales (Ollama / LLM local).
- **Detector de Momentos Épicos (Climax Heatmap)**: Gráfica de calor sobre la barra temporal detectando picos de emotes (`POGGERS`, `KEKW`, `LUL`).
- **Subtítulos y Traducción de Voz en Directo con IA**: Transcripción a ultra-baja latencia con Whisper/Silero VAD.

### 🔌 Extensibility & Overlays
- **🎨 Plugins y Overlays para OBS**:
  - Exportación de fuentes de navegador (Browser Sources) generadas por BlinkStream para streamers (alertas de canjes, chat overlay limpio).
- **🌐 Compatibilidad Multi-Plataforma**:
  - Soporte integrado para Kick y YouTube Live dentro del mismo panel Multi-Stream y Chat unificado.
- **📊 Panel de Estadísticas en Vivo**:
  - Gráficas de espectadores, velocidad de chat y canjes más populares de la sesión.
- **Distribución Universal**: Paquetes oficiales para Flatpak y Homebrew.
