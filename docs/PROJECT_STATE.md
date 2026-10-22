# PROJECT_STATE

Updated: 2026-10-22
Status: active

## Objective

Cliente desktop de Twitch con reproducción, chat, grabación y Companion.
Store 1.5.2 indicada por el usuario el 2026-10-17 al actualizar la web.
GitHub 1.5.3 publicada y verificada; latest/descargas/updater 1.5.3.
Búsqueda del chat nativo y traducciones aceptadas y entregadas; Store y GitHub alineados en 1.5.2 según el usuario.

## Stack

- Frontend: React 19, Vite, Tailwind CSS, hls.js
- Native: Tauri 2, Rust 1.88.0 fijado; Streamlink/FFmpeg externos en GitHub, runtime portable incluido en MSIX
- Cloud: Supabase/Postgres, OAuth y Edge Functions Deno
- Packaging: NSIS/MSI, DMG/app archive, AppImage/deb
- Microsoft Store: 1.5.2 indicada por el usuario; MSIX x64 1.5.2.0; ADR-015
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

- Web oficial única — `https://apxstudio.es/`, privacidad en `/privacy.html`. Pages de BlinkStream desactivado; conservar Pages del repositorio `auth` y su confirmación OAuth. Carpeta `C:/Users/alber/Desktop/IA Project/APXStudioWeb`; `deploy.ps1` intacto. Desde el 2026-10-22, cada PATCH validado incluye autorización permanente de despliegue completo, también web por SSH; no pedir aprobación repetida para ese flujo.
- DEC-015 — Microsoft Store MSIX separado de NSIS/updater GitHub; updater nativo/IPC/UI desactivado y sin winget automático. Identidad oficial en `src-tauri/msix/identity.json`; ver ADR-015.

