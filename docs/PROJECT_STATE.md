# PROJECT_STATE

Updated: 2026-08-04
Status: active

## Objective

BlinkStream es una aplicación de escritorio para reproducir, grabar y gestionar streams de Twitch.
El trabajo actual prioriza una instalación/actualización fiable, seguridad en Twitch/Supabase y un
frontend ligero sin degradar reproducción, chat ni Companion.

## Stack

- Frontend: React 19, Vite, Tailwind CSS, hls.js
- Desktop backend: Tauri 2, Rust
- Database/Auth: Supabase/Postgres y Edge Functions Deno
- Runtime: Node/pnpm y Rust/Cargo
- Packaging: Tauri NSIS/MSI, DMG y AppImage/deb
- Testing: Vitest, Node test runner y Cargo test

## Architecture

La UI React delega Twitch y Supabase en servicios/hooks y las operaciones privilegiadas en comandos
Tauri/Rust. Streamlink y FFmpeg se resuelven en la capa nativa. NSIS es la única autoridad de
instalación interactiva en Windows; el updater consume artefactos firmados generados por CI.

## Important Paths

- `src/` — frontend React, autenticación, reproducción, chat y sincronización
- `src/utils/tauriHls.js` — carga nativa de manifiestos HLS con headers Twitch
- `src-tauri/src/lib.rs` — comandos Tauri y registro de plugins
- `src-tauri/src/companion.rs` — servidor Companion local y autenticación por PIN
- `src-tauri/windows/hooks.nsh` — migración de instalaciones Windows heredadas
- `src-tauri/tauri.conf.json` — seguridad, updater y bundle base
- `src-tauri/tauri.release.conf.json` — artefactos firmables de actualización
- `supabase/functions/` — autenticación y API de datos
- `supabase/migrations/` — esquema y permisos versionados
- `.github/workflows/release.yml` — controles de calidad, firma y publicación

## Current Decisions

- DEC-001 — NSIS sustituye al instalador React/Rust personalizado; no deben coexistir dos instaladores.
- DEC-002 — La versión canónica de aplicación es `1.3.8` y debe coincidir en Node, Tauri y Cargo.
- DEC-003 — El updater falla cerrado si falta una firma; Linux actualiza con `AppImage.tar.gz`.
- DEC-004 — El frontend no conserva permisos de shell/filesystem no utilizados.
- DEC-005 — La identidad de favoritos usa `auth.users.id` y metadata confiable, nunca `user_metadata` editable.
- DEC-006 — Companion acepta PIN exacto, rota el PIN al iniciar y no expone CORS universal.
- DEC-007 — Los manifiestos HLS se obtienen en Rust; hls.js descarga y reproduce los fragmentos.

## Current Work

NOW:
- Validar una instalación limpia y una migración desde la ruta heredada con el instalador NSIS `1.3.8`.

NEXT:
- Desplegar las Edge Functions modificadas y la migración Supabase `20260804195525` tras autorización.
- Crear un tag de release con la clave de firma de producción y probar una actualización real.

LATER:
- Activar la protección de contraseñas filtradas desde la configuración del proyecto Supabase.

## Known Risks

- La migración `20260804195525_harden_favorites_identity_permissions.sql` existe localmente pero no está desplegada.
- Los cambios locales de `twitch-auth` y `blinkstream-data` aún no están desplegados en Supabase.
- El updater de producción requiere que el secreto CI coincida con la clave pública configurada en Tauri.
- La firma del updater no sustituye Authenticode/notarización; no hay certificados de plataforma configurados y Windows/macOS pueden mostrar avisos de confianza.
- `updater.json` sigue describiendo la última versión publicada (`1.3.1`) hasta crear el release firmado.
- Las pruebas Deno de Edge Functions se ejecutan en CI; Deno no está instalado en este equipo.
- La protección de contraseñas filtradas está desactivada en la configuración externa de Supabase.
- La preparación automática de Streamlink/FFmpeg en Windows depende de `winget`.

## Known Debt

- `ROADMAP.md`, `RELEASE_NOTES.md` y la web de `docs/` describen la última versión pública antigua y deben
  actualizarse al preparar el release, no antes de que existan artefactos firmados.

## Constraints

- No desplegar migraciones, Edge Functions ni releases sin autorización explícita.
- No almacenar secretos Twitch en el frontend ni en el repositorio.
- Mantener compatibilidad Windows, macOS y Linux en el código compartido.

## Invariants

- Todo proceso Streamlink/FFmpeg creado tiene estrategia de cleanup.
- Cambiar o cerrar un stream no deja procesos huérfanos.
- IPC expone la mínima superficie privilegiada necesaria.
- Un manifiesto de actualización no se publica con firmas vacías o ausentes.
- La identidad de autorización no depende de metadata editable por el usuario.

## Recent Changes

- Eliminado el instalador personalizado y añadida migración NSIS desde la ruta heredada.
- Unificada la versión `1.3.8` y añadido test de coherencia Node/Tauri/Rust.
- Endurecidos CSP, permisos Tauri, release CI y firma obligatoria del updater.
- Corregidos lifecycle, PIN y cabeceras de seguridad de Companion.
- Endurecida la identidad y los permisos de favoritos en código y migración Supabase.
- Corregido el atajo de chat del reproductor y efectos/dependencias React defectuosos.
- Reducido el bundle inicial a ~366 KB (~112 KB gzip), con hls.js en un chunk lazy independiente.
- Eliminadas dependencias y capacidades no utilizadas; lint y Clippy quedan sin advertencias.
