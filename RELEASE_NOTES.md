# BlinkStream 1.5.4 — Mod View and enhanced-broadcast playback

Release candidate, 2026-10-25. Public downloads/updater remain 1.5.3 pending
real-account Mod View and 1440p acceptance and release gates.
Version-specific release body: [1.5.4 ES/EN](docs/releases/1.5.4.md).

## ES

- Corregida la pantalla negra de Mod View por configuración inicial o antigua incompleta, conservando las preferencias válidas.
- Reproducción y listado de calidades solicitan H.264, HEVC y AV1, sin limitar los canales de alta resolución a H.264.
- Streamlink usa la cabecera OAuth documentada y puede aprovechar la sesión oficial integrada solo cuando su identidad validada coincide con la cuenta de la aplicación.
- Corregido el procesamiento de calidades y los mensajes de reproducción, fuente de vídeo inaccesible y códec incompatible en ocho idiomas.
- Zod transitivo de las herramientas de desarrollo actualizado a 4.6.7 para corregir GHSA-mrhx-c7xc-m3w5; auditoría sin excepciones.

## EN

- Fixed Mod View black screens caused by incomplete fresh or legacy settings while preserving valid preferences.
- Playback and quality discovery request H.264, HEVC and AV1 instead of limiting high-resolution channels to H.264.
- Streamlink uses its documented OAuth header and can reuse the embedded official session only when its validated identity matches the app account.
- Fixed quality parsing and playback, inaccessible-video-source and unsupported-codec messages in all eight languages.
- Updated development tooling's transitive Zod dependency to 4.6.7 for GHSA-mrhx-c7xc-m3w5 without audit exceptions.

## Previous release

# BlinkStream 1.5.3 — Authentication security

Published on GitHub: 2026-10-22. Downloads/updater verified at 1.5.3; Store remains on 1.5.2.
Version-specific release body: [1.5.3 ES/EN](docs/releases/1.5.3.md).

## ES

- Handoffs OAuth privados, de un solo uso y con caducidad comprobada; retirado el acceso público a credenciales y purgados 22 intercambios caducados.
- Identidad Twitch validada por aplicación, permisos y usuario inmutable; cuentas antiguas vinculadas solo con prueba de la sesión anterior.
- Validación del token al iniciar y cada hora, limpieza de sesiones revocadas y revocación remota al cerrar sesión.
- Refresh exclusivamente por POST y permisos OAuth innecesarios retirados.
- Dependencias TLS actualizadas contra RUSTSEC-2026-0381/0382/0383, detectados por el gate de publicación.
- Vite 8.2.4 corrige los tres avisos Dependabot del servidor de desarrollo; auditoría completa sin vulnerabilidades conocidas.
- Vitest 4.1.12 corrige los dos avisos nuevos detectados el 2026-10-22; CI incluye la auditoría de dependencias de desarrollo.
- Acerca de muestra APX Studio, web y soporte con traducciones en ocho idiomas.

## EN

- Private, single-use OAuth handoffs with enforced expiry; public credential access removed and 22 expired exchanges purged.
- Twitch identity validated against the application, scopes and immutable user ID; legacy accounts require previous-session proof before linking.
- Token checks at startup and hourly, revoked-session cleanup and remote revocation on sign-out.
- POST-only refresh and removal of unused OAuth permissions.
- TLS dependencies updated for RUSTSEC-2026-0381/0382/0383, detected by the publication gate.
- Vite 8.2.4 fixes the three development-server Dependabot advisories; full dependency audit reports no known vulnerabilities.
- Vitest 4.1.12 fixes two new advisories detected on 2026-10-22; CI includes development dependency auditing.
- About credits APX Studio and links to the website and support in all eight interface languages.

Cloud hardening is deployed. Candidate CI `39793015683` passed; tag pipeline `39796091712` published 15 public files independently checked against CI and GitHub SHA-256 digests. All four updater signatures verify. Real-account login/logout and installed GUI acceptance remain separate; no Store submission or website deployment was performed.

## BlinkStream 1.5.2 — Session chat search

Published on GitHub: 2026-10-17. Latest/downloads/updater: 1.5.2. Microsoft Store remains 1.5.1; the maintainer submits its separate MSIX.
Version-specific release body: [1.5.2 ES/EN](docs/releases/1.5.2.md).

## ES

- Añadida búsqueda en el chat nativo individual y unificado por texto, usuario, enlaces y canal de origen.
- Los filtros se combinan con las pestañas del chat, respetan los borrados de moderación y no cambian el destino de los mensajes.
- La búsqueda utiliza solo mensajes conservados en memoria; se limpia al cambiar de cuenta, cerrar sesión o cambiar los canales visibles.
- Panel adaptable con traducciones en los ocho idiomas, foco automático y cierre con Escape.
- Completadas las traducciones de pestañas, ayudas, estados vacíos, etiquetas accesibles y errores locales que rodean al buscador; cambiar de idioma conserva filtros, borrador y conexión.
- Documentación y roadmap actualizados: GitHub 1.5.2 publicada, Microsoft Store 1.5.1 y ampliaciones pendientes diferenciadas.
- Avisos Store con acceso traducido al paquete de fuentes del runtime Streamlink/Python/FFmpeg; conserva una sola copia para el runtime compartido.
- Retirado el soporte ZIP heredado no utilizado del actualizador: elimina `zip 4.6.1` y sus avisos RustSec de extracción sin cambiar los formatos EXE/AppImage/TAR.GZ publicados ni la verificación de firmas.

## EN