- Web Pi5 — Desplegar como parte de cada PATCH validado mediante `C:/Users/alber/Desktop/IA Project/APXStudioWeb/deploy.ps1`, sin modificarlo. Comprobar acceso/escritura, guardar copia remota previa y verificar hashes/HTTPS después. No cambiar permisos, claves ni configuración del servidor; detenerse si el script fuera a necesitar esa reparación. Actions/webhook descartado: autorización permanente no implica crear otra automatización.
- Versión web — «Current Version / Versión Actual» muestra únicamente la última versión publicada de BlinkStream, sin esperar a Microsoft Store ni añadir su versión al campo (petición 2026-10-22). No atribuir disponibilidad de un instalador a un canal sin verificarlo.
- DEC-001 — NSIS reemplaza al instalador personalizado; no mantener dos autoridades.
- DEC-002 — GitHub latest/fuente 1.5.3; CI firmado, 15 archivos públicos comparados con CI y cuatro firmas del updater verificadas. Históricas conservadas; Store 1.5.2 se actualiza por su propio canal.
- Plan 2026-10-13 — Hitos consecutivos: 1.5 organización/chat, 1.6 continuidad/medios, 1.7 moderación, 1.8 integraciones, 1.9 consolidación, 2.0 rediseño completo. Entregas mínimas y ampliaciones PATCH; IA/plugins/Kick/YouTube condicionados y no bloqueantes de 2.0. Detalle en ROADMAP, sin nuevas fechas ni cambio de versión publicada.
- DEC-003 — Updater falla cerrado: cuatro artefactos, firmas/comentarios, tag/config y clave coherentes.
- DEC-004 — IPC/capabilities mínimos; vistas remotas de Twitch no heredan permisos de la aplicación.
- DEC-005 — Favoritos autorizados mediante identidad auth confiable, no metadata editable.
- DEC-006 — Companion opt-in: token aleatorio de 128 bits en header, QR local, sin CORS universal; HTTP solo LAN de confianza, TLS pendiente.
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
- GitHub 1.5.3 publicada sobre `0eae25e`; CI candidato `39793015683`, CodeQL `39793022538` y publicación `39796091712`. Los 15 archivos públicos coinciden con CI y SHA-256; cuatro firmas del updater verificadas independientemente. Latest/master/updater coherentes en 1.5.3. Vitest/ui/coverage 4.1.12 corrige los dos avisos nuevos de @vitest/mocker del 2026-10-22; auditoría completa limpia y gate CI ampliado a dependencias de desarrollo.
- MSIX final 1.5.3.0 generado desde `0eae25e` y pack/unpack/PRI/iconos/runtime comprobados: `src-tauri/target/msix/BlinkStream_1.5.3.0_x64.msix`, 94.728.466 bytes, SHA256 `5cbc35ac0419cc11c18ca6d55bdd27b54cab5936d204edba4f8f2f3838550e5e`. No instalado, firmado, enviado ni certificado.
- Dependabot detectó tres avisos del servidor de desarrollo Vite 8.2.0 (GHSA-r825-w8mm-5pxw, GHSA-587h-7wmj-h5pm, GHSA-698v-4r3x-3vcv); actualizado a 8.2.4 y lockfile compatible. pnpm audit completo (producción/desarrollo): cero vulnerabilidades. Protección de contraseñas filtradas requiere Pro o superior según documentación oficial; no cambiar de plan automáticamente.
- Primer CI 1.5.3 `39493604739` bloqueó RUSTSEC-2026-0381/0382/0383 en certificados TLS. Cargo.lock publicado con rustls-webpki 0.103.16 y webpki-roots/webpki-root-certs 1.0.10; OSV: 562 paquetes, cero vulnerabilidades, nueve avisos informativos de mantenimiento. Revalidación nativa/CI completada sin suprimir reglas.
- Seguridad 1.5.3 autorizada y desplegada: auth_tokens privada, RLS forzada, TTL/UUID/identidad obligatorios y 22 handoffs caducados purgados. twitch-auth v38: refresh POST, identidad Twitch validada, migración legacy con prueba de sesión anterior y cliente de sesión aislado del service_role. Desktop publicado con validación horaria/logout remoto; Acerca de APX Studio en ocho idiomas.
- Advisor live: sin avisos de rendimiento; INFO RLS sin políticas intencional en tabla privada. Protección de contraseñas filtradas sigue desactivada y requiere ajuste manual o API de gestión autorizada disponible. Login Twitch real completo pendiente de aceptación.
- Validación candidata final 1.5.3: 749 frontend/1 omitido, 33 release, 11 pruebas OAuth sobre código real y 60 Rust Windows correctos; lint y build frontend correctos. Advisor del 2026-10-22 mantiene solo INFO de tabla privada y WARN de contraseñas filtradas (Pro+). El navegador para ese toggle quedó bloqueado por auto-review ante redirección ajena a Supabase. No se certifica login/logout real con cuenta Twitch ni GUI instalada.
- Web APX 1.5.3 desplegada por SSH el 2026-10-22 con autorización explícita para este parche. «Current Version» solo v1.5.3 en ES/EN; caché 20261022.1, roadmap y descargas actualizados. 46 checks DOM; once hashes remotos iguales a locales; once recursos HTTPS y home/auth HTTP 200. DOM público equivalente descontando únicamente transformaciones conocidas de correo/JSD de Cloudflare y formato. `deploy.ps1` intacto; sin cambios de permisos/claves. Copia previa 1.5.2: `/tmp/apxstudio-web-backup-1.5.3-EpgFDbOa`; previa al ajuste del campo: `/tmp/apxstudio-web-current-version-k0QiFVbQ` (temporales).
- GitHub 1.5.2 publicada, commit `3a5908e1d965cc99b4e5e8fc4fb37c1d1e6b2fa5`: búsqueda de chat nativo individual/unificado y traducciones aceptadas. CI candidato `39059837052` y publicación `39060821359` correctos; 15 archivos públicos coinciden con CI y hashes, cuatro firmas verificadas. Latest/master/public updater 1.5.2 coherentes. Store 1.5.2 indicada posteriormente por el usuario.
- CI previo de master/tag bloqueó los nuevos RUSTSEC-2026-0367/0368/0369. Fix: retirar feature ZIP opcional no utilizada del updater, conservando TLS, firmas y formatos EXE/AppImage/TAR.GZ. Auditoría actual: 562 paquetes, cero vulnerabilidades conocidas, nueve avisos de mantenimiento. No se ignoran avisos ni cambia la clave.
- Tras autorización explícita y CI verde se promovió master por fast-forward y se recreó únicamente v1.5.2 no publicado: anterior objeto `414f439` sobre `397b59c`, nuevo `bb195cf` sobre `3a5908e`. No se movieron otros tags ni releases publicadas.
- Evidencia histórica 1.5.2: 742 frontend/1 omitido, 33 release, Rust GitHub 60/Store 61, lint/fmt/Clippy correctos. Navegador: 66 casos de chat y 16 de enlaces Store; datos simulados, no prueba Twitch real ni desktop multiplataforma.
- MSIX histórico 1.5.2.0: SHA256 `7832cda78728528ba1ff7ee13ab503e5a60f79e8657ba7aa286be95267a47da5`; sustituido como candidato local por 1.5.3.0. Store pública sigue en 1.5.2, sin nuevo envío automático.
- Fuentes runtime publicadas una sola vez en v1.5.0: companion 2.116.378.839 bytes/SHA256 `f3bd70b2068668b6cfaa035ad405e1fb4d9b78a3327e90b586884d141befe0db`; suplemento Python LGPL/MPL 12.561.727 bytes/SHA256 `2601249875bdfb29b66f36fa06f4772c52f29f5f1d19ca1a453a4cdd3d6c2856`. Descargas públicas completas verificadas. Ver `reviews/MSIX_SOURCE_CORRESPONDENCE.md` y `guides/MSIX_PYTHON_SOURCES.md`; no certificación legal ni rebuild reproducible demostrado.
- Web APX desplegada el 2026-10-17 con el script original desde `APXStudioWeb`, por petición del usuario. GitHub/Store 1.5.2 ES/EN y caché 20261017.2 públicos; once hashes SSH iguales a locales, contenido HTTPS comprobado (solo transformación de correos de Cloudflare), portada y auth HTTP 200. Script intacto; sin cambios de permisos/claves ni Git remoto. Copia previa temporal en la Pi `/tmp/apxstudio-web-backup-qXyuV3jd`.
- Limpieza Actions pausada: el usuario rechazó borrar los 355 artefactos seleccionados. No ejecutar `scratch/actions-artifact-cleanup.json` sin renovar inventario/autorización. Sin instalaciones en host, despliegues cloud ni acceso a Partner Center.
NEXT:
- Prueba GUI voluntaria desde 1.4.1 y de conservación de settings/sesión, sin instalar automáticamente en el PC del usuario. Linux updater integrado requiere AppImage; `.deb` se actualiza manualmente/mediante paquetes.
- Validar canje EventSub real, Auto-Claim independiente y pausa/aislamiento del reporte nativo.
- App 1.5.x: ocultación de canales y refinamientos de colecciones; colecciones/categorías/búsqueda ya publicadas. Luego 1.6 VOD/bookmarks, workspaces y audio principal antes de ahorro/replay/biblioteca. Próximos PATCH incluyen despliegue completo y web SSH tras validar.
- Despliegues backend asociados a cada PATCH: validar cambios y rollback antes de aplicar; operaciones destructivas, costes nuevos o cambios ajenos al parche requieren autorización específica.

