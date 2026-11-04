# Validación real de recompensas — R0/R2

Estado: protocolo preparado el 2026-11-04; no acredita pruebas Twitch completadas.
Plan: [R0–R8](../STREAMNOOK_IMPLEMENTATION_PLAN.md). Una candidata puede superar tests sin que Twitch haya acreditado minutos o entregado una recompensa.

## Preparación

- Registrar candidata/commit, sistema, WebView2, calidad y códec. No incluir tokens, cookies ni URLs firmadas.
- Elegir canal en directo y campaña activa que el inventario oficial confirme como elegible; comprobar fechas y vinculación del juego.
- Misma cuenta en BlinkStream y Twitch oficial. No pedir al usuario que copie credenciales ni leer mensajes para esta prueba.
- Realizar los intervalos de Twitch oficial y BlinkStream por separado. Cerrar otra reproducción de esa cuenta que pueda contaminar la atribución.
- Registrar por separado latencia HLS y retraso por fecha del vídeo; verificar si el reloj sesga la segunda métrica, sin modificarlo automáticamente.

## Registro de cada sesión

| Campo | Dato observado |
|---|---|
| Fecha/hora y zona | Pendiente |
| Candidata/commit y runtime | Pendiente |
| Canal/campaña y requisito | Pendiente |
| Vinculación y elegibilidad confirmadas | Pendiente |
| Medio: oficial/BlinkStream; chat/Mod View utilizados | Pendiente |
| Calidad/códec y tiempo observado | Pendiente |
| Minutos remotos iniciales → intermedios → finales | Pendiente |
| Estado de reproducción/FPS/pérdidas/búfer | Pendiente |
| Estado de reporte y errores no sensibles | Pendiente |
| Estado del Drop después de reclamar | Pendiente |

## Casos

Prueba preparada para candidata23: el usuario indica un Drop al100% pendiente. Desde Centro de Drops → Listos para reclamar, iniciar una sola reclamación y comprobar `Reclamado` y su estado en el inventario oficial. Registrar error textual si lo hay; mantener Auto-Claim pausado ante incertidumbre. No sustituir esta prueba por un canje de puntos o una compra.

1. **Control oficial:** reproducir al menos 15 minutos y registrar progreso remoto antes/después. Si no avanza, revisar campaña/vinculación antes de atribuir el problema a BlinkStream.
2. **Reproducción BlinkStream:** misma campaña/cuenta/canal, intervalo independiente comparable. Registrar progreso del servidor, no un contador local. Repetir en otra sesión/campaña cuando esté disponible.
3. **Pausa/buffering:** comprobar que el reporte experimental no acredita por simple selección de canal. Registrar su parada y recuperación; la pausa del reporte no elimina progreso ya recibido por Twitch.
4. **Cambio/cierre/minimización/logout:** comprobar la política existente y descartar respuestas tardías de la cuenta/canal anterior; sin procesos huérfanos.
5. **Reclamo:** utilizar una recompensa que Twitch marque realmente como reclamable. Observar el resultado en el inventario oficial y su sincronización; abrir una ventana no significa reclamar.
6. **Saldo/cofre:** documentar si cada lectura está disponible; si se reclama un cofre, comprobar resultado y saldo remoto. Un HTTP 200/204 o un valor por defecto no confirma puntos obtenidos.
7. **Canje de espectador:** en R1 solo verificar apertura oficial, canal correcto, errores recuperables y ausencia de POST Helix. Un canje real posterior requiere elegir con el usuario una recompensa de prueba y autorizar ese gasto concreto.
8. **Gestión del creador/moderador:** probar por separado recompensa gestionable/externa; no confundir autorización para leer eventos con capacidad para aprobar/rechazar.

## Resultado

Captura del usuario2026-11-04 con candidata23: `Catálogo: failed integrity check` mientras el inventario sincronizado muestra Battle Support Chest x1 a60/60 y reclamado. Confirma rechazo autenticado del catálogo y lectura del inventario; no atribuye ese reclamo al transporte nuevo sin respuesta del usuario. La comprobación anónima de campos no validaba esta operación autenticada. Candidata24 añade pausa por cuenta tras integridad y catálogo oficial integrado, con inventario independiente para reclamar.

Clasificar cada capacidad como **confirmada en la muestra**, **no confirmada**, **solo oficial** o **pendiente de escenario disponible**. Registrar evidencia y limitaciones; no extrapolar una cuenta/campaña a todas las plataformas.

R0: el usuario acepta candidata17 (2026-11-04): reproducción fluida y barra inferior eliminada. Esto no sustituye validación específica de HEVC/Grid/Mod View combinado prolongado.

R1: tests y candidata de acceso oficial se documentan en PROJECT_STATE. La interacción autenticada del usuario sigue siendo una comprobación distinta.

R2, muestra del2026-11-04: el usuario confirma que «Battle Support Chest x1» pasó de3 a27 minutos y que el inventario oficial de Twitch también muestra27 (45% de60). Crédito remoto confirmado para esa cuenta/campaña/sesión. No acredita por sí solo reclamo manual/automático, pausa/logout ni otras campañas o plataformas; esos casos siguen pendientes.

R3, primera entrega: centro propio limitado al inventario sincronizado y campañas del canal, búsqueda, filtros y campaña fijada solo para seguimiento visual. Requisitos ausentes permanecen desconocidos; completar minutos sin instancia emitida no habilita reclamar. Fechas, vinculación y catálogo global quedan pendientes de una fuente verificada. Comprobar la candidata nueva con el mismo inventario; las pruebas de interfaz con datos de ejemplo no son validación autenticada.

R3, ampliación22: catálogo nativo de campañas activas y tarjetas en «Disponibles», incluso sin minutos previos. Se añaden imágenes, recompensas y fecha final recibida; una campaña visible no confirma que el canal actual sea elegible. Comprobar coincidencia con la lista oficial, recompensa aún no empezada, campaña ya en progreso, vencida/completada, búsqueda, cambio de cuenta/canal y error recuperable. Consulta aceptada anónimamente por Twitch; no acredita por sí sola respuesta autenticada. Vinculación sigue en el inventario oficial.
