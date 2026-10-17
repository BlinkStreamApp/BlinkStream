# Plan de ejecución de BlinkStream

Actualizado: 2026-10-17. Microsoft Store 1.5.1 publicada según confirma el usuario. GitHub 1.5.0 y 1.5.1 publicadas tras CI firmado multiplataforma, NSIS smoke y verificación independiente de artefactos públicos; 1.5.2 latest/updater tras CI `39060821359` y verificación de los 15 archivos públicos/cuatro firmas. Fuente 1.5.1 incluye el hotfix de iconos MSIX, variantes claro/oscuro/DPI y PRI verificado. El usuario gestiona Partner Center. Ver `guides/MSIX_STORE.md` y `guides/UPDATER_VERIFICATION.md`.

GitHub 1.5.2 publicada: búsqueda del chat nativo individual/unificado y traducciones aceptadas por el usuario; extractor ZIP opcional no utilizado retirado. Candidato y tag superaron CI firmado, smoke y verificación independiente. Store permanece en 1.5.1; MSIX 1.5.2.0 entregado por separado al mantenedor. Única web comercial: https://apxstudio.es/; conservar la confirmación de login independiente en Pages del repositorio auth.

## Objetivo y reglas

Consolidar reproducción, chat y eventos de Twitch antes de ampliar la experiencia de escritorio.
Responsables: Codex implementa y verifica; el usuario valida el comportamiento en su sesión real.
El usuario autoriza entregar fixes y mejoras incrementales como PATCH consecutivos después de las pruebas pertinentes; reservar MINOR para hitos mayores acordados.
Antes de publicar, alinear README, notas, roadmap del repo y de la web, y versiones package/Tauri/Cargo. No crear tags hasta CI firmado correcto; no anunciar descargas inexistentes.
La autorización no incluye instalación en su PC, cambios de permisos/secretos ni despliegues Supabase. Una pausa o modo solo local posterior prevalece.

## Orden de ejecución

| Orden | Hito / bloque | Dependencias | Criterio de cierre | Estado |
| --- | --- | --- | --- | --- |
| 0 | 1.4.4 categorías/UI/chat unificado | Componentes existentes, Helix/IRC | Publicación y CI firmados; aceptación específica registrada | Publicada; checks independientes de envío/audio pendientes |
| 1 | Fiabilidad/latencia y validaciones Twitch, incluidas desde 1.5.0 | HLS, campañas/cuentas autorizadas | Grid, pausa/DVR y estabilidad; separar crédito/reclamo/inventario | Publicada; principal: 2.5 s aceptados; pruebas reales ampliadas pendientes; etiqueta 1.4.5 sustituida |
| 2 | 1.5.x organización y chat | Cache por cuenta, favoritos y feed acotado | Búsqueda de sesión, ocultación de canales y refinamientos de colecciones sin fuga al salir ni recursos cruzados | Colecciones/categorías publicadas; búsqueda publicada en GitHub 1.5.2; pendientes ocultación de canales y refinamientos de colecciones |
| 3 | 1.6.0 continuidad/workspaces | Identidad VOD y persistencia existentes | Reinicio/restauración, medios ausentes, cleanup y audio principal correctos | Planificada |
| 4 | 1.6.x consumo/medios | Bloque 3, FFmpeg y disco acotado | DVR/audio existentes validados → ahorro/avisos → recorte/replay → biblioteca → temporizador; respetar grabación | Planificada |
| 5 | 1.7 moderación/eventos/control | Cuenta creadora autorizada, Helix/EventSub | Feed y predicciones/encuestas con permisos/confirmaciones, atajos sin conflictos, HUD y Drops probados por separado | Código parcial existente; consolidación pendiente |
| 6 | 1.8 integraciones/comodidad | Endpoints permitidos y contratos por OS | Agenda/DST, enlaces seguros y privacidad; RPC/Stream Deck opcionales e importación sin secretos | Planificada; traducción/VOD chat condicionados |
| 7 | 1.9 consolidación/prototipos | Bloques anteriores y hardware de referencia | Migraciones/recuperación, regresiones y accesibilidad; prototipos aceptados y baseline de rendimiento | Planificada |
| 8 | 2.0 rediseño integral | Mapa de navegación, tokens, componentes y migraciones 1.9 | Paridad funcional y migración por pantallas, beta, pruebas nativas de tres plataformas, CI/updater firmados | Hito mayor aprobado para planificación |

