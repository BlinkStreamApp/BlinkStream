# PROJECT_STATE

Updated: 2026-11-04
Status: active

## Objective

Cliente desktop de Twitch con reproducción, chat, grabación y Companion.
Store 1.5.2 indicada por el usuario el 2026-10-17 al actualizar la web.
GitHub 1.5.3 publicada y verificada; latest/descargas/updater 1.5.3.
Fuente 1.5.4 candidata: consolidar latencia/fluidez y moderación antes de publicar y retomar organización de canales.

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

- DEC-018 → ADR-018 revertida por petición explícita del2026-11-04: el usuario considera posiblemente errónea la comparación anterior y solicita recuperar chat oficial incrustado. Se respeta su preferencia guardada también en Windows; ventana flotante solo manual. No atribuir los tirones al chat como causa confirmada ni cambiar HLS/audio/GPU por esta reversión; reproducción conjunta pendiente de nueva comprobación.

- DEC-017 → ADR-017: directo usa `pLoader` nativo solo para listas y FetchLoader progresivo para segmentos; adapta hasta dos prefetch Twitch sobre CDN ya presente. Retirado el salto automático inicial. Diagnóstico conserva borde HLS y diferencia reloj/fecha del vídeo por separado; no cambia seguridad nativa ni CSP.

- DEC-016 → ADR-016: por petición del usuario, Mod View oficial integrado mediante webview nativo como opción inicial; interfaz BlinkStream seleccionable. Solo una interfaz montada, sin tokens/scripts/privilegios concedidos a Twitch. Sesión web de Twitch y controles oficiales intactos; requiere validar login/canjes reales.

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
- Candidata20 compilada sin instalar: `src-tauri/target/candidates/1.5.4/BlinkStream_1.5.4_candidate20_twitch_gifs.exe`, SHA256 790994d975b048f5089481e0dd89755b8dc160584fa711249a9f142c2e4c2ab7. Chat Ligero conserva etiqueta IRC `gifs`, rangos Unicode y URL íntegra validada para CDN Giphy; render compartido, fallback/reintento, borrados y separación por canal. Escapes IRC corregidos. 954 frontend/1 omitido,33 entrega,lint/build correctos; GIF público oficial cargado en navegador (480×480 natural, presentación acotada). Recepción real del usuario pendiente; mantiene chat incrustado19, sin nuevas APIs/permisos ni publicación.
- Candidata19 compilada sin instalar: `src-tauri/target/candidates/1.5.4/BlinkStream_1.5.4_candidate19_inline_chat.exe`, SHA256 8be0bd66523647f4fc256d0e8406945325d1fd9a2d13b58bc0a766946a6f3af6. Petición del usuario: recuperado chat oficial incrustado en Windows y preferencia previa, popout manual independiente. Retirada política forzada de candidata15; sin cambios HLS/audio/GPU. 927 frontend/1 omitido,33 entrega,lint/build correctos; nueva aceptación de reproducción conjunta pendiente. Incluye R1 de18.
- Candidata18 R1 compilada sin instalar: `src-tauri/target/candidates/1.5.4/BlinkStream_1.5.4_candidate18_rewards.exe`, SHA256 21619c1ae9d6f8c46e804fee5940df415cac98718bb635eb267162cce0b43f06. 932 frontend/1 omitido,33 entrega,lint/build desktop correctos; UI real a420×700 comprobada. Apertura nativa probada por contrato, interacción autenticada pendiente. Conserva fuente de playback17; sin tag/publicación/web/MSIX final.
- Iniciativa StreamNook R0–R8: plan/revisión guardados en eaa95f9. R1 implementado: canje de espectador por acceso oficial explícito, sin POST Helix ni falso historial; consulta de catálogo aislada por cuenta y respuestas obsoletas descartadas. Protocolo R2 en `docs/guides/REWARDS_LIVE_VALIDATION.md`; acreditación real y canjes autenticados pendientes. Sin transporte privado nuevo ni cambios cloud.
- Usuario acepta candidata17 el2026-11-04: vídeo fluido y barra inferior eliminada. No certifica por sí solo HEVC/Grid ni ModView combinado prolongado. R0 conserva esos escenarios pendientes.
- Candidata17 conservada sin instalar: src-tauri/target/candidates/1.5.4/BlinkStream_1.5.4_candidate17_recording_disk.exe; SHA256 97bba4619d942f36981a6f2252e94cdc2583aa22595a66633c32306c9ec80e6d. Barra global ficticia de100GB retirada y capacidad real del destino solo en ajustes. 906 frontend/1 omitido,71 Rust,33 entrega; lint/fmt/Clippy y build desktop correctos. Usuario acepta fluidez y barra retirada el2026-11-04; conserva latencia16, sin publicación/MSIX final.
- Usuario acepta candidata16 para la muestra actual deKokoop: «Perfecto», captura1080p ~3.3s,59.9FPS yΔ0. No equivale a aceptación de ModView combinado, HEVC o Store/MSIX.
- Candidata16 conservada: src-tauri/target/candidates/1.5.4/BlinkStream_1.5.4_candidate16_startup_latency.exe; SHA256 f6f6dd12b93744c62346c76d4e8e00a7f78c6a82cb7e3335d36331d91851cb9e. 896 frontend/1 omitido,33 entrega,lint/build correctos. Regresión con HLS real: primera recarga8000→2010ms y siguientes a2000ms. Aceptación GUI limitada a la muestra anterior; sin tag/publicación/web/MSIX final.
- Fuente 1.5.4 candidata; última publicación y web verificadas: 1.5.3. No crear tag/publicar/instalar hasta aceptación GUI y gates de entrega.
- 2026-11-03: refresco inicial de prefetch corregido en principal/Grid. HLS 1.6.16 esperaba ~8s por la primera recarga; el adaptador pide una sola actualización a los 2s observados y rebasa requestScheduled a la petición real. Mantiene targetduration, posición, velocidad y buffers. Cancela ante pausa/DVR/error fatal/carga normal/cierre. ADR-017.
- Comparación Kokoop pública de 60s: candidata ~1.87s por delante, sin pausas ni pérdidas y búfer mínimo 2.93s; baseline pausa una vez y añade cuatro pérdidas. VideoPlayer real en WebView2 156 aislado: ~60FPS, sin nuevas pérdidas/pausas durante el minuto medido. Falta sesión real del usuario, HEVC, Grid y reproducción prolongada.
- Reloj local adelantado ~2.867s frente a NTP (comprobación de solo lectura): contador según PDT ~6.35s, estimación corregida ~3.48s. No se modificó el reloj ni se introdujo offset fijo en métricas.
- Candidata15 conservada: src-tauri/target/candidates/1.5.4/BlinkStream_1.5.4_candidate15_chat_window.exe, SHA256 295422b56adb29f21ffbc752b1bedab876f96e12f1e7c3c4438a2da6be3ecc59, commit6474501. 878 frontend/1 omitido,33 entrega,lint/build correctos. Windows usa Chat Ligero integrado y oficial en ventana (ADR-018); usuario confirmó ~60FPS/0 pérdidas nuevas y fluidez con ventana oficial.
- Mod View oficial funciona en la sesión del usuario; layout combinado y controles responsivos aceptados visualmente. Su vídeo concurrente con subvista nativa requiere validación de FPS aparte; no extrapolar la mitigación del chat. Canjes externos se gestionan con herramientas oficiales, no con Helix de otra aplicación.
- MSIX local todavía corresponde a candidata3; regenerar solo con la fuente final aceptada. GitHub y Store tienen perfiles/canales separados; no instalar ni enviar Partner Center automáticamente.
- Backend autorizado previo: twitch-auth v39 añade moderator:read:chatters; requiere reautorizar sesiones antiguas. OAuth Server sigue desactivado; sin cambios cloud nuevos por reproducción. Lecturas Mods/VIPs/predicciones pueden depender del creador; no prometer que re-login resuelve límites de Twitch.
- Login/logout de1.5.3 aceptados; web/contactos/versionado desplegados el2026-10-22. Historial de candidatas y verificaciones anteriores disponible en Git y ADR-016/017/018.

