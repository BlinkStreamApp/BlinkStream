# 🗺️ BlinkStream Official Product Roadmap

> *Engineering the future of high-performance, distraction-free desktop live streaming.*

Welcome to the official **BlinkStream Roadmap**. As an open-source engineering project built upon high-performance desktop native frameworks (Tauri v2 in Rust, React 19, and Supabase), our mission is to deliver the cleanest, fastest, and most privacy-focused Twitch client ever conceived.

Below is our structured technical progression, detailing completed milestones, immediate release targets, and upcoming enhancements across user experience (UI/UX) and core system functionality. We strictly adhere to sequential Semantic Versioning (SemVer).

---

## ✅ Phase 1: v1.1.x — Polish, Stability & Quality of Life [COMPLETED]
*Focus: Optimizing core architectures and introducing rapid QoL desktop workflows.*

### 🎨 UI & UX Improvements
- **Ultra-Clean Theatre Mode**: Minimalistic fullscreen overlay that auto-hides navigation controls and fades out unnecessary interface boundaries (`T`).
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

## ✅ Phase 3: v1.3.x — The "Immersion & Command Center" Update [COMPLETED]
*Focus: Multi-stream consumption, social chat interactivity, and dynamic glassmorphic player controls.*

### 🎨 UI & UX Improvements
- **Multi-Stream Grid Engine (Command Center)**: Simultaneously watch up to 4 live broadcasts on a unified responsive grid with independent audio mixing sliders—ideal for esports tournaments and collaborative creator events.
- **Redesigned Glassmorphism Quick Settings**: Sleek floating player gear panel allowing instant one-click toggles for Compact Mode, Audio-Only, Telemetry Stats, Overlay Chat, and Emote Effects without leaving the video.
- **Smart Chat Tabs Navigation**: Rapid switcher in the chatbox dividing messages into **💬 Todos**, **🔔 Menciones** (with real-time unread counter badge), and **⭐ Destacados** (Mods, VIPs, Bits, and Channel Points redemptions).

### ⚙️ Core Functionality
- **Real-Time Floating Emote Rain Engine**: Decoupled, high-performance particle overlay (`EmoteRainOverlay.jsx`) rendering incoming Twitch, 7TV, BetterTTV, and FFZ emotes gently floating across the player screen with a strict 20-particle RAM ceiling for zero gaming lag.
- **Neon Combo Meter HUD**: Automatic detection of chat emote bursts (3+ repeats within 5 seconds), projecting dynamic tier badges onto the player HUD (*HYPERS COMBO*, *SUPER COMBO! 🔥*, and *GODLIKE COMBO! ⚡💀*).
- **User Mentions Neon Highlighting**: Automatic detection of `@username` tags, applying an amber/gold glowing border and gradient background to relevant messages.
- **Mobile Wi-Fi Remote Companion**: Integrated local HTTP/WebSocket pairing server to control player playback, volume, and channels directly from any smartphone or tablet on the same Wi-Fi network.

---

## ✅ Phase 4: v1.4.0 — Pro Mod View, Global Localization & Ultra-Low Latency [CURRENT RELEASE]
*Focus: Professional multi-dock moderation workspace, 8-language localization, live IRC badge rendering, and LL-HLS real-time sync.*

### 🎨 UI & UX Improvements
- **Pro Mod View Workspace (Centro de Mando para Moderadores)**: Workspace profesional multi-panel con layout personalizable (`Ctrl + M` / Botón 🛡️):
  - **Live Stream & Chat Integrado**: Monitor de transmisión con acciones directas de moderación por mensaje (`1s purga`, `10m timeout`, `ban`).
  - **Tarjeta de Inspección de Usuario (User Card Inspector)**: Historial completo de mensajes recientes, antigüedad de cuenta, historial de sanciones y botones de acción rápida.
  - **Barra Superior de Acciones Rápidas (Quick Channel Actions)**: Toggles de 1 clic para Modo Escudo (Shield Mode), Modo Lento (Slow Mode), Solo Emotes, Solo Seguidores, Solo Suscriptores y Limpieza de Chat.
  - **Feed de Registro de Auditoría en Vivo (Mod Action Log)**: Registro cronológico en tiempo real con filtrado de acciones de moderación y AutoMod.
  - **Espectadores & Mods Activos**: Lista en vivo con detección automática de moderadores, VIPs y espectadores en chat.
  - **Cola de AutoMod & Apelaciones de Desbaneo**: Aprobación/rechazo de mensajes retenidos y resolución de solicitudes de desbaneo con notas oficiales.
  - **Predicciones & Encuestas en Vivo**: Monitorización y creación de apuestas y votaciones vía GraphQL y Helix.
  - **Cola de Recompensas de Puntos**: Gestión y cumplimiento en vivo de solicitudes de puntos de canal.
- **IRC Real-Time Badges & User Color Rendering**: Renderizado inmediato y optimista de insignias reales de Twitch (Suscriptor, Mod, VIP, Broadcaster, Prime, Turbo, Fundador) y color de usuario personalizado al enviar mensajes.
- **Global Localization (8 Idiomas)**: Traducción completa e integral de toda la interfaz en Español (`es`), Inglés (`en`), Francés (`fr`), Alemán (`de`), Portugués (`pt`), Japonés (`ja`), Coreano (`ko`) y Ruso (`ru`).
- **Telemetry HUD Renovado**: Métricas independientes para Latencia en Vivo (segundos respecto al streamer) y Buffer de RAM precargado.

