# PROJECT_STATE

Updated: 2026-10-07
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
- `src/hooks/useTwitchDrops.js` y `src/utils/drops.js` — estado y normalización del inventario de Drops
- `src/utils/twitchEventSub.js` — lifecycle y autorización de avisos de canjes personalizados
- `docs/EXECUTION_PLAN.md` — bloques de ejecución, dependencias y criterios de cierre
- `docs/guides/DROPS_NATIVE_WATCH_TEST.md` — prueba manual de reportes y acreditación remota
- `docs/reviews/UI_AUDIT_2026-10-02.md` — revisión de interfaz, evidencias y prioridades de corrección
- `src/utils/tauriHls.js` — carga nativa de manifiestos HLS con headers Twitch
- `src-tauri/src/lib.rs` — comandos Tauri y registro de plugins
- `src-tauri/src/companion.rs` — servidor Companion, cache validada de Drops e integración por eventos
- `src-tauri/src/drops_watch.rs` — gate de reproducción real y reporte Spade experimental (opt-in)
- `src-tauri/src/embedded_drops.rs` y `src/hooks/useEmbeddedDropsInventory.js` — host oficial de inventario integrado, permisos, límites y lifecycle
- `src-tauri/windows/hooks.nsh` — migración de instalaciones Windows heredadas
- `src-tauri/tauri.conf.json` — seguridad, updater y bundle base
- `src-tauri/tauri.release.conf.json` — artefactos firmables de actualización
- `supabase/functions/` — autenticación y API de datos
- `supabase/migrations/` — esquema y permisos versionados
- `.github/workflows/release.yml` — controles de calidad, firma y publicación

## Current Decisions

- DEC-001 — NSIS sustituye al instalador React/Rust personalizado; no deben coexistir dos instaladores.
- DEC-002 — La versión fuente canónica es `1.4.2`, sincronizada en Node/Tauri/Cargo; la última publicada sigue siendo `1.4.1` hasta un release firmado.
- DEC-003 — El updater falla cerrado si falta una firma; Linux usa AppImage firmado. Tauri 2 admite bytes AppImage y archivos gzip, según configuración de artefactos.
- DEC-004 — El frontend no conserva permisos de shell/filesystem no utilizados.
- DEC-005 — La identidad de favoritos usa `auth.users.id` y metadata confiable, nunca `user_metadata` editable.
- DEC-006 — Companion acepta PIN exacto, rota el PIN al iniciar y no expone CORS universal.
- DEC-007 — Los manifiestos HLS se obtienen en Rust; hls.js descarga y reproduce los fragmentos.
- DEC-008 — Rust lee la cookie HttpOnly desde WebView2 y consulta el inventario sin exponer tokens al frontend ni usar Companion HTTP. Retirado el iframe oculto; no acreditar minutos a partir de consultas de inventario.
- DEC-009 — EventSub sustituye PubSub para altas/cambios de canjes personalizados, con validación de identidad/scopes y estado explícito de conexión; sin autorización del creador se conserva el chat oficial.
- DEC-010 → `docs/decisions/ADR-010-official-drops-claim.md`: reclamo nativo mediante controles de la página oficial, sin mutación HTTP directa ni bypass; éxito condicionado a inventario confirmado.
- DEC-011 rechazada → `docs/decisions/ADR-011-drops-official-playback.md`: el usuario exige reproducción nativa sin acudir al player de Twitch; retirada la alternativa de ventana oficial.
- DEC-012 → `docs/decisions/ADR-012-experimental-native-drops-watch.md`: reporte experimental de minutos de reproducción medidos en Rust, con opt-in, endpoint acotado, pausa ante rechazos y progreso solo remoto.
- DEC-013 → `docs/decisions/ADR-013-embedded-drops-inventory.md`: el reclamo oficial se aloja en una Webview hija del modal, sin popout. Comandos de Drops usan la `Webview` principal recibida para seguir operativos al añadir vistas hijas; credenciales y verificación permanecen nativas/oficiales.
- DEC-014 → `docs/decisions/ADR-014-glib-gtk3-security-backport.md`: mantener GTK3 mediante GLib 0.18.5 vendorizado con el parche upstream exacto, integridad del árbol y regresión optimizada en Linux; no falsear la versión ni ocultar Dependabot.

## Current Work

