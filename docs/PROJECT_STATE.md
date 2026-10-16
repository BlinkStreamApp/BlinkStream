# PROJECT_STATE

Updated: 2026-10-17
Status: active

## Objective

Cliente desktop de Twitch con reproducción, chat, grabación y Companion.
Store 1.5.1 publicada según confirma el usuario el 2026-10-16.
GitHub 1.5.0 y 1.5.1 publicadas y verificadas; 1.5.1 es latest/descargas/updater.
Candidata local 1.5.2: búsqueda del chat nativo y traducciones aceptadas por el usuario; pendiente de publicación.

## Stack

- Frontend: React 19, Vite, Tailwind CSS, hls.js
- Native: Tauri 2, Rust 1.88.0 fijado; Streamlink/FFmpeg externos en GitHub, runtime portable incluido en MSIX
- Cloud: Supabase/Postgres, OAuth y Edge Functions Deno
- Packaging: NSIS/MSI, DMG/app archive, AppImage/deb
- Microsoft Store: 1.5.1 publicada (confirmación usuario); MSIX x64 1.5.1.0; ADR-015
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

- Web oficial única — `https://apxstudio.es/`, dominio confirmado el 2026-10-17; privacidad en `/privacy.html`. Pages del repositorio BlinkStream desactivado (API 404), sin eliminar fuentes históricas ni tocar Releases/updater. EXCEPCIÓN: conservar Pages del repositorio `auth`, confirmación OAuth en `https://blinkstreamapp.github.io/auth/` (HTTP 200, Pages built). No cambiar redirects ni desplegar OAuth. Mantener solo `../BlinkStreamWeb` como web comercial activa, con despliegue SSH a cargo del usuario y `deploy.ps1` intacto.
- DEC-015 — Microsoft Store MSIX separado de NSIS/updater GitHub; updater nativo/IPC/UI desactivado y sin winget automático. Identidad oficial en `src-tauri/msix/identity.json`; ver ADR-015.

