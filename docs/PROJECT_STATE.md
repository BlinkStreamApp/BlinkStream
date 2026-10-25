# PROJECT_STATE

Updated: 2026-10-25
Status: active

## Objective

Cliente desktop de Twitch con reproducción, chat, grabación y Companion.
Store 1.5.2 indicada por el usuario el 2026-10-17 al actualizar la web.
GitHub 1.5.3 publicada y verificada; latest/descargas/updater 1.5.3.
Fuente 1.5.4 candidata: corregir pantalla negra de Mod View y acceso a emisiones solo 1440p.

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
- Versión web — Campos y badges de versión actual muestran únicamente la última versión publicada de BlinkStream, sin esperar a Microsoft Store ni mantener etiquetas de versión separadas por canal (petición 2026-10-22). Tarjeta Store sin número de versión; conservar historial del roadmap y no atribuir una versión a un canal sin verificarla. Contacto y privacidad: `contacto@apxstudio.es`; soporte técnico: `soporte@apxstudio.es`; web `https://apxstudio.es/`. Privacidad ES/EN y `PRIVACY.md` alineados.
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
- Candidata 6 compilada con frontend integrado, sin instalar: `src-tauri/target/candidates/1.5.4/BlinkStream_1.5.4_candidate6_redemptions.exe`, SHA256 `5223107e17eb374db5f8eff8b3258fa34a63e3c4c40d248b547c80ac9b5c7245`. 808 frontend/1 omitido más dos nuevas regresiones del hook correctos; lint/build y 33 pruebas de entrega correctos. Prueba real de actualización de canje gestionable pendiente; el canje mostrado podría pertenecer a recompensa externa. MSIX local todavía no corresponde a esta candidata.
- Usuario confirma que lo probado funciona salvo cumplir/rechazar canjes (captura en canal propio albertplayxd). Corregido contrato Helix: status en cuerpo JSON, Content-Type y sesión de usuario obligatoria. Preflight only_manageable_rewards impide mutar recompensas creadas por otra aplicación; restricción oficial incluso siendo broadcaster. Errores diferenciados y enlace al panel oficial en ocho idiomas, sin marcar cumplido/rechazado tras fallo. Pendiente probar candidata 6; no crear/reemplazar recompensas ni publicar 1.5.4 automáticamente antes de aceptación/CI.
- Validación de candidata 5 por el usuario: mismo canal francés 1440p HEVC, latencia visual 6.1 s estable (antes ~8 s). Reporte de 30 muestras/29.069 s: FPS promedio 59.9949 (mínimo 59.6244), cero pérdidas por intervalo y cero incremento total, cero nuevas esperas/saltos, 1x, catchUpRate=1, latencyCap=8 y worker activo en todas; búfer continuo 4.097–6.114 s. Cuatro fotogramas perdidos y bufferStalledError históricos no aumentan. Conservar este ajuste como referencia estable, sin otra reducción automática ni publicación; Zappingol y paneles Mod View siguen pendientes.
- Candidata 4 aceptada solo para la muestra francesa (sartar_ en captura), no aún Zappingol: reporte aportado por el usuario con 30 muestras/29.023 s, 2560x1440 HEVC, FPS promedio 59.986, 1x, worker activo; cero pérdidas nuevas, cero nuevas esperas/saltos y búfer continuo >=6.0007 s. Los cuatro frames perdidos y bufferStalledError eran anteriores a la ventana, sin incrementos. Usuario confirma que no se corta y señala únicamente latencia (~8 s en captura). No extrapolar compatibilidad universal ni Mod View resuelto.
- Ajuste de latencia en preparación: política >=1440p baja objetivo 6→3 s y límite 12→8 s, manteniendo 1x y la corrección de DVR; sin tocar buffers/DVR manual/credenciales ni políticas lower-res. Es objetivo HLS, no garantía de latencia extremo a extremo. Validar en el mismo canal/condiciones con otro reporte antes de reemplazar la candidata estable o publicar.
- Quinta candidata de menor latencia compilada con CLI Tauri/frontend embebido: `src-tauri/target/candidates/1.5.4/BlinkStream_1.5.4_candidate5_latency.exe`, SHA256 `494c32a8e89f31d593e56df1b0b21252b65bcbe703029b2c5ad11736d00d01d6`. Lint, 796 frontend/1 omitido y 33 entrega correctos. Candidata 4 conservada como muestra fluida; falta aceptar latencia/estabilidad de 5. MSIX sigue en tercera candidata; sin nuevo despliegue cloud, tag, publicación ni web.
- Reanudado por el usuario el 2026-10-25 por la mañana. CI `40139461128` de `77caf4b` terminó correcto, pero la aceptación real sigue fallando: NO publicar. Prioridad actual: telemetría acotada del vídeo real, sin URLs/tokens, y conexión de AutoMod con permisos existentes; revisar límites broadcaster-only de Mods/VIPs/predicciones/puntos, sin prometer que volver a iniciar sesión resuelve esos endpoints.
- Defecto DVR reproducido en integración con HLS real: useLiveDVR reponía cada 500 ms rate máximo 1.1 y latencia máxima 6 s, anulando el perfil >=1440p. Prueba previa falla (1.1 frente a 1); nueva política única getLivePlaybackPolicy compartida con DVR conserva 1x/12 s y rebobinado manual. Trece pruebas de DVR/política pasan tras el fix. Pendiente validación Twitch real.
- Diagnóstico de reproducción acotado: últimos 30 muestreos, FPS calculados por delta de fotogramas, códec, eventos waiting/stalled/seeking, avance de tiempo, búfer continuo/rangos, worker activo y política real. Copia explícita desde estadísticas; whitelist sin URLs/tokens/mensajes ni nuevos IPC. Se retira resolución/FPS inventados al faltar metadata. Lectura oficial confirma que Get Moderators exige token del creador; aviso específico en vez de recomendar reautorizar ante esa respuesta 401. AutoMod aún pendiente de conexión, no dar por terminado.
- Cuarta candidata local `src-tauri/target/candidates/1.5.4/BlinkStream_1.5.4_candidate4_diagnostics.exe`, SHA256 `31c41423bfa1b59c10e7edf3397f1fb3050a423efacce3d71c8cb1e93ab09cf9`. Compilación con CLI Tauri/frontend embebido, lint, 796 frontend/1 omitido y 33 entrega correctos. Entregada para reproducir 1440p durante 30 s y copiar el diagnóstico desde estadísticas; falta esa evidencia, no declarar solucionados los tirones. MSIX local aún corresponde a tercera candidata; regenerar tras validación antes de entregar/publicar parche. Sin instalaciones ni nuevos cambios cloud.
- PAUSA explícita del usuario al irse a dormir (2026-10-25). Retomar mañana, sin trabajo nocturno ni publicación automática. Tercera candidata rechazada en fluidez: siguen los tirones. Tras reautorizar OAuth v39 sí carga Espectadores (25 en captura); Mods sigue HTTP 401 y usuario indica que los demás paneles no muestran datos. No declarar Mod View completo ni reproducción solucionados. Revisar restricciones/contrato de cada endpoint y obtener telemetría del reproductor real (códec, FPS presentados, pérdidas por intervalo, esperas/seeks y estado de worker) antes de otra corrección especulativa.
- Handoff tercera candidata: código `77caf4b` subido, frontend 788 correctos/1 omitido, entrega 33, OAuth 12; worker inicializado en Edge bajo CSP intacta, pero esto NO resolvió los tirones según prueba del usuario. Ejecutable `src-tauri/target/candidates/1.5.4/BlinkStream_1.5.4_candidate3.exe` SHA256 `df83b5fb6cc8bcc64b5cdf592d60f70c9fcea6e17ba0d4d74a0413cb7b0a02eb`. MSIX 1.5.4.0 regenerado y verificado, SHA256 `f89a4fb31c87fdf15134d6c4df93d031ef48e69255a681000a7071343dede364`; sin instalación/firma/envío. No tag/release/web; latest público sigue 1.5.3. Falta consultar el resultado CI de `77caf4b` al reanudar, sin atribuirle aún éxito.
- Segunda candidata rechazada por el usuario: continúa 1440p a tirones; navegador confirmado a 1440p fluido. Foto de Usuarios confirma HTTP 401; ser moderador no concede por sí mismo los scopes de la aplicación. Usuario autorizó explícitamente añadir solo moderator:read:chatters y desplegar twitch-auth: v39 ACTIVE, los cinco archivos remotos verificados contra payload (solo cambia array REQUESTED_TWITCH_SCOPES). Verificación pública 302 a id.twitch.tv con 18 scopes y permiso nuevo; baseline de identidad/cliente/expiración intacta, 12 regresiones OAuth pasan. Las sesiones existentes no ganan scopes al refrescar: usuario debe cerrar sesión y autorizar de nuevo. Sin cambios de OAuth Server/BD/secretos; verify_jwt=false conservado para callback público con validación propia. Rollback fuente exacta v38 en scratch/twitch-auth-pre-chatters-v38.json. Datos reales de Usuarios pendientes tras reautorizar.
- Diagnóstico 1440p con app abierta por el usuario: RTX 4070 Ti SUPER, WebView2 155.0.4283.62; VideoDecode de proceso GPU descendiente de la candidata 33–46%, 3D 3–4%, CPU sin saturación observada. No atribuirlo a GPU desactivada. Defecto concreto: ESM hls.mjs no incluye worker UMD; enableWorker=true sin workerPath cae en procesamiento inline. Tercera candidata conecta URL local empaquetada de hls.worker.js en directo/grid/preview/VOD. Asset 102.858 bytes; prueba del motor real envía init/configure/demux y termina worker; handshake real Edge 156 con CSP producción intacta correcto (scratch/check-hls-worker-browser.cjs). Esto demuestra inicialización, no fluidez de Twitch real. Sin flags GPU, controladores ni dep nueva.
- Segunda candidata 1.5.4: usuario confirma ser moderador de zappingolyt y todos los paneles vacíos, incluido Usuarios. No aceptar funcionalidad completa. Se reproducen lecturas 401/403 ocultadas: AppError guarda status en context, mientras paneles miraban error.status y además solo mostraban >=500. Aviso común traducido en ocho idiomas, cargas independientes de usuarios con allSettled/cancelación, ID resuelto aislado por canal y `isModerator` real pasado al chat (antes solo recibía isMod, que controla layout y no habilita moderación). AutoMod nunca recibe mensajes retenidos; no inventar conexión ni eventos. Auditoría solo contiene acciones locales de BlinkStream, no historial global Twitch. Falta validar datos con sesión/rol reales y conectar AutoMod con permisos apropiados; no cambiar OAuth/cloud automáticamente.
- Segunda captura 1440p: 758 fotogramas perdidos (antes 101), búfer 5.5 s y latencia 7.2 s; confirma pérdidas crecientes con datos en búfer, no prueba causa única. Nueva política solo >=1440p: máximo 1x, sync 6 s/max 12 s; se retira startLoad por ResizeObserver (reiniciaba descarga al redimensionar). HLS lower-res/grid conservan política previa. Cambio pendiente de prueba de fluidez real, sin garantía de aceleración hardware.
- CI `40137832956` superó pnpm audit pero detectó RUSTSEC-2026-0386 en Tokio 1.53.1. Aplicado únicamente parche Tokio 1.53.3; sin reglas de seguridad omitidas. Revalidación nativa/frontend y segunda compilación en curso.
- Validación segunda candidata: 786 frontend/1 omitido, 33 entrega, 64 nativos; lint/fmt/Clippy correctos. Auditoría OSV: 562 paquetes, cero vulnerabilidades, nueve avisos informativos de mantenimiento. Ejecutable CLI Tauri con frontend embebido `src-tauri/target/candidates/1.5.4/BlinkStream_1.5.4_candidate2.exe`, SHA256 `8c62b1aaa0c3146e1d61d81efe9a181d2998c0f12db86d54cd3740c51269fab3`; primera candidata conservada, sin instalaciones. Código `11bf4ed`, CI `40138524594` en curso. MSIX 1.5.4.0 regenerado y pack/unpack/PRI/iconos/runtime verificados, 94.728.043 bytes, SHA256 `690bf64ccb393061c56b7ccdf24887256397a8327967edb5598d620721f0e56d`; sustituye el primer MSIX local, sin firma/envío/instalación. Falta prueba real de fluidez/paneles; no tag/publicación/web.
- Aceptación 1.5.4: usuario confirma Mod View correcto; el vídeo 1440p ahora llega a verse pero va a tirones, mismo canal fluido en navegador. Primera captura: 2560x1440@60, búfer 6.0 s, latencia 7.3 s, 101 fotogramas perdidos; bitrate mostrado es estimación de descarga, no bitrate del stream. Falta segunda captura para medir delta de pérdidas/búfer, no atribuir todavía causa. Mensaje sobre «paneles del…» incompleto: solicitado detalle. No publicar. Revisado ResizeObserver que llama startLoad al cambiar tamaño: aborta/reinicia carga en HLS instalado; posible corte al redimensionar, no causa confirmada de tirones continuos. Control de latencia actual puede acelerar a 1.1x y forzar alcance al superar 6 s; revisar con métricas antes de cambiar política.
- CI `40137297888` falló en auditoría por GHSA-mrhx-c7xc-m3w5 (Zod transitivo de eslint-plugin-react-hooks). Lockfile actualizado únicamente de Zod 4.4.3 a 4.6.7 compatible; pnpm audit sin vulnerabilidades y lint correcto. No afecta el código runtime de la candidata entregada.
- Candidata 1.5.4: Mod View reproducido con cinco configuraciones iniciales/legacy; normalización conserva preferencias válidas y evita el crash de enabledTabs. Streamlink solicita h264/h265/av1 tanto en reproducción como en listado; cabecera OAuth documentada y sesión web oficial solo con identidad Twitch validada coincidente con la cuenta nativa. Cookies permanecen nativas, sin nuevos IPC/permisos. Calidades parseadas desde stdout/stderr sin fragmentos de alias; errores de reproducción/fuente inaccesible/códec en ocho idiomas.
- Hook 1.5.4: falsos positivos verificados contra HEAD en identificadores públicos Twitch preexistentes y CSP Supabase pública sin cambios; excepción por commit solo `twitch-clientid,supabase-url`. Sin omitir escáner ni reglas de tokens/claves privadas.
- Validación 1.5.4: 778 frontend correctos/1 omitido, 33 de entrega, 64 Rust y Clippy todos los targets/features sin avisos; lint/fmt/build correctos. Código candidato subido a master en `1caed91`, CI `40137297888` en curso, sin tag. Prueba anónima de zappingolyt con Streamlink 8.6.2 devuelve solo audio aun solicitando todos los códecs; no demuestra reproducción 1440p autenticada. Usuario confirma misma cuenta en chat oficial, y fallo tanto GitHub como Store. Falta aceptación real de Mod View y 1440p y CI multiplataforma antes de publicar/tag/desplegar web; descargas/updater permanecen 1.5.3.
- Entregables locales 1.5.4: ejecutable sin instalación `src-tauri/target/candidates/1.5.4/BlinkStream_1.5.4_candidate.exe` (20.367.872 bytes, SHA256 `6d1fa3ccbd281b02c8a675a5e3c4e9f84c997129d43971aaa7e0704812de7edd`), compilado con CLI Tauri y frontend embebido. MSIX `src-tauri/target/msix/BlinkStream_1.5.4.0_x64.msix` (94.717.268 bytes, SHA256 `4dc303ff590a964098687046b3068dc11978b3d5a6a0a9b92d9621d49e1ae606`), pack/unpack/PRI/iconos/runtime verificados; no instalado, firmado ni enviado.
- Contactos separados por petición del usuario: privacidad/contacto `contacto@apxstudio.es`, soporte técnico `soporte@apxstudio.es`. Desplegado y verificado por SSH/HTTPS en ES/EN; seis enlaces de privacidad y política del repositorio alineados. Copia previa temporal: `/tmp/apxstudio-web-privacy-contact-5BCPu3QT`.
- GitHub 1.5.3 publicada sobre `0eae25e`; CI candidato `39793015683`, CodeQL `39793022538` y publicación `39796091712`. Los 15 archivos públicos coinciden con CI y SHA-256; cuatro firmas del updater verificadas independientemente. Latest/master/updater coherentes en 1.5.3. Vitest/ui/coverage 4.1.12 corrige los dos avisos nuevos de @vitest/mocker del 2026-10-22; auditoría completa limpia y gate CI ampliado a dependencias de desarrollo.
- MSIX final 1.5.3.0 generado desde `0eae25e` y pack/unpack/PRI/iconos/runtime comprobados: `src-tauri/target/msix/BlinkStream_1.5.3.0_x64.msix`, 94.728.466 bytes, SHA256 `5cbc35ac0419cc11c18ca6d55bdd27b54cab5936d204edba4f8f2f3838550e5e`. No instalado, firmado, enviado ni certificado.
- Dependabot detectó tres avisos del servidor de desarrollo Vite 8.2.0 (GHSA-r825-w8mm-5pxw, GHSA-587h-7wmj-h5pm, GHSA-698v-4r3x-3vcv); actualizado a 8.2.4 y lockfile compatible. pnpm audit completo (producción/desarrollo): cero vulnerabilidades. Protección de contraseñas filtradas requiere Pro o superior según documentación oficial; no cambiar de plan automáticamente.
- Primer CI 1.5.3 `39493604739` bloqueó RUSTSEC-2026-0381/0382/0383 en certificados TLS. Cargo.lock publicado con rustls-webpki 0.103.16 y webpki-roots/webpki-root-certs 1.0.10; OSV: 562 paquetes, cero vulnerabilidades, nueve avisos informativos de mantenimiento. Revalidación nativa/CI completada sin suprimir reglas.
- Seguridad 1.5.3 autorizada y desplegada: auth_tokens privada, RLS forzada, TTL/UUID/identidad obligatorios y 22 handoffs caducados purgados. twitch-auth v38: refresh POST, identidad Twitch validada, migración legacy con prueba de sesión anterior y cliente de sesión aislado del service_role. Desktop publicado con validación horaria/logout remoto; Acerca de APX Studio en ocho idiomas.
- Advisor live: sin avisos de rendimiento; INFO RLS sin políticas intencional en tabla privada. Protección de contraseñas filtradas requiere Pro+; no cambiar de plan automáticamente. Login y logout de 1.5.3 aceptados explícitamente por el usuario.
- Validación candidata final 1.5.3: 749 frontend/1 omitido, 33 release, 11 pruebas OAuth sobre código real y 60 Rust Windows correctos; lint y build frontend correctos. Advisor del 2026-10-22 mantiene solo INFO de tabla privada y WARN de contraseñas filtradas (Pro+). El navegador para ese toggle quedó bloqueado por auto-review ante redirección ajena a Supabase. Posteriormente el usuario confirmó login/logout reales correctos; no instalar automáticamente la app.
- Web APX 1.5.3 desplegada por SSH el 2026-10-22 con autorización explícita para este parche. «Current Version» solo v1.5.3 en ES/EN; caché 20261022.2, roadmap y descargas actualizados. Privacidad ES/EN y `PRIVACY.md` con `contacto@apxstudio.es`, fecha 2026-10-22; badges actuales sin versión separada de Store. 46 checks DOM y regresiones de contacto/versiones en siete páginas; once hashes remotos iguales a locales; once recursos HTTPS y home/auth HTTP 200. DOM público equivalente descontando únicamente transformaciones conocidas de correo/JSD de Cloudflare y formato. `deploy.ps1` intacto; sin cambios de permisos/claves. Copia previa 1.5.2: `/tmp/apxstudio-web-backup-1.5.3-EpgFDbOa`; previa al ajuste del campo: `/tmp/apxstudio-web-current-version-k0QiFVbQ`; previa a correcciones de coherencia: `/tmp/apxstudio-web-coherence-UAjZSMaM` (temporales).
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

- Web APX: no añadir comentarios en archivos HTML publicados, incluidos CSS/JavaScript incrustados; documentación de mantenimiento en Markdown. Regla del usuario 2026-10-23, también en `APXStudioWeb/AGENTS.md`. Siete páginas limpiadas (162 comentarios), DOM/AST equivalentes y despliegue SSH/HTTPS verificado; copia previa temporal `/tmp/apxstudio-web-no-comments-9JaFAIkv`.
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