NOW:
- Publicación del tag/release 1.4.2 autorizada el 2026-10-07 únicamente tras validar el candidato firmado. El usuario exige Windows, macOS y Linux; no excluir Linux para acelerar. No instalar nada en su PC. Updater: firmante actual/config verificados; artefactos históricos 1.4.1 incompatibles y upgrade instalado pendiente. Ver `docs/guides/UPDATER_VERIFICATION.md`.
- CI anterior falló al decodificar saltos de línea en el Base64 exterior del secreto. El wrapper elimina solo ese whitespace sin alterar clave/contraseña ni registrarlas. Backport GLib preparado y probado en integridad; ejecución Linux optimizada y cuatro bundles firmados pendientes del nuevo CI. Suite release local: 11 tests correctos.
- Verificación local 1.4.2: 513 frontend/1 omitido, 8 release/seguridad y 56 Rust; lint/fmt/Clippy y build Windows correctos. El contrato UI del updater cubre consentimiento y fallo de firma/instalación sin reinicio. CI remoto y plataformas adicionales no equivalen a estas pruebas Windows.
- Hardening del updater: firmas/bytes/comentarios de cuatro plataformas obligatorios, tag/config coherentes y publicación central tras verificación. Usuario sin archivos de claves; diagnóstico CI `37668124715` recuperó solo la pública y confirmó firmante/config actuales con prueba criptográfica. Artefactos antiguos de CI `33440160727` siguen firmados con otra clave. Clientes antiguos requieren comprobar confianza/migración antes de prometer auto-upgrade.
- Hardening enviado en `02bbadb`, bootstrap diagnóstico corregido en `4698c0d`; GitHub cerró cinco avisos originales y mantiene solo GLib. CI release `37667316122` sigue en curso; diagnóstico público completado con éxito. Ningún tag/release/instalación realizado.
- Push de código/docs completado a master el 2026-10-07: EventSub `7bf6005`, Drops `25170a1`, buscador `56f0f9d` y documentación `7cd688b`. CI Release Build iniciado para ese código; resultado pendiente al registrar este estado. Release 1.4.2 no publicado.
- Inventario oficial integrado y pulido aceptados por el usuario («Funciona perfectamente» / «todo correcto»), 2026-10-07: foco/restauración y Tab en React, Escape consumido, aislamiento de atajos, pestañas y visibilidad nativa. La aceptación general no prueba por separado clic automático/login/vinculación; React no controla el foco de Twitch.
- Revisión de interfaz: 18 hallazgos documentados; aislamiento de atajos y foco del modal de Drops corregidos localmente. Siguen pendientes foco de otros modales, persistencia de volumen y estado/responsive de multistream. Las acciones autenticadas y accesibilidad con lector de pantalla siguen sin validar.
- Bloque 1 de `docs/EXECUTION_PLAN.md`: EventSub y aislamiento de teclado implementados; falta validación nativa con un canje real y campaña activa de Drops.
- Pulido del buscador de canales: descarta respuestas obsoletas, cancela resultados tras Escape/clic fuera/selección y respeta atajos consumidos o modificados. Regresiones reproducidas antes del fix; integrado en el ejecutable local recompilado el 2026-10-03. Suite frontend actual 486 tests correctos, uno omitido, lint/build correctos.
- Confirmar acreditación y reclamo de Drops: el inventario devolvió seis campañas en esta máquina el 2026-09-01; ese dato histórico no confirma progreso actual.
- Detección de campañas del canal confirmada por el usuario; corregido bucle Auto-Claim/refresco del mismo Drop. Pendiente comprobar estabilidad del panel y progreso/reclamo reales con el último backend recompilado.
- Capturas del 2026-10-03 muestran 32→33 minutos y «Appearance Change x1» reclamado. El usuario confirma que Auto-Claim solo abrió la ventana: tuvo que pulsar Reclamar manualmente; al cerrar apareció un error y la ventana se reabría periódicamente. Corregidos localmente la pausa persistida ante reclamo nativo no confirmado, reconciliación del error con inventario por ID estable y consulta final antes de informar cierre. Añadido reconocimiento acotado de «Reclamar ahora»/«Claim now» mediante nombre e imagen de recompensa. 486 tests frontend/53 Rust, lint, fmt y Clippy pasan; cambios integrados en el ejecutable local del 2026-10-03, pendiente comprobar clic automático real. No confundir reclamo manual con Auto-Claim validado.
- El usuario informa cero minutos tras cinco minutos de vídeo nativo y rechaza abrir Twitch para reproducir. Retirados el iframe cubierto y la alternativa de ventana oficial. El watcher solo consulta inventario; el reporte experimental se mantiene separado y requiere confirmación de acreditación en Twitch.
- Reporte experimental `minute-watched` ligado al player nativo, opt-in. Capturas del usuario del 2026-10-02 muestran aumento de 0 a 1, 6, 7 y 8 minutos en los cuatro Drops de «War for Atreia - Series 1» (AION 2). Entre 6 y 7 muestra estado pausado, muestreo 50/60 s y después un reporte aceptado: recuperación con progreso remoto observada. No hay captura de contadores durante toda la pausa ni confirmación de aislamiento de otras sesiones. Pendientes esos controles y reclamo real al completar un Drop. El usuario no quiere esperar para reclamar: usar otro Drop ya listo cuando exista. No exigir igualdad entre reportes de esta sesión y minutos totales del inventario.
- Primera prueba bloqueada por DNS: `spade.twitch.tv` resolvía a `0.0.0.0`/`::`; el usuario confirma Pi-hole. Diagnóstico DNS y pausa sin bypass implementados. La siguiente captura muestra reporte aceptado y progreso; no implica validación completa del flujo.
- Ejecutable autónomo local de pruebas `src-tauri/target/release/blinkstream.exe` recompilado el 2026-10-07 con el pulido de foco/teclado, pestañas y visibilidad del inventario integrado. Frontend y release nativo compilados correctamente. Build sin bundle mediante CLI Tauri instalada; override temporal de beforeBuildCommand usa Node/Vite locales, sin modificar configuración persistida ni instalar dependencias. App cerrada durante el build; no instalado, iniciado ni publicado.