NEXT:
- Prueba GUI voluntaria desde 1.4.1 y de conservación de settings/sesión, sin instalar automáticamente en el PC del usuario. Linux updater integrado requiere AppImage; `.deb` se actualiza manualmente/mediante paquetes.
- Validar canje EventSub real, Auto-Claim independiente y pausa/aislamiento del reporte nativo.
- Nuevo bloque R1–R4: contrato de canje → viabilidad de crédito/puntos → centro Drops → acciones que se demuestren. Ocultar canales/colecciones detrás del primer centro; R5 Chat Ligero independiente como entrega separada. Una investigación Twitch inconclusa no bloquea mejoras locales. Luego 1.6 conserva VOD/bookmarks antes de workspaces/audio y ahorro/replay/biblioteca; R7 personalización y R8 OBS por incrementos. Próximos PATCH incluyen despliegue completo y web SSH tras validar.
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

- Limpieza de artefactos Actions pausada por rechazo del usuario: no ejecutar scratch/actions-artifact-cleanup.json sin renovar inventario/autorización.

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

- Investigación StreamNook 8.8.21 fijada a bc86adc: `docs/reviews/STREAMNOOK_REVIEW_2026-11-04.md`. Referencias para centro Drops y chat independiente; transporte privado no validado. Hallazgo pendiente: `redeemCustomReward` usa POST Helix no documentado para canje del espectador; separarlo de la restricción real de gestión de recompensas externas. Solo documentación, sin cambiar app ni prioridades aprobadas.
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
