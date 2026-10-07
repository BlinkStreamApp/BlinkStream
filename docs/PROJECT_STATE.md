# PROJECT_STATE

Updated: 2026-10-08
Status: active

## Objective

Cliente desktop de Twitch con reproducción, chat, grabación y Companion.
Publicar el hotfix 1.4.3 de sesión y marca con artefactos firmados en las tres plataformas.

## Stack

- Frontend: React 19, Vite, Tailwind CSS, hls.js
- Native: Tauri 2, Rust 1.88.0 fijado; Streamlink/FFmpeg externos
- Cloud: Supabase/Postgres, OAuth y Edge Functions Deno
- Packaging: NSIS/MSI, DMG/app archive, AppImage/deb
- Testing: Vitest, Node, Cargo y Deno; package manager: pnpm 10

## Architecture

React delega integraciones a servicios/hooks y operaciones privilegiadas a Rust mediante IPC.
NSIS es la autoridad de instalación Windows. CI construye cuatro targets, verifica sus artefactos
de updater con la clave configurada y solo publica desde un tag validado.

## Important Paths

- `src/` — UI, Twitch, reproductor y servicios/hooks
- `src/hooks/useTwitchDrops.js`, `src/utils/drops.js` — inventario y normalización
- `src-tauri/src/lib.rs` — comandos IPC, autenticación nativa y plugins
- `src-tauri/src/embedded_drops.rs` — inventario oficial integrado y lifecycle
- `src-tauri/src/drops_watch.rs` — reportes experimentales de reproducción medida
- `src-tauri/src/recorder.rs`, `companion.rs` — grabación y Companion
- `src-tauri/tauri*.conf.json`, `windows/hooks.nsh` — seguridad, updater y bundles
- `src-tauri/vendor/glib` — backport GTK3 temporal; ADR-014
- `scripts/build-updater-manifest.mjs`, `build-signed-release.mjs` — firma y verificación
- `.github/workflows/release.yml` — gates de calidad, instalador y publicación
- `docs/guides/UPDATER_VERIFICATION.md` — evidencias y límites de actualización
- `docs/EXECUTION_PLAN.md`, `ROADMAP.md` — prioridades y aceptación

## Current Decisions

- DEC-001 — NSIS reemplaza al instalador personalizado; no mantener dos autoridades.
- DEC-002 — Fuente 1.4.3 candidata; publicada/latest 1.4.2 hasta pasar CI y verificar el nuevo manifiesto.
- DEC-003 — Updater falla cerrado: cuatro artefactos, firmas/comentarios, tag/config y clave coherentes.
- DEC-004 — IPC/capabilities mínimos; vistas remotas de Twitch no heredan permisos de la aplicación.
- DEC-005 — Favoritos autorizados mediante identidad auth confiable, no metadata editable.
- DEC-006 — Companion: PIN exacto/rotado y sin CORS universal.
- DEC-007 — Manifiestos HLS en Rust; fragmentos/reproducción en hls.js.
- DEC-008 — Cookies Twitch HttpOnly permanecen nativas; consultar inventario no acredita minutos.
- DEC-009 — EventSub para canjes personalizados autorizados; no sustituye todo el chat oficial.
- DEC-010/013 — Reclamos mediante controles oficiales dentro del modal, sin popout ni bypass de integridad; ADR-010/013.
- DEC-011 rechazada — No trasladar reproducción al player oficial para conseguir Drops.
- DEC-012 — Reporte Spade opt-in, playback real y progreso exclusivamente remoto; ADR-012.
- DEC-014 — GLib 0.18.5 vendorizado: backport upstream y dos lifetimes explícitos, sin falsear versión; ADR-014.
- Firma — El secreto actual coincide con la clave pública existente. Normalizar solo whitespace del Base64 exterior, nunca contraseña; no rotar confianza ni exportar la privada.

## Current Work

NOW:
- Hotfix 1.4.3 autorizado: fixes de sesión/follows y marca aprobada. Mantener código/config/versiones alineados; primero candidato CI, después tag y publicación firmada. Procedimiento reutilizable: `docs/guides/HOTFIX_RELEASES.md`.
- Logout/recientes y bienvenida clásica/logo aceptados por el usuario en Windows. Blink blanco y Stream violeta→fucsia igual que cabecera; sin nuevos CTAs. Iconos desktop, favicon, web y README usan el logo elegido.
- Follows separados de pins por cuenta; refresh visible cada 60 s y al volver/online, abort/timeout y descarte de respuestas obsoletas. Logout limpia recientes/caché de portada, cierra stream y no permite restauraciones auth tardías. El usuario confirma que follow/unfollow real funciona; regresiones automatizadas cubren el flujo.
- Validación local del hotfix: 542 frontend pasan/1 omitido, 11 release/firma y 56 Rust Windows; lint/fmt/Clippy y build frontend correctos. Bundle firmado/CI multiplataforma pendiente; nada instalado ni desplegado en Supabase.
- Limpieza aislada publicada en `master` (`13d2685`): hero/Vite/sprite social sin consumidores. Favicon SVG antiguo retirado ahora que el hotfix referencia PNG.
- Base publicada 1.4.2: tag `c53c209`, CI `37678585652` completo; cuatro artefactos updater y firmas públicas verificados. Windows smoke NSIS install/reinstall/restart correcto. Evidencias históricas: `docs/guides/UPDATER_VERIFICATION.md`.
- Drops: progreso remoto y reclamo manual observados; no equivalen a validación independiente de Auto-Claim, sesiones/vinculación ni desktop de otras plataformas.