- Added native individual and unified chat search by text, sender, links and source channel.
- Filters work with chat tabs, respect moderation deletions and do not change the send destination.
- Search only uses messages retained in memory and resets on account changes, sign-out or changes to visible source channels.
- Responsive panel with all eight interface languages, automatic focus and Escape to close.
- Completed surrounding chat tabs, hints, empty states, accessible labels and local error translations; language changes preserve filters, drafts and the connection.
- Updated documentation and roadmap to distinguish published GitHub 1.5.2, Microsoft Store 1.5.1 and remaining improvements.
- Store notices provide localized access to the Streamlink/Python/FFmpeg runtime source companion, retaining a single copy for the shared runtime.
- Removed unused legacy ZIP updater support, excluding `zip 4.6.1` and its extraction advisories while retaining published EXE/AppImage/TAR.GZ formats and signature verification.

Validation and Windows test-build details are tracked in `docs/PROJECT_STATE.md`.
The maintainer accepted the translated candidate. Candidate CI `39059837052` and tag
CI `39060821359` passed. All 15 public files match CI hashes and four updater signatures
independently verify. These checks do not certify every live-service/platform flow.

## BlinkStream 1.5.1 — Store taskbar icon hotfix

Date: 2026-10-16. Published GitHub hotfix over 1.5.0; Store MSIX update handed to the maintainer.

- Add transparent target-size assets for taskbar/Start in light and dark themes.
- Provide DPI-scale assets and compile/verify their Windows resource index (PRI).
- Preserve the approved logo and existing Store identity for an in-place update.
- Align source version and project/website documentation; GitHub downloads/updater move to verified 1.5.1 builds for Windows, macOS Intel/Apple Silicon and Linux.

Local package validation does not prove the icon's appearance in the installed Store
update. The user uploads to Partner Center; the agent does not install or publish it.

## BlinkStream 1.5.0 — Organization, security and Store

Microsoft Store publication confirmed by the maintainer on 2026-10-16.

- Account-scoped collections with custom covers, colors, ordering, undo and collapsible browsing.
- Pinned/hidden category preferences behind an explicit management mode.
- New interface messages translated into all eight supported languages.
- Lower-latency HLS policy with bounded catch-up and preserved manual DVR/pause behavior.
- Hardened native media requests, bounded FFmpeg trimming, secret storage, Companion, QR generation and IPC permissions.
- Supabase permission migration and backward-compatible POST refresh deployed separately with authorization.
- Dedicated Microsoft Store build: GitHub updater and automatic winget installation disabled; MSIX identity taken from Partner Center.

Windows core flows and translations accepted by the user. Store acceptance was
reported by the maintainer, not verified through Partner Center by the agent.
GitHub 1.5.0 is retained as the historical baseline, with its own signed builds and notes; 1.5.1 is latest.

## Previous stable: BlinkStream 1.4.4 — Interface, discovery and multistream update

Date: 2026-10-13. Published incremental compatible update; signed cross-platform CI passed.

## Category discovery and visual polish

- Search games/categories beyond the popular list, load more results and filter live streams by language.
- Cancel obsolete requests on query, category, language or account changes; deduplicate paginated results.
- Keep HTTP/auth/rate-limit/timeout errors distinct from an empty list and offer explicit retry.
- Modernized cards, sharper stream thumbnails, readable full-name language badges and clearer controls.

## Multistream and unified chat

- Center loading/error messages in the video area; wrap long errors and adapt controls to each cell's width.
- Ignore late channel/quality responses and release HLS resources on replacement/unmount.
- Restrict audio/chat selection to visible cells; preserve zero volume and coherent binaural mute behavior.
- Apply left/right chat placement in matching DOM order; allow re-opening hidden chat from a cell.
- Optional Individual/Unified native chat mode for 2/3/4-cell grids; one subscription per unique visible channel.
- Source-colored labels, arrival-ordered messages and channel-scoped emotes, badges, anti-spam, dedupe and deletions.
- Explicit single-recipient sending requires a joined destination; drafts never transfer to another channel.
- Official embedded chat, moderation and Companion chat sends remain in Individual; `/me` targets one selected room.

## Settings and keyboard polish

- Safe initial focus, Tab containment and focus restoration in Settings and confirmation dialogs.
- Arrow-key navigation between Settings tabs, named switches/controls and a keyboard-operable Home logo.
- Shared validated volume reader preserves 0%, clamps invalid ranges and retains grid's separate default.

## Validation and delivery limits

- The user accepted category/grid/UI changes and authorized the incremental 1.4.4 publication workflow.
- 623 frontend tests pass, one skipped; lint, legacy checks and Windows local build pass.
- 56 Rust Windows tests, format checks and 19 release/signature/documentation tests pass locally.
- Socket-simulated tests cover chat routing, destination changes, assets and deletions; responsive checks cover narrow grids.
- Live Twitch authentication/sending, independent audio/keyboard acceptance and other desktop platforms are not certified by mocks.
- Candidate CI `38449215321` and tag CI `38451126905` passed quality, signed builds for Windows/both macOS architectures/Linux, NSIS smoke and manifest verification.
- All four downloaded public updater artifacts independently pass signature, trusted-comment and SHA-256 verification; the public manifest matches master after Git line-ending normalization.
- Signing trust, cloud schema and shared Twitch cookies are unchanged; no Supabase deployment or automatic PC installation.
- Historical updater-key migration, authenticated upgrades and independent Drops auto-claim retain their previous limits.
- Every hotfix/update keeps README, release notes, repository roadmap and website current; release tests enforce version markers.

See [hotfix policy](docs/guides/HOTFIX_RELEASES.md),
[updater verification](docs/guides/UPDATER_VERIFICATION.md) and [roadmap](ROADMAP.md).