NEXT:
- Continuar viendo VODs y marcadores; después perfiles de espacio de trabajo y audio principal en multistream.
- Desplegar las Edge Functions modificadas y la migración Supabase `20260804195525` tras autorización.
- Crear un tag de release con la clave de firma de producción y probar una actualización real.

LATER:
- Activar la protección de contraseñas filtradas desde la configuración del proyecto Supabase.

## Known Risks

- Dependencias: cinco avisos originales corregidos, además nanoid 3.3.18; audit npm sin vulnerabilidades. GLib 0.18.5 de GTK/Linux usa backport local de las dos líneas upstream vulnerables; pendiente regresión optimizada Linux. Dependabot puede seguir señalando la versión antigua: no ocultar la alerta, retirar el vendor cuando exista una actualización compatible (ADR-014).

- La migración `20260804195525_harden_favorites_identity_permissions.sql` existe localmente pero no está desplegada.
- Los cambios locales de `twitch-auth` y `blinkstream-data` aún no están desplegados en Supabase.
- El firmante actual coincide criptográficamente con la clave configurada, pero firmas históricas 1.4.1 usan otra clave y fallan con la actual/del tag. No reutilizarlas; pendiente CI firmado nuevo y upgrade en instalación desechable. Si un cliente confía en una clave antigua no recuperable, requiere instalación manual de transición.
- La firma del updater no sustituye Authenticode/notarización; no hay certificados de plataforma configurados y Windows/macOS pueden mostrar avisos de confianza.
- `updater.json` conserva la versión publicada `1.4.1`; no cambiarlo a `1.4.2` antes de disponer de artefactos reales y firmas compatibles.
- Las pruebas Deno de Edge Functions se ejecutan en CI; Deno no está instalado en este equipo.
- La protección de contraseñas filtradas está desactivada en la configuración externa de Supabase.
- La preparación automática de Streamlink/FFmpeg en Windows depende de `winget`.
- HLS por sí solo y el watcher de inventario no registran visionado. Con el reporte experimental se observa progreso remoto hasta 33 minutos y recuperación tras estado pausado; falta confirmar ausencia de reportes durante la pausa y aislamiento de otras sesiones. Reclamo manual confirmado por el usuario, clic automático no validado. Tests/build no sustituyen esa prueba.
- Spade es un protocolo interno: HTTP 204 no garantiza acreditación. La prueba nativa no resuelve el reclamo 100 % nativo; Auto-Claim conserva su flujo oficial independiente.
- Disponibilidad de Drops no implica progreso acreditado: sin datos `self`, el panel indica progreso no confirmado. Los errores GraphQL no equivalen a un inventario vacío.
- La consulta nativa de inventario no garantiza autorización de reclamo: Twitch exige su verificación de integridad. No falsificar ni eludir esa verificación; recuperar mediante el flujo oficial.
- EventSub solo recibe canjes personalizados autorizados; no equivale a todas las funciones privadas del chat oficial. Validar permisos y CSP en una sesión nativa.

