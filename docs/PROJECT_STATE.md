# PROJECT_STATE

Updated: 2026-10-13
Status: active

## Objective

Cliente desktop de Twitch con reproducción, chat, grabación y Companion.
Mantener la 1.4.4 publicada y avanzar en fiabilidad Twitch, VOD y workspaces.

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
- DEC-002 — Fuente y latest publicados 1.4.4; CI firmado y cuatro artefactos públicos del updater verificados.
- Plan 2026-10-13 — Hitos consecutivos: 1.5 organización/chat, 1.6 continuidad/medios, 1.7 moderación, 1.8 integraciones, 1.9 consolidación, 2.0 rediseño completo. Entregas mínimas y ampliaciones PATCH; IA/plugins/Kick/YouTube condicionados y no bloqueantes de 2.0. Detalle en ROADMAP, sin nuevas fechas ni cambio de versión publicada.
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
- Web: fix aislado `57ccd8d` subido y Pages desplegado/verificado, sin release/bump de app. Roadmap mantiene título/descripción/em/code inline; cabecera, tarjetas, mockup, footer y anclas adaptados a móvil. Revisión navegador de 320/390/768/1024/1440 px sin desbordamientos en bloques comprobados, imágenes/anclas locales correctas y sin errores de consola. Tres regresiones nuevas (22 tests release/documentación pasan); evidencia pública móvil en `scratch/website-roadmap-mobile-fixed.png`. No se incluyen los cambios locales de latencia en ese commit.
- Fix en cola para 1.4.5: latencia HLS compartida objetivo 2 s, recuperación limitada a 1.1× y sin controlador manual competidor; pausa/DVR manual desactivan catch-up y buffer precargado intacto. Usuario acepta 2.5 s de latencia/2.3 s de buffer en el principal (captura Twitch, 2026-10-13), no garantía universal. 632 frontend pasan/1 omitido, 19 release/documentación y lint/legacy/build Windows correctos. Ejecutable de prueba `src-tauri/target/release/blinkstream-latency-test-20261013.exe`; no instalado por el agente. Pendientes grid real, pausa/DVR y estabilidad sostenida, más CI firmado antes de publicar. Versión publicada/fuente sigue 1.4.4; petición actual solo añade el fix a la próxima entrega.
- 1.4.4 publicada/latest: tag `3ac7b7a`; candidata CI `38449215321` y tag CI `38451126905` correctos. Cuatro targets firmados, smoke NSIS y verificación independiente de firmas/hashes de los cuatro artefactos públicos. Updater público/master coherentes tras normalizar CRLF; clave sin cambios. README/roadmaps/web sincronizados.
- Categorías, filtro de idioma/paginación y pulido UI/grid aceptados por el usuario. Chat unificado opcional para canales visibles, destino explícito con JOIN confirmado, recursos/dedupe/borrados aislados y drafts seguros; chat oficial, moderación y Companion permanecen Individual.
- Validación: 623 frontend pasan/1 omitido, 56 Rust Windows, 19 release/firma/documentación; lint/legacy/fmt/Clippy, GLib optimizado, builds firmados y smoke correctos. Responsive/chat verificados con sockets simulados; envío Twitch real, audio/teclado nativos independientes y desktop de otras plataformas no certificados por mocks.
- Logout/recientes, bienvenida/logo y refresh follow/unfollow reales aceptados en Windows (1.4.3). Datos/cache por cuenta, auth tardía invalidada, 0% de volumen preservado y foco accesible en Ajustes/confirmaciones.
- Drops: progreso remoto y reclamo manual observados; no equivalen a Auto-Claim independiente ni validación universal de sesiones/vinculación.
- Nada instalado en el PC del usuario ni desplegado en Supabase; evidencias históricas en la guía del updater.

NEXT:
- Prueba GUI voluntaria desde 1.4.1 y de conservación de settings/sesión, sin instalar automáticamente en el PC del usuario. Linux updater integrado requiere AppImage; `.deb` se actualiza manualmente/mediante paquetes.
- Validar canje EventSub real, Auto-Claim independiente y pausa/aislamiento del reporte nativo.
- 1.5: colecciones, categorías favoritas/ocultas y búsqueda del chat de sesión; después 1.6 VOD/bookmarks, workspaces y audio principal antes de ahorro/replay/biblioteca.
- Supabase: desplegar funciones/migración solo con autorización aparte.

LATER:
- 1.7–1.9: consolidación de moderación, agenda/enlaces/privacidad e integraciones opcionales; baseline, migraciones y prototipos antes de rediseñar todas las pantallas en 2.0, conservando marca/paridad funcional. Ver ROADMAP.
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

- README recupera arquitectura/stack/setup/pruebas sin changelog de versiones. No hay `LICENSE` raíz aunque Cargo declara MIT; formalizar texto/copyright con el titular. `.env.example` y guía Twitch contienen opciones legacy; README avisa que no bastan para self-host y no recomienda secretos frontend.
- Auditoría UI: foco de otros modales, volumen cero/persistencia, índices/responsive multistream y contraste; `docs/reviews/UI_AUDIT_2026-10-02.md`.
- Tests nativos/auth reales no se sustituyen por mocks, headless CI o compilación.
- Mantener integridad/licencia/procedencia del vendor GLib; no ignorar avisos globalmente.

## Constraints

- 2026-10-13: el usuario levanta el modo solo local para publicar 1.4.4 tras pruebas. Regla permanente: fixes/mejoras compatibles se suben como PATCH consecutivos tras validar; MINOR para entregas mayores acordadas. Actualizar siempre README, notas, roadmap del repo y web, junto a versiones nativas. Una instrucción posterior de pausa/solo local prevalece.
- Hotfix 1.4.3 autorizado el 2026-10-08; PATCH estable en lugar de 1.4.2-a (prerelease anterior). Guía: `docs/guides/HOTFIX_RELEASES.md`.
- Publicación 1.4.2 autorizada el 2026-10-07 tras validar las tres plataformas; no excluir Linux.
- No instalar nada en el PC del usuario ni desplegar Supabase sin autorización.
- Sin ventanas aparte/segundo player para Drops; conservar controles oficiales de integridad/vinculación.
- No exponer/persistir secretos Twitch en frontend ni repositorio.
- No publicar firmas vacías, históricas incompatibles o manifiestos sin artefactos reales.

## Invariants

- Follows de Twitch no se suben como favoritos automáticamente; pins/cache de cuenta no se muestran al invitado ni a otra cuenta. Logout invalida auth pendiente y serializa borrado tras escrituras de token en curso.
- Chat unificado: origen y destino son independientes; solo canales visibles únicos, envío a un único destino confirmado, nunca trasladar borradores ni permisos/recursos de otro canal. Moderación y Companion permanecen en Individual.
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
