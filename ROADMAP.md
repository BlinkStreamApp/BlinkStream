# 🗺️ BlinkStream Official Product Roadmap

> *Engineering the future of high-performance, distraction-free desktop live streaming.*

Welcome to the official **BlinkStream Roadmap**. Built upon high-performance desktop native frameworks (Tauri v2 in Rust, React 19, Tailwind CSS and Supabase), our mission is to deliver the cleanest, fastest, and most privacy-focused Twitch desktop client ever conceived.

We use ordered version numbers: consecutive PATCH releases for tested compatible
fixes and incremental improvements; larger MINOR milestones are agreed separately.

## Execution status — 2026-10-25 / v1.5.4 release candidate

1.5.4 normalizes fresh/legacy Mod View settings, requests H.264/HEVC/AV1 consistently
and uses the official Twitch web session only after validating that it belongs to
the same signed-in account. Playback errors are distinguished from recording errors.
Local regression tests do not establish real-account 1440p playback: candidate
acceptance is required before publication. Public downloads/updater remain 1.5.3.

1.5.3 hardens OAuth handoff access, expiry, immutable identity and session lifecycle.
The database fix and twitch-auth v38 are deployed. GitHub downloads/updater are
verified at 1.5.3: all 15 public files match tag CI and SHA-256 digests, and all
four updater signatures verify. Candidate CI `39793015683` passed before tag
publication `39796091712`. Microsoft Store remains on 1.5.2; its submission is separate.

GitHub 1.5.2 is published with native session chat search, eight-language controls
and the unused ZIP extractor removed for security. Microsoft Store 1.5.2 was
subsequently confirmed by the maintainer.