LATER:
- 1.7–1.9: consolidación de moderación, agenda/enlaces/privacidad e integraciones opcionales; baseline, migraciones y prototipos antes de rediseñar todas las pantallas en 2.0, conservando marca/paridad funcional. Ver ROADMAP.
- Retirar vendor GLib cuando GTK/Tauri tengan una dependencia oficial corregida compatible.
- Protección de contraseñas filtradas: requiere Pro+ y acceso al Dashboard; no cambiar el plan sin autorización de coste.

## Known Risks

- Seguridad: endurecimiento original incluido desde 1.5.0; corrección ZIP publicada en 1.5.2. Companion HTTP carece de confidencialidad y puede sufrir DoS local; refresh GET retirado el 2026-10-20 (clientes anteriores a POST deben actualizar). Las pruebas locales no certifican todos los flujos reales DNS/CDN, recorte y auth. Auditoría en `docs/reviews/SECURITY_AUDIT_2026-10-14.md`.
- La lista legacy mezclaba follows/pins sin procedencia. Se archiva recuperablemente (`blinkstream_favorites_legacy`), solo se migra a su propietario conocido y se excluyen follows observados del import cloud. Un follow antiguo ya eliminado antes de esta migración no puede distinguirse automáticamente de un pin; no se borran filas cloud ni preferencias/cookies.
- Firmas históricas 1.4.1 usan otro ID; clientes con una clave antigua no recuperable necesitan transición manual verificada. El smoke actual no prueba una migración histórica ni persistencia autenticada.
- Upgrades durante grabación activa y GUI instalada end-to-end siguen sin validar.
- Firma updater no sustituye Authenticode/notarización; pueden aparecer avisos Windows/macOS.
- Aceptación de Drops Windows no certifica sesiones/login/automatización ni desktop real en otras plataformas.
- Spade es interno: HTTP 204 no garantiza crédito. Pi-hole bloqueó su dominio; sin bypass DNS.
- GLib registry 0.18.5 original sigue vulnerable: solo nuestra copia parcheada está validada.
- Migración de permisos Supabase y `twitch-auth` desplegadas con autorización; protección de contraseñas filtradas desactivada, advertencia de usuarios anónimos pendiente de revisión funcional.
- Preparación automática de Streamlink/FFmpeg Windows depende de winget.

