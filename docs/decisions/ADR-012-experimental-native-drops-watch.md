# ADR-012: Reporte experimental de reproducción nativa para Drops

Status: Accepted (experimental, opt-in)
Date: 2026-10-02

## Context

El inventario sincroniza pero Twitch no acredita el vídeo HLS de BlinkStream. El usuario rechaza
abrir un player oficial con anuncios y autoriza probar una integración nativa experimental.
La documentación pública de Drops no especifica una API de reporte de visionado para este player.
Un cliente independiente usa eventos `minute-watched` en Spade. El 2026-10-02 comprobamos, sin
credenciales ni reportes, el endpoint publicado `https://spade.twitch.tv/track` y la consulta de
metadatos públicos del canal `cahos_gaming` (directo AION 2). Eso no prueba acreditación.

## Decision

- Checkbox experimental desactivado por defecto; la preferencia explícita se conserva localmente.
- El frontend entrega muestras del vídeo (posición, estado, velocidad, frames si están disponibles,
  mute real) cada cinco segundos y ante pausa/buffering/búsqueda/visibilidad. No entrega tokens,
  payloads, endpoints ni minutos arbitrarios. Teardown serializado antes del siguiente canal.
- Rust acepta solo la ventana/origen local principal. Usa reloj monotónico y avance del media,
  limitado por tiempo real. No cuentan intervalos detenidos, frames congelados, búsquedas ni
  suspensiones largas. Velocidad rápida no acelera reportes. Las muestras válidas previas se
  conservan durante pausas; cambiar canal/calidad o desactivar elimina la sesión.
- Solo tras medir 60 segundos y detectar una campaña del canal en inventario se prepara un
  evento. Rust consulta cuenta/directo/juego con la cookie WebView nativa existente; credenciales
  no salen de Rust ni se envían al colector. No reportar usuarios anónimos o directos offline.
- Descubrir configuración pública sin ejecutar sus scripts; solo GET de Twitch y su archivo de
  settings en `assets.twitch.tv/config/`, respuestas de tamaño acotado y sin redirects. El POST
  permite únicamente HTTPS `spade.twitch.tv/track`, sin parámetros ni credenciales en URL.
- Enviar la propiedad mute real y la fecha actual, no fingir dispositivo/atención/visionado ni
  falsificar tokens de integridad. Sin player auxiliar, peticiones HEAD de farming ni auto-login.
- Serialización, timeout global de 25 segundos y mínimo 60 segundos entre intentos. HTTP
  401/403/429 o rechazo de integridad detienen el reporte hasta desactivar/reactivar explícitamente.
- DNS sin resolución, timeout o direcciones nulas/locales detienen el reporte con diagnóstico;
  no cambiar DNS ni resolver mediante servicios/IPs alternativos para eludir filtros del usuario.
- HTTP 204 significa solo reporte aceptado. Los porcentajes/minutos de Drops siguen procediendo
  exclusivamente del inventario remoto; nunca incrementarlos localmente.

## Consequences

- Protocolo interno y experimental: puede cambiar, rechazar eventos o no acreditar Drops aunque
  acepte telemetría. No se garantiza visionado sin anuncios por cambios del proveedor.
- La prueba inicial solo soporta el player principal visible, vídeo (no audio-only), una cuenta y
  un canal. No promete acreditación mientras la app está minimizada, oculta o sin reproducción.
- Errores y reportes aceptados se muestran en el panel para separar transporte y acreditación.
- Auto-Claim sigue siendo una integración distinta (ADR-010); la prueba de minutos no soluciona
  su dependencia de la página oficial ni demuestra reclamo 100 % nativo.
- Pendiente probar una sesión real y confirmar incremento de `currentMinutesWatched` con el
  player nativo; pruebas unitarias/build y metadatos públicos no sustituyen esa validación.

Referencias:

- https://dev.twitch.tv/docs/drops/technical-guide/
- https://github.com/DevilXD/TwitchDropsMiner/blob/master/channel.py (contrato observado; no código copiado)