- Web Pi5 — El usuario gestiona el despliegue SSH desde `../BlinkStreamWeb/deploy.ps1`, conservado sin cambios. Automatización Actions/webhook descartada y borradores eliminados por autorización; no retomarla ni acceder a la Pi durante la revisión local.
- DEC-001 — NSIS reemplaza al instalador personalizado; no mantener dos autoridades.
- DEC-002 — GitHub latest/fuente 1.5.1; CI firmado y cuatro artefactos públicos del updater verificados. Históricas 1.5.0/1.4.4 conservadas; Store se actualiza por su propio canal.
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
- 2026-10-17: el usuario autoriza retomar el cierre/publicación de 1.5.2 tras revisión local. Preparar CI firmado en candidato aislado antes de promover master/tag. No acceder a Partner Center, desplegar Supabase ni tocar Pages/auth; fuentes/licencias runtime y despliegue web se verifican por separado.
- Revisión 1.5.2 del 2026-10-17: sin regresiones bloqueantes detectadas en el diff. 730 frontend/1 omitido, 31 release, Rust GitHub 60/Store 61, Clippy/fmt/lint, seguridad Companion/refresh/OAuth (20), 66 comprobaciones navegador y build Tauri/MSIX correctos. pnpm/OSV sin vulnerabilidades conocidas consultadas (565 paquetes Rust; seis avisos informativos sin mantenimiento). MSIX `BlinkStream_1.5.2.0_x64.msix`: 94.721.474 bytes, SHA256 `4aa3f112961f2c013488304b70c7fdc2f0252fa9610fc3a48289e2dffd3ad46e`; sin instalar/subir. Falta CI firmado multiplataforma/publicación y cierre documental de fuentes/licencias GPL para distribuir Store; sin WACK/aceptación instalada propios del nuevo paquete. Detalles y límites en `reviews/RELEASE_READINESS_1.5.2.md`. No commit/push/tag/release; estado de aceptación actual sustituye las entradas históricas pendientes de revisión.
- 2026-10-17: usuario valida la candidata traducida 1.5.2. Web comercial de Pages retirada; confirmación de login independiente conservada y comprobada HTTP 200. README/privacidad/procedimiento apuntan a APX Studio; archivo histórico web deja de exigir bump de versión para cada release. 31 tests release pasan. Cambios locales sin commit/push/tag/release; publicación de app aún no retomada.
- Candidata 1.5.2: búsqueda nativa individual/unificada, lógica aceptada por el usuario; publicación pausada para cerrar traducciones. Completados buscador, pestañas/estados vacíos/ayudas/etiquetas accesibles, contador neutro y errores locales relacionados en ocho idiomas. El cambio de idioma conserva filtros, borrador, destino, nombres/contenido y socket; regresiones con i18n real. 730 frontend pasan/1 omitido, 30 release, lint y build Tauri Windows correctos; 66 comprobaciones navegador sin incidencias (dos modos, ocho idiomas, 280/320/390/700 px y dos ventanas de 400 px de alto, datos simulados). Actualizado el mismo `src-tauri/target/release/blinkstream-1.5-test.exe`: 20.495.360 bytes, SHA256 `2892c946dd5bb18fb193bc6d911db38b33353b2f97d28c7a6c5206aba38adc31`. Sin instalar/ejecutar ni commit/push/tag/release. Latest/updater/Store siguen en 1.5.1; el binario traducido espera revisión del usuario antes de retomar publicación y CI firmado.
- Web corporativa `../BlinkStreamWeb`: contenido ES/EN, privacidad alineada con PRIVACY.md, roadmap completo hasta 2.0 y único diccionario apx-i18n con cargador legacy. Correcciones móviles de cabecera/márgenes/pie; 56 combinaciones página/idioma/anchura comprobadas. El usuario confirma resuelto el arranque del script (PowerShell 7 interpreta UTF-8 sin BOM; 5.1 requiere BOM). Script intacto; despliegue a su cargo. Copias originales de revisión conservadas en `C:/Users/alber/AppData/Local/Temp/BlinkStream-web-review-20261016`, fuera del lint de la app.
- GitHub 1.5.0/1.5.1 publicadas por autorización: base reconstruida sin icon fix `0fd0a5fef0a8cf0ab4152ea3f2ab3e612b37589b`, hotfix `f1a25f1fcadcbc8404ee3255f54617370a960550`. CI 38924898662/38925125890 correctos: calidad, cuatro builds firmados, NSIS smoke y verificación del manifiesto. Cada release tiene 15 assets/notas ES/EN; todos los bytes públicos coinciden por SHA256 con CI y las cuatro firmas públicas verifican. 1.5.0 histórica; 1.5.1 latest y manifiesto nuevo. README/roadmaps/web/descargas sincronizados. El intento de avanzar master antes de CI fue retenido por seguridad; no se saltó el control y se esperó a CI completo. Pi fuera del commit, ningún Actions eliminado.
- Enlaces Store HTTPS y ms-windows-store añadidos al README/web; Pages 38924897652 correcto y web pública HTTP 200 con ambos enlaces verificada. 704 frontend/1 omitido, 30 release y lint completo correctos. Una copia temporal del índice para comprobar 1.5.0 se apartó a Temp para no duplicar pruebas; las suites reales pasan.
- Hotfix 1.5.1 generado y validado: `target/msix/BlinkStream_1.5.1.0_x64.msix`, 94.712.117 bytes, SHA256 `5FEF473218DDA1408FC15D0DD2F4CBBF2326CE8627337A8FEB07C9B2CFE5535C`. Build Store, MakeAppx pack/unpack, hashes de 63 PNG/PRI/runtime y dump de qualifiers/ruta Files/Assets correcto; 702 frontend/1 omitido, 29 release, lint completo pasan. Vista previa transparente revisada; apariencia instalada pendiente del usuario. No instalación, push, envío ni publicación por el agente; runtime/fuentes 1.5.0 idénticos, sin duplicar ZIP de 2 GB.
- 2026-10-16: usuario confirma 1.5.0 aceptada y publicada en Microsoft Store; Partner Center sigue a su cargo. Hotfix fuente/paquete 1.5.1/1.5.1.0: faltaban variantes unplated/target-size y resources.pri, causando fallback con placa/reducción en barra. Generar 63 variantes PNG del logo maestro aprobado, indexar con MakePRI y verificar hashes/variantes tras MakeAppx. README/notas/roadmaps/web actualizados sin anunciar instaladores GitHub inexistentes; conservar identidad Store. Validación visual instalada a cargo del usuario, no limpiar caché ni instalar en host.
- 2026-10-15 entrega local MSIX: usuario gestiona Partner Center; no acceder/subir/enviar allí. Reconstruido `BlinkStream_1.5.0.0_x64.msix`, 93.565.748 bytes, SHA256 `58255335F510ED40EDB558D417C6C56366577479C45256F38CDE95941A602832`; MakeAppx pack/unpack y hashes internos correctos. Avisos Streamlink/Python/FFmpeg visibles en Acerca de (solo Store). 702 frontend pasan/1 omitido, 28 release y lint de archivos cambiados correctos. Sin instalar, firmar ni publicar; nueva hash no tiene aceptación guest/WACK propia.
- Fuentes compañeras actualizadas: ZIP local 2.116.378.839 bytes, SHA256 `f3bd70b2068668b6cfaa035ad405e1fb4d9b78a3327e90b586884d141befe0db`, inventario verificado, scripts/patches/cache, mapa de build y configure FFmpeg observado completo. Publicación accesible y revisión completa de correspondencia/licencias siguen pendientes antes de distribución pública; no bloquean generar/entregar el archivo local. Instrucciones `MSIX_SUBMISSION.md`; sin URL ficticia ni garantía de certificación.
- 2026-10-15: usuario elige certificación Store con publicación manual retenida, sin nueva VM/PC. WACK local recomendado pero no bloquea por sí solo la subida; su fallo Sandbox sigue sin informe, no equivale a aprobado. Preparación y notas en `docs/guides/MSIX_SUBMISSION.md`; falta cerrar fuentes/licencias y acceso/cuenta de pruebas para envío verificable. Ninguna subida ni envío realizado.
- MSIX: portable oficial Streamlink 8.6.2-1/Python 3.14.8/FFmpeg GPL incluido y fijado por SHA256; avisos preservados, sin PATH/winget ni bytecode Python en WindowsApps. Candidato 1.5.0.0 x64 de 93.564.278 bytes; hash/tamaño/procedencia en `target/msix/candidate.json`, comprobados antes del Sandbox. Paquete original unsigned; firma/certificado no exportable e instalación solo en guest con PFN oficial, sin certificados/app en host. 700 frontend/1 omitido, 61 Rust Store, 28 release, lint/Clippy/build correctos.
- WebView2: usuario elige Evergreen externo, no runtime fijo empaquetado. Preflight nativo con aviso en ocho idiomas; ExternalDependency solo App Installer, no Store/Add-AppxPackage. Sandbox reproduce instalación Evergreen `0x80040902` y runtime no detectado pese a carpetas existentes (#5697 upstream). Override de carpeta firmada solo en proceso diagnóstico guest abre onboarding real, verificado visualmente; no prueba registro normal/PC limpio. Streamlink empaquetado y MP4 libx264 correctos. Login/directo/chat/grabación/upgrade sin aceptación explícita. Guía `MSIX_STORE.md`.
- WACK no completado en este entorno: toolkit oficial 26100.9457 instalado solo en guest (exit 0). Candidata F85811475F973881609D22779C3AD7D5A0807AC8D355F38F6BE52929FFF89771 firmada/verificada/instalada allí. Appcert falla generando informe con System.UnauthorizedAccessException/ManagementObjectSearcher, exit -532462766, sin XML. WMI denegado también bajo SYSTEM; no modificar permisos ni falsear pruebas. Coincide con fallo Sandbox Microsoft #67. Nueva VM no exigida para continuar con certificación Store; Evergreen normal sigue sin validar. No instalar en host sin autoridad nueva.
- Fuentes runtime preparadas por separado: archivos fijados de FFmpeg/CPython/Streamlink/build scripts y caché upstream del mismo build FFmpeg (226 entradas, 2,06 GB). Bundle local de unos 2,12 GB e inventario con hashes; OSV no devuelve avisos para los 23 paquetes Python consultados (no garantía global). Correspondencia completa/instrucciones/licencias y publicación de fuentes siguen siendo gates; no subir candidato con avisos legales de desarrollo. Guía `MSIX_RUNTIME_SOURCES.md`. Sin push/subida Store ni limpieza Actions.
- Limpieza Actions pausada por petición explícita: inventario 562; selección afinada 355 artefactos de pruebas master/main finalizadas (>7 días, conserva dos recientes por nombre, excluye tags/Releases). Primer borrado bloqueado por auto-review, no se ejecutó; usuario eligió no borrar todavía. Plan local `scratch/actions-artifact-cleanup.json`, no usar sin renovar selección/autorización. Ningún artefacto remoto borrado.
- Seguridad 2026-10-14: Supabase producción restringido mediante migración `20261014191011` (equivalente a `20260804195525` local), sin borrar datos. `twitch-auth` v36 desplegada con refresh POST acotado y GET temporal compatible con 1.4.4; smoke con tokens sintéticos confirma rutas, no login real. Árbol local endurecido: medios/DNS/FFmpeg, tokens en memoria/keychain, Companion/QR local, IPC/CSP/logs y dependencias. 681 frontend pasan/1 omitido, 59 Rust, 23 release, 20 OAuth/Companion; lint/Clippy/build Windows correctos. Ejecutable único de prueba `src-tauri/target/release/blinkstream-1.5-test.exe`, sin instalar/ejecutar. Aceptación nativa y publicación pendientes; informe `docs/reviews/SECURITY_AUDIT_2026-10-14.md`.
- 1.5: colecciones con portadas, botón de subida y minimizar/expandir aceptadas por el usuario en Windows. Categorías favoritas/ocultas implementadas localmente con filtro, deshacer/restaurar y persistencia acotada por cuenta; búsqueda no mezcla pins ajenos, ocultar cancela directos pendientes y fallos de almacenamiento no simulan éxito. 666 frontend pasan/1 omitido, 23 release/documentación y lint/build frontend correctos. Categorías pendientes de aceptación nativa; búsqueda del chat e internacionalización completa pendientes. No publicado ni cambio de versión; próximo ejecutable único `src-tauri/target/release/blinkstream-1.5-test.exe`.
- Colecciones personalizables locales: tarjetas 3:4 coherentes con Categorías, seis colores y subida PNG/JPG/WebP hasta 5 MB, recortada a JPEG 285×380 con límite persistido de 120k caracteres. Portadas/deshacer por cuenta y protección contra uploads tardíos. Consulta de Inicio incluye canales de colecciones no seguidos, refresco por membresía y cada 60 s; requests abortables/12 s y estados remoto En vivo/Offline/Sin confirmar. 653 frontend pasan/1 omitido, 23 release/documentación y lint/build Windows correctos; preview simulado escritorio/móvil sin overflow. Exe `src-tauri/target/release/blinkstream-collection-covers-test-20261013.exe` no instalado/ejecutado por el agente. Pendientes aceptación Twitch e idiomas; sin Git remoto/release.
- Colecciones UX revisadas tras feedback: listas/canales visibles sin desplegar, antes de categorías; tarjetas para ver y gestión separada con botones Nueva colección/Gestionar. Reutiliza metadata/avatar de Inicio sin peticiones adicionales ni estado offline inventado. Nueve tests específicos, 645 frontend pasan/1 omitido y lint correcto; preview simulado de escritorio/móvil sin overflow. Evidencia `scratch/collections-ux-visible.png`; pendientes aceptación nativa e idiomas, no publicado.
- 1.5 en desarrollo local, bloque inicial Colecciones: editor en Inicio para crear/renombrar/eliminar con deshacer, añadir/quitar/ordenar canales y ordenar listas. Persistencia local acotada por cuenta, sin follows/cloud modificados; editor con key de propietario invalida drafts/selección/undo al cambiar sesión. Ocho pruebas específicas; suite 644 pasan/1 omitido, 23 release/documentación, lint/legacy y build Windows correctos. Exe `src-tauri/target/release/blinkstream-collections-test-20261013.exe` sin instalar/ejecutar por el agente; incluye la latencia local en prueba, no publicada. Pendientes aceptación visual/nativa e internacionalización del editor. Categorías favoritas/ocultas y búsqueda del chat siguen después. No se cambia versión publicada ni se sube esta implementación aún.
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
- 1.5.2: aceptar búsqueda en sesión real y cerrar CI de publicación. Después 1.5.x: ocultación de canales y refinamientos de colecciones; colecciones personalizables y preferencias de categorías ya publicadas. Luego 1.6 VOD/bookmarks, workspaces y audio principal antes de ahorro/replay/biblioteca.
- Supabase: desplegar funciones/migración solo con autorización aparte.

LATER:
- 1.7–1.9: consolidación de moderación, agenda/enlaces/privacidad e integraciones opcionales; baseline, migraciones y prototipos antes de rediseñar todas las pantallas en 2.0, conservando marca/paridad funcional. Ver ROADMAP.
- Retirar vendor GLib cuando GTK/Tauri tengan una dependencia oficial corregida compatible.
- Activar protección de contraseñas filtradas en Supabase tras autorización.

## Known Risks

- Seguridad: correcciones cloud aplicadas y locales implementadas, no publicadas. Companion HTTP carece de confidencialidad y puede sufrir DoS local; refresh GET temporal por compatibilidad. Seis avisos de mantenimiento Rust transitivos; DNS/CDN, recorte y auth reales requieren aceptación nativa. Auditoría detallada en `docs/reviews/SECURITY_AUDIT_2026-10-14.md`.
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

- 2026-10-16: toda incorporación/corrección debe salir traducida a los ocho idiomas, incluyendo botones, ayudas, etiquetas accesibles, errores y estados vacíos. Verificar cambio de idioma sin perder estado y conservar contenido del usuario. La publicación de 1.5.2 está pausada explícitamente por el usuario hasta cerrar las traducciones; no hacer commit/push/tag/release en este bloque.

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

- Traducciones recientes completas en los ocho idiomas de la app: Colecciones/editor/portadas/errores/estados, Categorías/filtros y nombres de idioma, chat unificado y avisos nuevos de auth/Companion/QR. Catálogo único por feature integrado en i18n; nombres de usuario/colección sin traducir. Once regresiones de integridad/render/cambio de idioma; suite 694 pasa/1 omitido, 24 release y lint correctos. Build de prueba actualizado sin instalar/ejecutar ni push; revisión visual nativa multidioma pendiente. Usuario confirmó login/logout, reproducción, recorte y Companion en Windows tras el endurecimiento.

- Corregida compilación de prueba que abría localhost: Cargo release directo omitía `tauri/custom-protocol`. Usar `pnpm build:desktop` (Tauri CLI, sin bundle) para incrustar dist. Regresión de script y advertencia de build para release en modo dev; sustituir el mismo ejecutable de prueba tras recompilar. No confundir compilación con aceptación visual nativa.

- Automatización web Pi5 descartada y nueve borradores locales eliminados por petición del usuario; despliegue SSH separado a su cargo desde `../BlinkStreamWeb`. Revisión local de la web autorizada; no ejecutar despliegue ni modificar `deploy.ps1`.
- Política `PRIVACY.md` y web `docs/privacy.html` publicadas por autorización del usuario: commit documental aislado `0565faa`, generador desde Markdown y enlaces web/README; app 1.5/latencia permanecen locales. Pages `38590735220` correcto; `https://blinkstreamapp.github.io/BlinkStream/privacy.html` verificada sin autenticar (HTTP 200, diez secciones/contacto) y enlazada en web pública. Identidad legal, retención/infraestructura y revisión legal siguen en checklist; sin implementar enlace dentro de la app.
- Categorías: modo Gestionar categorías cerrado por defecto, acciones de fijar/ocultar y restauración visibles solo durante edición; conserva preferencias al cerrar y reinicia edición entre cuentas. 667 frontend pasan/1 omitido y lint correcto. Ejecutable estable `src-tauri/target/release/blinkstream-1.5-test.exe`, sin instalación/ejecución por el agente.
- Firma corregida sin rotación de claves; cuatro firmas verificadas criptográficamente en CI y local.
- Backport GLib probado con optimización; seis alertas originales cerradas automáticamente por GitHub.
- Corregido mirror-file APT del runner; secreto limitado al paso de bundle y smoke NSIS con restart.
- Inventario oficial Drops integrado, pausa persistida de Auto-Claim incierto y foco/teclado pulidos.
- EventSub y buscador endurecidos contra respuestas obsoletas y lifecycle incorrecto.

## Open Questions

- Confianza real de instalaciones antiguas y conservación de sesión/settings durante un upgrade.
- Canje EventSub autorizado y Auto-Claim real independiente en campañas activas.