### ⚙️ Core Functionality
- **Ultra-Low Latency Pipeline (LL-HLS)**: Flags `--twitch-low-latency` y `--hls-live-edge 1` en Streamlink para sincronización instantánea con el directo, auto-aceleración suave a 1.2x tras micro-cortes y botón interactivo `● LIVE` para resincronización en 1 clic.
- **Haptic Windows Toast Notifications**: Alertas nativas de escritorio con detección en tiempo real de directos iniciados por creadores favoritos.

---

## 🎯 Phase 5: v1.5.x — Live Stream DVR, Media Snipping & Loudness Equalizer [NEXT IMMEDIATE MILESTONE]
*Focus: Live stream rewinding, media clipping, and acoustic comfort compression.*

### 🎨 UI & UX Improvements
- **Live Stream Rewind & DVR Timeline**: Barra de tiempo interactiva con soporte de rebobinado en vivo:
  - **Rebobinado Corto Instantáneo (Buffer RAM)**: Saltos de 10s a 2 minutos con 0 ms de latencia mediante atajos (`J`, `K`, `L` o flechas).
  - **Rebobinado Completo del Directo (Live VOD Sync)**: Acceso a la emisión completa desde el minuto 0 con botón instantáneo `[🔴 EN VIVO]` para regresar al directo en tiempo real.
- **Audio Estéreo Separado en Multi-Stream (Binaural Mode)**: Posibilidad de enviar el canal 1 al auricular izquierdo y el canal 2 al derecho, o enrutar canales distintos a diferentes dispositivos de audio (ej. altavoces vs auriculares).
- **Overlay Gamer Transparente (Click-Through Chat HUD)**: Mini-ventana semitransparente que se superpone sobre cualquier videojuego en pantalla completa con modo `click-through` (los clics del ratón atraviesan el chat sin interrumpir la partida).

### ⚙️ Core Functionality
- **Modo Nocturno / Compresor de Rango Dinámico (Loudness Equalizer)**: Compresión de audio por software (Web Audio API) que atenúa automáticamente gritos o explosiones repentinas y amplifica diálogos suaves para ver transmisiones de noche sin sobresaltos.
- **Descargador de VODs y Clips con Recorte de Tiempo (Time-Range Snipping)**: Descarga directa en MP4 a máxima velocidad permitiendo seleccionar fragmentos específicos (ej. *minuto 45:00 al 52:30*) sin tener que descargar archivos masivos de 8 horas.
- **Automated Twitch Drops Tracker & Inventory Claimer**: Servicio en segundo plano que monitoriza campañas activas de Drops de videojuegos, muestra el % de progreso y reclama las recompensas automáticamente.

---

## 📋 Phase 6: v1.6.x — Chat Translator, Discord & Prediction Automation [PLANNED]
*Focus: Breaking language barriers, peripheral macros, and automated engagement.*

### 🎨 UI & UX Improvements
- **Traductor en Vivo de Chat Multilingüe**: Botón en el chat para traducir mensajes entrantes en tiempo real de cualquier idioma a tu idioma nativo configurado.
- **Customizable Chat Badges & Fonts**: Tipografías avanzadas de Google Fonts, escala de interlineado y reemplazo de insignias estándar con iconos locales de alta resolución.
- **Bandwidth Saver Mode**: Reducción automática de calidad a 160p o Solo Audio cuando la ventana de BlinkStream se minimiza a la bandeja del sistema.

### ⚙️ Core Functionality
- **Discord Rich Presence & Stream Deck Integration**:
  - Estado interactivo en Discord mostrando canal, juego y tiempo con botón *"Ver en BlinkStream"*.
  - Plugin oficial para Stream Deck (cambio de canal, mute, PiP, captura de pantalla y canjes con teclas físicas).
- **Asistente Automatizado de Puntos de Canal**: Reglas de apuesta inteligentes para pronósticos (*ej. "apostar siempre 250 puntos a la opción más votada"*).
- **Historial de Chat Sincronizado en VODs (Time-Synced Replay)**: Reproducción del chat original sincronizado al milisegundo al visualizar grabaciones o clips pasados.

---

## 🌌 Phase 7: v2.0.0 — On-Device AI Intelligence & Global Ecosystem [2027 HORIZON]
*Focus: Lightweight on-device intelligence, climax analytics, and sandboxed plugin architectures.*

### 🧠 On-Device AI & Analytics
- **Resumen Inteligente "Me lo perdí" (AFK Catch-Up)**: Procesamiento local ligero (vía Ollama / LLM bridges on-device) para generar un resumen en 3 viñetas de lo ocurrido en el directo y en el chat tras regresar de una pausa.
- **Detector de Momentos Épicos (Climax Heatmap)**: Análisis en tiempo real de la densidad de spam de emotes de emoción (`POGGERS`, `KEKW`, `LUL`) dibujando picos de clímax sobre la barra de tiempo.
- **Subtítulos y Traducción de Voz en Directo con IA**: Transcripción de voz a texto a ultra-baja latencia (Whisper/Silero VAD) generando subtítulos neón flotantes sobre directos en idiomas extranjeros.

### 🔌 Extensibility & Ecosystem
- **BlinkStream Plugin & Widget SDK**: API segura y aislada (sandboxed) para que la comunidad desarrolle plugins, overlays y bots personalizados dentro del cliente.
- **Distribución Universal Flatpak / Homebrew**: Soporte para repositorios oficiales de paquetes en los principales ecosistemas de escritorio.

---

## 🤝 Contributing to the Roadmap
This roadmap is an active, sequential document driven by developer insights and community feedback. If you wish to propose a feature or contribute:
1. Check our [GitHub Issues](https://github.com/BlinkStreamApp/BlinkStream/issues) for ongoing discussions.
2. Submit a feature request detailing technical specifications and UI/UX impact.
3. Fork the repository and open a Pull Request targeting active sequential milestones.