The historical phases below describe product direction, not proof of a published release.
Microsoft Store 1.5.1 is published, confirmed by the maintainer: customizable collections, account-scoped category preferences, translations, security hardening and the Windows icon fix. GitHub [1.5.0](https://github.com/BlinkStreamApp/BlinkStream/releases/tag/v1.5.0) and [1.5.1](https://github.com/BlinkStreamApp/BlinkStream/releases/tag/v1.5.1) are published with separate ES/EN notes, signed four-target builds and independently verified public artifacts. Latest GitHub/downloads/updater: [1.5.3](https://github.com/BlinkStreamApp/BlinkStream/releases/tag/v1.5.3). The Store taskbar fix includes transparent light/dark target-size variants, DPI assets and a compiled resource index. The maintainer handles Partner Center.
Release CI `38924898662` (1.5.0), `38925125890` (1.5.1) and `39060821359` (1.5.2) passed all gates. All 15 public 1.5.2 files match CI bytes and GitHub SHA-256 digests; four updater signatures independently verify. Candidate `39059837052` passed before the failed unpublished tag was recreated with explicit authorization.
Signed builds are available for Windows x64, macOS Intel/Apple Silicon and Linux x64.
The update adds category discovery, UI polish and unified grid chat, retaining account-scoped favorites/follows, logout cleanup and approved branding.
Windows logout/welcome and real Twitch follow/unfollow refresh were accepted by the user.
Small corrections use patch releases; see [hotfix policy](docs/guides/HOTFIX_RELEASES.md).
Implementation, real-session validation and publication are separate gates.
The current execution order and acceptance criteria are in [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md).

| Capability | Local status | Remaining validation |
| --- | --- | --- |
| Session cleanup / follows / branding | Released in 1.4.3; Windows logout, welcome and live follow/unfollow refresh accepted by the user | Broader cross-platform desktop session checks |
| Categories / UI / unified grid chat | Published in 1.4.4; category/grid polish accepted, 623 frontend tests pass and signed multiplatform CI passes | Live chat sending and independent native/audio acceptance remain separate checks |
| Gamer HUD, night audio compressor, predictions/polls, media trimming | Implementation exists | Permissions, real desktop behavior and integration regression checks |
| Live DVR | Seeks within the available player range | Buffer bounds, discontinuities and return to live; no full-stream rewind guarantee |
| Drops inventory | Native sync and embedded official inventory; panel/polish accepted by Windows user on 2026-10-07 | Other platforms and separate login/linking scenarios |
| Drops watch minutes / auto-claim | Remote minute progression and manual claim observed; opt-in reporting and persistent pause on uncertainty | Isolated pause/session tests and separately documented automatic click/claim |
| Custom reward events | EventSub implemented; automated lifecycle tests pass | Authorized creator session, real redemption and native CSP |
| Keyboard shortcuts / Drops focus | Interactive-control/modal isolation and focus regressions pass; Drops polish accepted by user | Other dialogs, screen readers and configurable/OS-global shortcuts |
| Channel search | Stale-response cancellation and dismissal regressions pass | Broader keyboard/accessibility coverage |
| Auto-updater | 1.5.1 published/latest; four public updater artifacts independently verified; manifest matches the release; Windows install/reinstall/restart smoke passes | Historical trust migration and authenticated settings persistence remain limited; Linux integrated updates require AppImage |
| Dependency security | Six original alerts closed by GitHub; npm audit clean; GLib backport passes optimized regressions and Linux bundles | Retire vendor when upstream compatibility permits (ADR-014) |

Validation: 623 frontend tests pass, one skipped; 56 Rust Windows tests and 19 release/signature/documentation tests pass locally. Lint/legacy/fmt/Clippy, optimized GLib tests, signed four-target builds and NSIS smoke pass CI. See [updater verification](docs/guides/UPDATER_VERIFICATION.md).

Now: 1.5.1 published on Store and GitHub; GitHub download/update artifacts verified.
Next: 1.5.x session chat search, hidden channels and collection refinements, then 1.6 VOD/workspaces/media. Outstanding real-session latency and Twitch checks remain tracked separately.
Then: 1.7 moderation, 1.8 integrations and 1.9 consolidation.
2.0 centers on a complete interface redesign; AI, additional platforms and plugins remain conditional.

---

## Playback latency — included in Store 1.5.0

- **Lower live video latency:** implemented locally in the main player and multistream grid. Shared HLS target of 2 seconds, bounded catch-up at 1.1× and removal of the competing manual live controller; preload buffers remain unchanged and manual DVR/pause disable catch-up.
- **User evidence (2026-10-13):** main-player screenshot shows 2.5 seconds latency and 2.3 seconds buffer; the user accepts this result. This is one observed Twitch session, not a guaranteed latency across channels/networks.
- **Validation:** 632 frontend tests pass/one skipped, 19 release/documentation tests, lint/legacy and local Windows build pass. Live grid, pause/DVR and sustained stability checks remain pending, alongside signed cross-platform release CI.
- **Delivery:** included in the 1.5.0 baseline and current 1.5.1 distributions on Store and GitHub. The formerly planned 1.4.5 label is superseded, not a separate published release. Existing VOD/workspace priorities are unchanged.

## 1.4.4 delivery — Category discovery and UI (2026-10-13)

- **Goal:** find the right Twitch category/direct stream without confusing stale results or failed requests with an empty list.
- **First delivery (accepted by the user):** category search, paginated popular/search results, language-filtered live streams, clear selection/context, loading/error/empty states and cancellation on query/filter/session changes. Automated regressions complement user acceptance; they do not certify all desktop platforms.
- **Visual direction:** retain current palette/cards and compact home row; expand to a category grid on demand. Broader navigation/return-position polish follows acceptance of the first delivery.
- **2026-10-13 user validation:** category discovery and the polished grid both accepted in the real desktop session. Clearer typography/hierarchy, modern cards, sharper thumbnails and full-name language badges (no country flags) stay as the approved direction.
- **Dependencies:** authenticated Helix reads (`games/top`, `search/categories`, `streams`); no new cloud service or dependency.
- **Acceptance:** rapid category/language changes never mix streams; pagination deduplicates live results; HTTP/auth/timeout errors remain distinct from empty results; keyboard controls and logout work; real Twitch desktop test by the user.
- **Scope limits:** no invented global totals, reliable Drops filter claims, or alternate global sorting unsupported by Twitch.
- **Tradeoff:** VOD resume and workspace profiles move behind this user-requested block; other pending validations remain open.
- **Delivery:** 1.4.4 published on 2026-10-13 after user approval, local checks and signed cross-platform CI. Public updater signatures verified independently. PC installation and Supabase deployment remain outside that authority.

### Included UI polish

- Settings: named dialog, contained/restored focus, arrow-key tabs, clearer header/control labels and larger switch/close hit targets.
- Confirmations: safe initial focus on Cancel, Tab containment and Escape only closing the upper registered dialog; preserve native overlay markers.
- Header: semantic Home button usable by keyboard, retaining the approved logo/colors.
- Volume: shared validated storage reader preserves 0%, clamps invalid ranges and retains the grid's separate fallback when no preference exists.
- Automated regressions and local build required; native keyboard/audio acceptance remains separate. Other audit items stay pending; no claim of full WCAG certification.

### Included grid chat extension — Unified chat

- **Status:** published in the user-approved 1.4.4 update. Independent live Twitch sending remains to be recorded; no blanket live validation is inferred from mock tests.
- **Scope:** optional Individual/Unified switch; merge the unique visible channels in 2/3/4-cell grids into an arrival-ordered native feed, with distinct source labels and explicit send destination.
- **Safety:** require the destination room to acknowledge joining; never broadcast to all channels or transfer a draft to a different destination. Hidden/removed channels cannot receive sends. Per-channel emotes, badges, duplicate suppression and IRC message/user deletions remain isolated.
- **Boundaries:** official embedded chat stays individual. Moderation commands/context menus and Companion sends stay in Individual; `/me` is available for one selected recipient. Retain bounded history (500 messages) and dedupe (1,000 IDs), batching and socket/request cleanup.
- **Validation:** socket-simulated integration tests and responsive web checks cover two/four rooms, safe destination changes, source assets and removals; 623 frontend tests pass/one skipped. Live authentication, Twitch sending and other desktop platforms remain separate acceptance checks.
- **Delivery:** consecutive compatible PATCH update after local checks and signed cross-platform CI; README, this roadmap and the website roadmap must be updated together. Existing VOD/workspace plans remain Next.

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

## Phase 4: v1.4.x — Pro Mod View, Channel Points Events & Multi-Window [LOCAL IMPLEMENTATION / VALIDATION]
*Focus: Professional multi-dock moderation workspace, authorized Channel Points events, 8-language localization, and Tauri WebView2 child window integration.*

### 🎨 UI & UX Improvements
- **Pro Mod View 2.0 (Centro de Mando para Moderadores)**:
  - **Live Stream & Chat Integrado**: Acciones de moderación directas por mensaje (`1s purga`, `10m timeout`, `ban`).
  - **Inspector de Usuario (User Card Inspector)**: Antigüedad de cuenta, historial de sanciones y mensajes previos.
  - **Barra Superior de Acciones Rápidas con Selectores Pill Horizontales**: Toggles de 1 clic para Modo Escudo, Modo Lento (`Off`, `3s`, `10s`, `30s`, `60s`, `120s`), Solo Emotes, Solo Seguidores (`Todos`, `0m`, `10m`, `30m`, `1d`), Solo Suscriptores y Vaciar Chat.
  - **Feed de Actividad en Tiempo Real**: Deduplicación entre avisos IRC, chat oficial y eventos de canjes personalizados autorizados.
  - **Distribución Modular Personalizable**: Cuadrícula reconfigurable con persistencia local.
- **Global Localization (8 Idiomas)**: Traducción completa en Español (`es`), Inglés (`en`), Francés (`fr`), Alemán (`de`), Portugués (`pt`), Japonés (`ja`), Coreano (`ko`) y Ruso (`ru`).
- **IRC Real-Time Badges & User Color**: Renderizado inmediato de insignias oficiales y colores de usuario.

### ⚙️ Core Functionality
- **Twitch EventSub WebSocket Engine (`wss://eventsub.wss.twitch.tv/ws`)**:
  - Migración del PubSub retirado por Twitch el 2025-04-14 a eventos de altas/cambios de canjes personalizados, con o sin texto.
  - Validación de autorización del creador y permisos de redemptions; estado de conexión y alternativa mediante chat oficial cuando no hay autorización.
  - Reconexión, deduplicación y cierre de recursos; sin promesa de cobertura del 100% de funciones privadas del chat web.
  - Panel de gestión de recompensas Helix sujeto a los permisos y restricciones de Twitch.
- **Gestión Nativa de Ventanas WebView2 en Windows**:
  - Chat popout desacoplable a ventana independiente (*Always-on-Top*).
  - Coordinación perfecta con modales (Settings, About): ocultación fuera de pantalla y restauración milimétrica de coordenadas `(x, y)` y tamaño sin bloqueos ni pantallas negras.
- **Ultra-Low Latency Pipeline (LL-HLS)**: Flags `--twitch-low-latency` y `--hls-live-edge 1` con auto-recuperación 1.2x.
- **v1.4.2 reliability patch**: inventario oficial integrado sin popouts, pausa persistida de reclamos
  inciertos, reporte nativo experimental opt-in, buscador protegido contra respuestas obsoletas y
  pulido de foco/teclado de Drops. Preparación de release: un push no implica publicación.

---

## Plan secuencial: 1.5 → 2.0 (2026-10-13)

Los números siguientes son hitos de producto, no fechas ni versiones publicadas.
Cada hito comienza con una entrega mínima; ampliaciones compatibles salen como PATCH
consecutivos cuando están probadas. No saltar de versión para cada idea ni esperar
a terminar todo un hito para entregar una corrección validada.

**Estado:** 1.5.1 publicada en Microsoft Store y GitHub, confirmada por el mantenedor. El resto de hitos continúa como planificación, sin dar por entregadas todas las ampliaciones de 1.5.x.
Codex se encarga de implementación/regresiones; el usuario acepta los flujos reales.
Antes de cada hito: revisar el código existente, reutilizarlo y verificar permisos,
consumo, migraciones y límites del proveedor. Ninguna prueba simulada certifica Twitch real.

| Orden | Hito | Entrega mínima / prioridad | Dependencia y cierre |
| --- | --- | --- | --- |
| 0 | 1.4.5 — Fiabilidad | Latencia y regresiones de pausa/DVR/grid; continuar validación Twitch | Prueba real, CI firmado y updater; 2.5 s observados no son garantía universal |
| 1 | 1.5 — Organización y uso diario | Colecciones, categorías favoritas/ocultas y búsqueda del chat de sesión | Aislamiento por cuenta y búsquedas acotadas; no fuga de datos al salir |
| 2 | 1.6 — Reproducción y medios | Continuar VOD, workspaces y herramientas de medios fiables | Identidad VOD, cleanup y almacenamiento limitado; medir CPU/RAM/disco |
| 3 | 1.7 — Control y moderación | Consolidar feed, predicciones/encuestas y atajos | Cuenta autorizada y permisos reales; acciones confirmadas por servidor |
| 4 | 1.8 — Integraciones y comodidad | Agenda, enlaces de app, privacidad y ecosistema | APIs oficiales y contratos por OS; no ejecutar acciones desde enlaces |
| 5 | 1.9 — Consolidación para 2.0 | Migraciones/backup seguro, accesibilidad y prototipos opt-in | Ensayo de actualización/recuperación y presupuesto de rendimiento |
| 6 | 2.0 — Rediseño integral | Nueva navegación, sistema visual y todas las pantallas coherentes | Prototipos aceptados, migración incremental y paridad funcional |

### 1.5.x — Organización, descubrimiento y chat [BASE RELEASED / IMPROVEMENTS NEXT]

**Objetivo:** encontrar lo que quieres ver y navegar por el chat con menos esfuerzo, sin rediseñar aún toda la app.

**Disponible desde 1.5.0, conservado en 1.5.1:**
- **Colecciones de canales — nuevo:** listas propias (Gaming, Esports, Para escuchar), orden manual y acceso rápido. No confundir con workspaces: no guardan layout ni lanzan varios streams automáticamente.
- **Personalización de colecciones:** tarjetas verticales 3:4 como categorías, color y portada local PNG/JPG/WebP reducida; al seleccionarlas aparecen canales con avatar y estado En vivo/Offline/Sin confirmar. Incluye canales no seguidos; fallos/timeouts no equivalen a offline. Publicada.
- **Categorías favoritas y ocultas:** fijar juegos y ocultar categorías en Explorar; posibilidad de deshacer y gestionar exclusiones. Sin recomendaciones opacas ni filtros de Drops no verificables.
  - Categorías publicadas: fijar primero, filtro Solo favoritas, ocultar con deshacer y panel para restaurar; preferencias acotadas por cuenta y sin escrituras en Twitch. Ocultar canales todavía no implementado.

**Entregada en GitHub 1.5.2:**
- **Búsqueda del chat de sesión:** chat nativo individual/unificado por texto, usuario, enlaces y canal de origen. Solo mensajes recibidos y conservados; mantiene borrados de moderación, filtros y límite de historial. Traducciones en ocho idiomas, Escape y aislamiento de sesión. Aceptada por el usuario; CI firmado y artefactos públicos verificados. Web oficial única: APX Studio; confirmación de login independiente conservada.

**Pendiente en las siguientes entregas PATCH de 1.5.x:**
- **Ocultación de canales:** ampliar las exclusiones sin modificar los follows de Twitch y con opción de restaurar.

**Ampliaciones posteriores del hito:** orden/filtros de colecciones y navegación con teclado, reutilizando la infraestructura existente. Sin persistir conversaciones por defecto.

**Cierre:** crear/editar/borrar y restaurar listas; búsqueda sin bloquear reproducción; cambio de cuenta/logout sin datos ajenos. Validar primero un prototipo con 20 canales y chat de dos fuentes, antes de ampliar.

### 1.6.x — Reproducción, continuidad y biblioteca [PLANNED]

**Entrega mínima:** continuar VOD con posición, lista para más tarde y bookmarks con notas; workspaces de canales/layout/calidad/volumen y audio principal. Canales/VOD retirados deben tener estado explícito, no restauración infinita.

**Entregas posteriores, en este orden:**
1. Consolidar DVR y vuelta al directo, compresor nocturno y audio binaural ya existentes; no prometer rebobinado completo ni salida a dispositivos distintos sin implementación/prueba específica.
2. Ahorro de recursos al minimizar o en streams secundarios, horarios silenciosos y avisos por categoría/cambio de juego; respetar grabación y mostrar el efecto sobre Drops.
3. Recorte temporal de VOD/clips y replay buffer circular de 30–120 s, comenzando con un solo stream; cancelación, disco lleno y cleanup obligatorios.
4. Biblioteca local de capturas/grabaciones/fragmentos: miniaturas, etiquetas, búsqueda y tratamiento de archivos movidos.
5. **Temporizador de reproducción — nuevo:** detener vídeo/audio por duración/hora, aviso cancelable y protección explícita de grabaciones activas.

**Cierre:** restaurar VOD/workspace tras reiniciar sin procesos huérfanos; cero volumen conservado; medir consumo y límites de disco con FFmpeg real. Buffer y biblioteca no deben retrasar el directo.

### 1.7.x — Moderación, eventos y control [PLANNED / EXISTING CODE TO VALIDATE]

**Entrega mínima:** consolidar Mod View y feed de actividad existentes con filtros Todos/Canjes/Subs-Raids/Moderación, búsqueda y deduplicación. Contadores de sesión solo de eventos observados; no inventar el saldo privado de puntos de un espectador.

**Entregas posteriores:**
- Predicciones/encuestas: permisos explícitos, creación/resolución/cancelación según Helix, progreso y confirmaciones para operaciones irreversibles; no presentar al moderador como creador autorizado.
- Atajos configurables con conflictos detectados, edición/restauración y aislamiento de inputs/modales. Conservar captura Ctrl/Cmd+Shift+S; acciones destructivas no se disparan por accidente. Atajos globales del OS son un bloque separado.
- HUD/overlay gamer, acciones rápidas, AutoMod y alertas visuales/sonoras: comprobar transparencia, click-through, foco y lifecycle nativos.
- Drops: continuar verificación independiente de inventario, crédito real y Auto-Claim; pausa persistida ante incertidumbre y controles oficiales dentro de la app. Validación transversal, no requisito para que el resto de 1.7 pueda salir.

**Cierre:** sesión autorizada real, ausencia de duplicados/reconexiones huérfanas y rechazo seguro al perder permisos. Moderación/Companion siguen individuales hasta que exista un contrato seguro de destino.

### 1.8.x — Agenda, privacidad e integraciones [PLANNED]

**Entrega mínima:**
- **Agenda — nuevo:** horarios publicados por streamers favoritos en zona local; vacaciones/cancelaciones y canales sin agenda diferenciados. Programado no significa realmente en directo.
- **Enlaces de BlinkStream — nuevo:** pegar enlaces Twitch y abrir enlaces de app en la instancia existente. Lista permitida de destinos; nunca aceptar comandos, rutas de disco o acciones de moderación desde una URL.
- **Modo presentación/privacidad — nuevo:** ocultación temporal de identidad, listas y previsualizaciones al compartir pantalla. No equivale a anonimato ni garantiza ocultar contenido a todas las herramientas de captura.

**Ampliaciones:** Discord RPC opt-in; Stream Deck sobre acciones existentes; exportación/importación de preferencias y colecciones sin tokens/cookies ni conversaciones. Firma/esquema/tamaño de importación validados y vista previa antes de sobrescribir.

**Condicionado:** traducción de chat bajo demanda, con proveedor/coste/privacidad claros, original visible y caché acotada. Nada se envía a terceros sin consentimiento. Repetición de chat VOD solo si se verifica una fuente permitida de datos; ausencia de API/datos significa aplazar, no simular historial.
El asistente de puntos conserva su lugar como investigación: no automatizar apuestas sin API autorizada y confirmación específica.

**Cierre:** zona horaria/DST correctos; enlaces maliciosos rechazados; RPC apagado no filtra actividad; integraciones opcionales sin afectar arranque.

### 1.9.x — Consolidación y preparación del rediseño [PLANNED]

**Entrega mínima:** cerrar regresiones, validar actualización/conservación de preferencias y rollback; diagnósticos sin secretos; auditar teclado, foco, contraste, lector de pantalla y traducciones (incluidos fallbacks actuales, no afirmar cobertura completa).

**Preparación 2.0:** inventario de pantallas/componentes, mapa de navegación, tokens visuales, presupuestos de CPU/RAM/latencia y prototipos del inicio, reproductor, chat y grid. Recoger aceptación antes de trasladar todas las pantallas.

**Prototipos aislados / opcionales:**
- Estadísticas locales de sesión (espectadores, velocidad de chat, eventos recibidos) y heatmap de actividad, sin analítica remota oculta.
- AFK Catch-Up basado en chat observado; no confundir resumen del chat con comprensión de todo el vídeo.
- Subtítulos/transcripción local: comparar exactitud, idiomas, carga y retardo en hardware de referencia antes de integrar.
- Evaluar distribución Flatpak/Homebrew y contratos de OBS/plugins/otras plataformas, sin cambiar permisos o pipeline hasta un diseño revisado.

**Cierre:** recorridos críticos estables en Windows/macOS/Linux, migraciones reversibles y prototipos aceptados; IA desactivada no carga modelos ni consume recursos extra.

### 2.0 — Rediseño completo de interfaz y experiencia [PLANNED MAJOR MILESTONE]

**Compromiso principal:** rediseñar la app completa, no cambiar solo la paleta ni rehacer el backend.

1. **Arquitectura de navegación:** Inicio, Explorar, Colecciones, Continuar viendo, Biblioteca, Multistream y herramientas de creador con rutas claras y retorno al contexto anterior.
2. **Sistema visual unificado:** tipografía, jerarquía, espaciado, iconos, botones, tarjetas, formularios, estados y motion; temas y densidad sobre tokens comunes. Preservar el logo aprobado y Blink blanco + Stream violeta→fucsia salvo nueva decisión del usuario.
3. **Reproductor y chat:** controles consistentes, paneles redimensionables, destinos/fuentes inequívocos, modo individual/unificado y foco/lectura accesibles; overlays discretos sin penalizar reproducción.
4. **Rediseño de todas las superficies:** bienvenida/sesión, cabecera/sidebar, categorías, canal, VOD, grid, chat, Drops, Ajustes, About/updater, Mod View, grabación/biblioteca y Companion.
5. **Adaptabilidad y accesibilidad:** ventanas pequeñas, ultrawide y escalado 100/125/150/200%; teclado/lector de pantalla, contraste y movimiento reducido. Sin aumentar ventanas independientes por defecto.
6. **Migración y paridad:** preservar preferencias, colecciones, identidad/sesión y workspaces; introducir por pantallas/beta, no una reescritura ciega. Ensayar backup/recuperación y upgrades antes de retirar el diseño anterior.
7. **Web/documentación:** actualizar landing, capturas y guías con la identidad 2.0, sin anunciar funciones no entregadas.

**Aceptación:** prototipos aprobados → sistema de componentes → migración por pantallas → beta → pruebas reales por plataforma → release firmada. Sin regresiones en playback/chat/Drops/cleanup; comparar rendimiento con 1.9 en el mismo hardware, canales y calidad. La cifra objetivo se fija con esa línea base, no con promesas de marketing.

**Extensiones condicionadas para 2.0.x, no bloqueantes del rediseño:**
- IA local, resumen AFK, heatmap y subtítulos, solo si pasan pruebas de calidad/consumo y quedan opt-in.
- Fuentes OBS y SDK de plugins/widgets con API aislada, revisión de permisos, procedencia y sin acceso Tauri arbitrario.
- Adaptadores Kick/YouTube Live, únicamente tras comprobar reproducción/chat/auth permitidos y límites de cada proveedor; no prometer chat unificado universal.
- Distribución Flatpak/Homebrew tras validar firma, actualización y mantenimiento de paquetes.

### Qué cambia respecto al roadmap anterior

- Se mantienen las fases históricas 1.1–1.4 y su evidencia; no se vuelven a vender funciones existentes como nuevas.
- La antigua 1.5 concentraba moderación, DVR, audio y medios: ahora organización es 1.5, reproducción/medios 1.6 y consolidación de moderación 1.7.
- VOD/workspaces siguen antes de ahorro/replay/biblioteca, respetando el orden de dependencias del plan de ejecución.
- La antigua 1.6 distribuye ahorro a 1.6, Discord/Stream Deck/traducción/VOD chat a 1.8 y tipografía/accesibilidad al diseño 1.9–2.0.
- El horizonte 2.0 deja de depender de entregar simultáneamente IA, todas las plataformas y plugins. Su requisito central es el rediseño completo; el resto mantiene una vía condicionada sin fecha impuesta.
- Las siete propuestas nuevas quedan asignadas: colecciones/búsqueda/categorías a 1.5, temporizador a 1.6, agenda/enlaces/privacidad a 1.8. No se elimina ninguna línea histórica; se corrigen garantías no demostradas.

### Dependencias y política de alcance

Revisar alcance antes de cada versión inicial: Must = entrega mínima/cierre; Should = siguientes incrementos; Could = extensiones condicionadas.
Si una API, permiso, hardware o migración bloquea una ampliación, aplazar ese elemento explícitamente en lugar de ampliar permisos o detener todas las entregas.
No hay calendario cerrado hasta dimensionar y validar cada bloque. No desplegar Supabase ni instalar en el PC del usuario por aprobar este plan.

Referencias de viabilidad: [Agenda Twitch](https://dev.twitch.tv/docs/api/schedule/), [Helix predicciones/encuestas](https://dev.twitch.tv/docs/api/reference/), [Enlaces Tauri](https://tauri.app/plugin/deep-linking/).