## Known Debt

- README recupera arquitectura/stack/setup/pruebas sin changelog de versiones. No hay `LICENSE` raíz aunque Cargo declara MIT; formalizar texto/copyright con el titular. `.env.example` y guía Twitch contienen opciones legacy; README avisa que no bastan para self-host y no recomienda secretos frontend.
- Auditoría UI: foco de otros modales, volumen cero/persistencia, índices/responsive multistream y contraste; `docs/reviews/UI_AUDIT_2026-10-02.md`.
- Tests nativos/auth reales no se sustituyen por mocks, headless CI o compilación.
- Mantener integridad/licencia/procedencia del vendor GLib; no ignorar avisos globalmente.

## Constraints

- Toda incorporación/corrección debe salir traducida a los ocho idiomas, incluyendo botones, ayudas, etiquetas accesibles, errores y estados vacíos. Verificar cambio de idioma sin perder estado y conservar contenido del usuario. La pausa de traducciones quedó levantada tras su aceptación; el 2026-10-17 el usuario autorizó publicación y recrear solo el tag 1.5.2 fallido después de validar.

- 2026-10-13: el usuario levanta el modo solo local para publicar 1.4.4 tras pruebas. Regla permanente: fixes/mejoras compatibles se suben como PATCH consecutivos tras validar; MINOR para entregas mayores acordadas. Actualizar siempre README, notas, roadmap del repo y web, junto a versiones nativas. Una instrucción posterior de pausa/solo local prevalece.
- Hotfix 1.4.3 autorizado el 2026-10-08; PATCH estable en lugar de 1.4.2-a (prerelease anterior). Guía: `docs/guides/HOTFIX_RELEASES.md`.
- Publicación 1.4.2 autorizada el 2026-10-07 tras validar las tres plataformas; no excluir Linux.
- 2026-10-22: autorización permanente para desplegar cada nuevo PATCH validado, incluida la web por SSH. No incluye instalaciones en el PC del usuario, cambios de claves/permisos/infraestructura, costes nuevos ni operaciones destructivas. No anunciar un envío/aprobación Store solo por generar el MSIX. Pausa/solo local posterior prevalece.
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

- 1.5.3: OAuth privado/single-use, identidad inmutable, continuidad legacy probada y logout remoto; backend live y release pública verificados. TLS/Vite/Vitest parcheados y auditoría CI completa. Web pública actualizada a 1.5.3 por SSH; última Store confirmada 1.5.2.
- 1.5.2: búsqueda nativa de sesión individual/unificada, filtros por texto/usuario/enlaces/origen, borrados de moderación y aislamiento entre cuentas/canales. Catálogo y cambio de idioma en ocho idiomas aceptados; sin persistir historial adicional.
- Retirada feature ZIP opcional del updater para excluir tres avisos nuevos de extracción, sin suprimir auditorías, cambiar confianza ni formatos publicados. CI candidato/tag y firmas públicas correctos; tag recreado con autorización específica, 1.5.2 latest.
- Notas por versión ES/EN en `docs/releases/X.Y.Z.md`, consumidas por release y manifiesto con regresión. Avisos Store con acceso a fuentes del runtime; companions publicados y verificados sin duplicar 2 GB.
- GitHub 1.5.0/1.5.1 publicadas con cuatro builds firmados y hashes públicos verificados; Store 1.5.1 confirmada por el usuario. Iconos transparentes claro/oscuro/DPI y PRI mantienen la identidad oficial.
- 1.5.0: colecciones locales personalizables y preferencias de categorías por cuenta, latencia compartida y endurecimiento de medios/IPC/tokens. Login/logout, reproducción, recorte y Companion aceptados por el usuario en Windows; no garantía universal.
- Web comercial única APX Studio ES/EN, diseño móvil y privacidad revisados; Pages de BlinkStream desactivado y Pages/auth conservado. Despliegue SSH separado a cargo del usuario, script intacto.
- `pnpm build:desktop` usa Tauri CLI/custom-protocol para incrustar dist; Cargo release directo no es el procedimiento de entrega. Prueba de regresión impide volver a abrir localhost en el ejecutable.

## Open Questions

- Confianza real de instalaciones antiguas y conservación de sesión/settings durante un upgrade.
- Canje EventSub autorizado y Auto-Claim real independiente en campañas activas.