## Primer bloque: tareas y evidencia

- [x] Inspeccionar roadmap y código: HUD, compresor, DVR, predicciones y recorte ya tienen implementación.
- [x] EventSub implementado y probado automáticamente: identidad/scopes, altas/cambios, deduplicación, reconexión y cleanup.
- [x] Mostrar conexión/permisos en la cola y panel del creador; conservar las rutas existentes de catálogo/chat oficial.
- [x] Aislar atajos del reproductor y aplicación; conservar captura en Ctrl/Cmd+Shift+S y reproducción en K.
- [x] Corregir IDs de canje en la cola; mostrar fallos de actualización y rechazar respuestas tardías de otro canal.
- [x] Suite completa: 427 tests correctos y uno omitido; 62 pruebas del bloque repetidas tras el último ajuste. Lint sin advertencias y build correcto.
- [ ] Prueba real de canje en cuenta autorizada y de cambio/cierre de canal.
- [ ] Drops: inventario listo no equivale a minutos acreditados. Registrar progreso inicial/final de una campaña elegible, comprobar chat y reclamo.

## Riesgos y decisiones

- Twitch retiró PubSub el 2025-04-14. EventSub no reproduce todas las capacidades privadas del chat web.
- Canjes personalizados por EventSub requieren autorización del creador y scopes de redemptions; ser moderador no garantiza acceso.
- No añadir un player/iframe oficial oculto para acreditar tiempo. El reporte nativo experimental es opt-in y su aceptación no garantiza crédito.
- El secreto actual/config del updater coinciden y verifican una prueba firmada; los artefactos históricos usan otra clave (ver `guides/UPDATER_VERIFICATION.md`).
- Verificación criptográfica previa a publicación implementada; diagnóstico recuperó solo la pública del secreto existente. No rotar la confianza ni prometer upgrade de clientes antiguos sin validar una migración.
- Seis avisos originales cerrados y audit npm limpio; GLib ligado a GTK/Linux tiene un backport vendorizado validado con tests optimizados y builds Linux (ADR-014). Retirarlo cuando exista una dependencia upstream compatible corregida.
- El DVR actual usa el rango disponible del reproductor; no garantiza un historial completo del directo.
- Separar "implementado", "probado automáticamente" y "validado en sesión real"; no marcar una función terminada solo porque compila.

## Alcance y siguiente ejecución

El detalle funcional y las reasignaciones de la antigua 1.5/1.6 están en [ROADMAP.md](../ROADMAP.md); no mantener listas paralelas divergentes.

1. 1.5.2 publicada y verificada en GitHub; mantener las regresiones de texto/usuario/enlaces/origen, borrados de moderación, cambio de cuenta y ventanas estrechas. El usuario gestiona el envío MSIX y el despliegue SSH de la web actualizada.
2. Colecciones y categorías: base publicada; mejorar orden/filtros/teclado e incorporar ocultación de canales mediante incrementos PATCH separados.
3. Mantener pruebas reales de grid, pausa/DVR, estabilidad y Twitch como validación transversal. La mejora de latencia ya se distribuye desde 1.5.0; no crear una entrega 1.4.5 posterior.
4. Dimensionar VOD/workspaces antes de abrir el bloque de medios; no activar todo 1.6 simultáneamente.

Cada hito distingue entrega mínima de ampliaciones posteriores. IA/plugins/nuevas plataformas se investigan aparte y no bloquean el rediseño 2.0. Agenda depende de horarios publicados; VOD chat requiere una fuente permitida verificada. No hay fechas cerradas ni garantía universal de latencia.

Fuente/latest/updater GitHub 1.5.2; Store 1.5.1. La planificación no despliega cloud ni autoriza instalaciones. README/roadmaps/web/notas y metadata sincronizados; evitar que un cambio documental arrastre código sin validar.

Fuentes de integración: [EventSub WebSocket](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/),
[tipos de suscripción](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/) y
[ciclo de vida de Twitch](https://dev.twitch.tv/docs/product-lifecycle/).
