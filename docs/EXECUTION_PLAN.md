# Plan de ejecución de BlinkStream

Actualizado: 2026-10-07. Estado: preparación fuente 1.4.2; release bloqueado por continuidad de firmas.

## Objetivo y reglas

Consolidar reproducción, chat y eventos de Twitch antes de ampliar la experiencia de escritorio.
Responsables: Codex implementa y verifica; el usuario valida el comportamiento en su sesión real.
El usuario autoriza commit/push del código tras aceptar el panel de Drops y su pulido.
No crear tags/releases ni desplegar servicios externos sin nueva autorización.
No fijar fechas de entrega ni versiones futuras hasta cerrar los criterios de cada bloque.

## Orden de ejecución

| Bloque | Entrega | Dependencias | Criterio de cierre | Estado |
| --- | --- | --- | --- | --- |
| 1. Fiabilidad Twitch y teclado | Sustituir PubSub por EventSub para canjes personalizados, informar de permisos/conexión, separar atajos y validar Drops | Cuenta autorizada, campaña elegible y sesión real | Sin conexiones PubSub; reconexión/cleanup probados; atajos sin dobles acciones; aumento real de minutos y reclamo comprobados | En curso |
| 2. Continuar viendo | Posición de VOD, lista para más tarde y marcadores con notas | Identidad estable de VOD/canal y almacenamiento existente | Recuperar posición tras reiniciar; gestionar marcadores; enlaces ausentes tratados | Pendiente |
| 3. Espacios de trabajo | Perfiles de canales, distribución, volumen y calidad; audio principal en multistream | Bloque 1 y layouts existentes | Restaurar un perfil sin procesos huérfanos ni sonido inesperado | Pendiente |
| 4. Consumo y avisos | Ahorro al minimizar/streams secundarios, horarios silenciosos y filtros de alertas | Bloques 1 y 3 | Comparar recursos antes/después; respetar grabación y Drops; evitar avisos repetidos | Pendiente |
| 5. Recuperar momentos | Prototipo de buffer circular en disco y guardar últimos 30–120 s | Reproducción/grabación estable y FFmpeg disponible | Límite de disco, limpieza, continuidad del fragmento y consumo medidos en un stream antes de ampliar | Pendiente |
| 6. Biblioteca y comodidad | Biblioteca de capturas/grabaciones/fragmentos, diagnóstico accesible y modo de interfaz sencilla | Bloques 2, 3 y 5 | Buscar/abrir archivos; tratar archivos movidos; informe sin secretos; herramientas avanzadas opcionales | Pendiente |

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
- El updater presenta una incompatibilidad de firmas comprobada; resolverla antes de un release (ver `guides/UPDATER_VERIFICATION.md`).
- El DVR actual usa el rango disponible del reproductor; no garantiza un historial completo del directo.
- Separar "implementado", "probado automáticamente" y "validado en sesión real"; no marcar una función terminada solo porque compila.

## Después

Chat sincronizado en VODs, Discord RPC y Stream Deck quedan después del núcleo anterior.
IA local y soporte de otras plataformas permanecen como investigación, sin compromiso de versión.

Fuentes de integración: [EventSub WebSocket](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/),
[tipos de suscripción](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/) y
[ciclo de vida de Twitch](https://dev.twitch.tv/docs/product-lifecycle/).