NEXT:
- Prueba GUI voluntaria desde 1.4.1 y de conservación de settings/sesión, sin instalar automáticamente en el PC del usuario. Linux updater integrado requiere AppImage; `.deb` se actualiza manualmente/mediante paquetes.
- Validar canje EventSub real, Auto-Claim independiente y pausa/aislamiento del reporte nativo.
- VOD resume/bookmarks, perfiles de workspace y audio principal multistream.
- Supabase: desplegar funciones/migración solo con autorización aparte.

LATER:
- Retirar vendor GLib cuando GTK/Tauri tengan una dependencia oficial corregida compatible.
- Activar protección de contraseñas filtradas en Supabase tras autorización.

## Known Risks

- La lista legacy mezclaba follows/pins sin procedencia. Se archiva recuperablemente (`blinkstream_favorites_legacy`), solo se migra a su propietario conocido y se excluyen follows observados del import cloud. Un follow antiguo ya eliminado antes de esta migración no puede distinguirse automáticamente de un pin; no se borran filas cloud ni preferencias/cookies.
- Firmas históricas 1.4.1 usan otro ID; clientes con una clave antigua no recuperable necesitan transición manual verificada. El smoke actual no prueba una migración histórica ni persistencia autenticada.
- Upgrades durante grabación activa y GUI instalada end-to-end siguen sin validar.
- Firma updater no sustituye Authenticode/notarización; pueden aparecer avisos Windows/macOS.
- Aceptación de Drops Windows no certifica sesiones/login/automatización ni desktop real en otras plataformas.
- Spade es interno: HTTP 204 no garantiza crédito. Pi-hole bloqueó su dominio; sin bypass DNS.
- GLib registry 0.18.5 original sigue vulnerable: solo nuestra copia parcheada está validada.
- Migración Supabase `20260804195525` y funciones modificadas no están desplegadas; protección de contraseñas filtradas desactivada.
- Preparación automática de Streamlink/FFmpeg Windows depende de winget.

## Known Debt

- Auditoría UI: foco de otros modales, volumen cero/persistencia, índices/responsive multistream y contraste; `docs/reviews/UI_AUDIT_2026-10-02.md`.
- Tests nativos/auth reales no se sustituyen por mocks, headless CI o compilación.
- Mantener integridad/licencia/procedencia del vendor GLib; no ignorar avisos globalmente.

## Constraints

- Hotfix 1.4.3 autorizado el 2026-10-08; PATCH estable en lugar de 1.4.2-a (prerelease anterior). Guía: `docs/guides/HOTFIX_RELEASES.md`.
- Publicación 1.4.2 autorizada el 2026-10-07 tras validar las tres plataformas; no excluir Linux.
- No instalar nada en el PC del usuario ni desplegar Supabase sin autorización.
- Sin ventanas aparte/segundo player para Drops; conservar controles oficiales de integridad/vinculación.
- No exponer/persistir secretos Twitch en frontend ni repositorio.
- No publicar firmas vacías, históricas incompatibles o manifiestos sin artefactos reales.

## Invariants

- Follows de Twitch no se suben como favoritos automáticamente; pins/cache de cuenta no se muestran al invitado ni a otra cuenta. Logout invalida auth pendiente y serializa borrado tras escrituras de token en curso.
- Todo proceso Streamlink/FFmpeg debe disponer de cleanup; cambiar/cerrar stream no debe dejar huérfanos.
- UI no contiene privilegios nativos específicos del OS; código compartido mantiene tres plataformas.
- Credenciales/cookies Twitch no se entregan a React, no se registran ni se borran al montar chat.
- Disponibilidad de campañas no implica crédito; errores no equivalen a inventario vacío.

## Recent Changes

- Firma corregida sin rotación de claves; cuatro firmas verificadas criptográficamente en CI y local.
- Backport GLib probado con optimización; seis alertas originales cerradas automáticamente por GitHub.
- Corregido mirror-file APT del runner; secreto limitado al paso de bundle y smoke NSIS con restart.
- Inventario oficial Drops integrado, pausa persistida de Auto-Claim incierto y foco/teclado pulidos.
- EventSub y buscador endurecidos contra respuestas obsoletas y lifecycle incorrecto.

## Open Questions

- Confianza real de instalaciones antiguas y conservación de sesión/settings durante un upgrade.
- Canje EventSub autorizado y Auto-Claim real independiente en campañas activas.