## Known Debt

- La revisión UI detecta volumen cero sobrescrito al abrir ajustes, foco detrás de modales, índices ocultos en multistream y contraste insuficiente de texto auxiliar. Correcciones pendientes; detalle y regresiones en `docs/reviews/UI_AUDIT_2026-10-02.md`.
- `ROADMAP.md` distingue implementación local de validación/publicación. `RELEASE_NOTES.md` y la web de `docs/` deben actualizarse al preparar el release firmado.

## Constraints

- No desplegar migraciones, Edge Functions ni releases sin autorización explícita.
- Commit/push y publicación 1.4.2 autorizados explícitamente el 2026-10-07; publicar solo después de validar el candidato de las tres plataformas. No instalar nada en el PC del usuario. Despliegues Supabase siguen sin autorización.
- No abrir ventanas aparte para el reclamo de Drops: usar el panel oficial integrado y conservar los requisitos de integridad/vinculación de Twitch.
- No trasladar la reproducción al player oficial de Twitch ni abrir otro player para Drops; el objetivo es reproducción nativa sin anuncios, con progreso remoto observado hasta 33 minutos y controles de pausa/automatización pendientes.
- No almacenar secretos Twitch en el frontend ni en el repositorio.
- Mantener compatibilidad Windows, macOS y Linux en el código compartido.

## Invariants

- Todo proceso Streamlink/FFmpeg creado tiene estrategia de cleanup.
- Cambiar o cerrar un stream no deja procesos huérfanos.
- IPC expone la mínima superficie privilegiada necesaria.
- Un manifiesto de actualización no se publica con firmas vacías o ausentes.
- La identidad de autorización no depende de metadata editable por el usuario.
- Montar el chat oficial no borra ni falsifica cookies de sesión de Twitch.
- Las cookies de sesión de Twitch permanecen en WebView2/Rust y nunca se entregan al frontend ni se registran.

## Recent Changes

- Inventario y pulido aceptados por el usuario; preparación 1.4.2 y push autorizados, con documentación actualizada y diagnóstico de firmas del updater. Validación local: 513 frontend/1 omitido, 4 manifiesto, 56 Rust, lint/fmt/Clippy. No equiparar aceptación general de Drops con prueba aislada de Auto-Claim (ADR-013).
- Drops: progreso remoto hasta 33 minutos y primer reclamo manual observados. Corregido ciclo de reapertura y error obsoleto tras reclamo; pausa de Auto-Claim persistida, reconocimiento por nombre/imagen y confirmación remota aun con ventana cerrada. Suite 486 correctos/1 omitido y 53 Rust; nuevo ejecutable local compilado el 2026-10-03, pendiente validar clic automático real.
- Drops: retirada la alternativa de reproducción oficial tras aclaración del usuario; conservados vídeo nativo, inventario y ausencia de iframe oculto. La prueba nativa reemplaza esa alternativa; primer progreso observado, sin validación completa aún.
- Drops: controlador de página oficial sin peticiones propias ni lectura JS de credenciales; 452 tests frontend y 45 Rust pasan, lint/Clippy/build correctos. Nueva compilación autónoma preparada; pendiente comprobar un reclamo real automático. La pausa previa se reanuda explícitamente con el toggle Auto-Claim.
- Endurecidos CSP, permisos Tauri, release CI y firma obligatoria del updater.
- Corregidos lifecycle, PIN y cabeceras de seguridad de Companion.
- Endurecida la identidad y los permisos de favoritos en código y migración Supabase.
- Buscador: resultados/errores antiguos no sustituyen consultas nuevas ni reabren la lista cerrada; debounce, selección y atajos probados. Suite frontend 478 correctos/1 omitido, lint/build correctos; ejecutable de pruebas sin cambios para preservar Drops en curso.
- Eliminadas dependencias y capacidades no utilizadas; lint y Clippy quedan sin advertencias.
- Corregida sincronización de Drops: inventario consultado en Rust con cookie HttpOnly, refresco no bloqueante y timeout explícito en el panel.
