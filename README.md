<p align="center">
  <img src="src/assets/logo.png" alt="BlinkStream" width="200">
</p>

<h1 align="center">BlinkStream</h1>

<p align="center">
  <strong>Cliente de escritorio para Twitch — multiplataforma, ligero y rápido</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-e94560" alt="Version">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0f3460" alt="Platform">
  <img src="https://img.shields.io/badge/built%20with-Tauri%20v2%20%2B%20React%2019-16213e" alt="Stack">
</p>

---

## ✨ Características

| Funcionalidad | Descripción |
|---------------|-------------|
| 📺 **Streams en vivo** | Reproducción de streams de Twitch con streamlink + ffmpeg |
| 🎬 **Clips** | Visualización de clips con calidad seleccionable |
| 📼 **VODs** | Reproducción de videos bajo demanda (VOD) |
| 💬 **Chat IRC** | Chat en tiempo real con soporte de emotes (BTTV, 7TV, FFZ) |
| 🔐 **Login OAuth** | Autenticación con Twitch vía Supabase Edge Functions |
| ⭐ **Favoritos** | Sigue canales y sincroniza con la nube |
| 👥 **Follows** | Importa tus canales seguidos de Twitch |
| 🔍 **Búsqueda** | Busca canales con autocompletado |
| 🖥️ **Info del stream** | Título, viewers, uptime, tags, juego |
| 🎭 **Modo teatro** | Experiencia inmersiva sin distracciones |
| 🎨 **UI responsive** | Adaptable de 800px a 1920px |
| 🌙 **Tema oscuro** | Diseño corporativo con paleta personalizada |
| ♿ **Accesibilidad** | aria-labels, contraste AA, fuentes legibles |
| 🔒 **CSP restrictivo** | Política de seguridad sin wildcards |
| 🚀 **Lazy loading** | Chat y reproductor cargan bajo demanda |
| 💾 **Cache inteligente** | sessionStorage con TTL para carga instantánea |

---

## 📦 Instalación

### Windows
Descarga el instalador desde [Releases](https://github.com/TU_USUARIO/blinkstream/releases):
- `BlinkStream_1.0.0_x64-setup.exe` (NSIS)
- `BlinkStream_1.0.0_x64_en-US.msi`

### macOS
```bash
brew install streamlink
# Descarga BlinkStream.dmg desde Releases
```

### Linux (Ubuntu/Debian)
```bash
sudo apt install streamlink
# Descarga BlinkStream.deb desde Releases
```

---

## 🔨 Compilar desde código

### Requisitos
- **Node.js** 18+
- **pnpm** 9+
- **Rust** 1.77+
- **streamlink** (instalado en el PATH)

### Windows
```bash
winget install Streamlink.Streamlink
pnpm install
pnpm build
cargo tauri build
```

### macOS
```bash
brew install streamlink
pnpm install
pnpm build
cargo tauri build
```

### Linux
```bash
sudo apt install streamlink libwebkit2gtk-4.1-dev libgtk-3-dev
pnpm install
pnpm build
cargo tauri build
```

### CI/CD (GitHub Actions)
El workflow `.github/workflows/release.yml` compila automáticamente para Windows, macOS ARM, macOS Intel y Linux en cada push a master.

---

## 🏗️ Arquitectura

```
blinkstream/
├── src/                     # Frontend React + Tailwind
│   ├── components/          # 15 componentes JSX
│   │   ├── HomeScreen.jsx   # Menú principal (grid, carousel, sidebar)
│   │   ├── VideoPlayer.jsx  # Reproductor HLS.js + controles
│   │   ├── Chat.jsx         # IRC + BTTV/7TV/FFZ
│   │   ├── StreamInfo.jsx   # Metadata del stream
│   │   └── ...
│   ├── hooks/               # useAuth, useLiveAlerts
│   └── utils/               # Supabase, Twitch API, i18n
├── src-tauri/               # Backend Rust (Tauri v2)
│   ├── src/
│   │   ├── lib.rs           # Comandos Tauri, streamlink, single-instance
│   │   └── main.rs          # Entrypoint
│   ├── Cargo.toml           # Dependencias Rust (~14 crates)
│   └── tauri.conf.json      # Configuración Tauri + CSP + bundle
└── .github/workflows/       # CI/CD
    └── release.yml          # Build multiplataforma automático
```

---

## 🔧 Stack técnico

| Capa | Tecnología |
|------|-----------|
| **Desktop shell** | Tauri v2.11 |
| **Frontend** | React 19 + Tailwind CSS 3 |
| **Backend** | Rust 1.77 (tokio async) |
| **Empaquetado** | Vite 8 |
| **Streaming** | HLS.js + streamlink + ffmpeg |
| **Auth** | Supabase Edge Functions + Twitch OAuth |
| **Chat** | WebSocket IRC (wss://irc-ws.chat.twitch.tv) |
| **CI/CD** | GitHub Actions (Windows, macOS, Linux) |

---

## 📊 Métricas

| Indicador | Valor |
|-----------|-------|
| **Instalador Windows** | 3.7 MB (NSIS) / 5.3 MB (MSI) |
| **Bundle JS inicial** | 277 KB (853 KB con lazy chunks) |
| **Dependencias Rust** | 14 crates |
| **Componentes React** | 15 |
| **Cobertura CSP** | 9 directivas, 0 wildcards |
| **Defectos Vigía** | 0 críticos · 0 altos · 0 medios · 0 bajos |

---

## 📄 Licencia

MIT © BlinkStream Team

---

<p align="center">
  <sub>Built with Tauri v2, React 19, and Rust. No cloud APIs. No bloat.</sub>
</p>
