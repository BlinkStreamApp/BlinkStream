# Prueba de acreditación nativa de Drops

Esta prueba usa el player HLS de BlinkStream, no un segundo reproductor. La telemetría es
experimental y está desactivada por defecto. No confundir reportes aceptados con minutos ganados.

## Preparación

1. Cerrar la versión anterior y abrir el ejecutable local recién compilado.
2. Elegir un canal en directo con campaña «En este canal». El inventario debe sincronizar sin error.
3. Anotar el progreso inicial de un Drop no reclamado, de la campaña actual.
4. Apagar Auto-Claim para aislar la prueba de minutos (su flujo oficial es independiente).
5. Activar «Reporte nativo de visionado (experimental)» en el panel Drops.

## Medición

- Reproducir vídeo normal (no solo audio), con la app visible, durante 3–5 minutos. No hace falta
  abrir Twitch ni recargar constantemente. La sincronización del inventario sigue cada 15 s.
- El contador `x/60 s` indica evidencia local para el siguiente reporte, no progreso de un Drop.
- Tras un minuto medido debe aparecer un reporte aceptado o un error explícito. Buffering,
  búsquedas y suspensiones pueden retrasarlo porque esos intervalos no se reportan.
- Un HTTP 204 solo indica recepción. Éxito de acreditación requiere que el mismo Drop aumente
  sus minutos/porcentaje en el inventario remoto. Si no aumenta, la prueba no está validada.
- Mute se comunica tal como está; no se falsifica. Para una primera prueba puede dejarse sonido
  normal. No mezclar otros canales/dispositivos con la misma cuenta durante la medición.

## Regresiones

- Pausar 30–60 s: estado pausado y ningún reporte nuevo. El inventario podría aplicar un reporte
  anterior con retraso; eso no demuestra que una pausa genere tiempo.
- Reanudar: el muestreo vuelve sin reportar los segundos pausados.
- Cambiar canal: se elimina la sesión anterior y se empieza otra; no transferir segundos.
- Apagar la opción: no nuevos reportes. Cerrar/reabrir el panel no reinicia la medición del player.
- HTTP 401/403/429 o rechazo de integridad: reporte detenido hasta desactivar/reactivar manualmente,
  sin falsificar credenciales, reintentos en bucle ni players ocultos.

## Bloqueo DNS

Si el inventario funciona pero el reporte falla, comprobar `Resolve-DnsName spade.twitch.tv`.
El 2026-10-02 este equipo devolvió `0.0.0.0` y `::`, mientras `gql.twitch.tv` resolvía normalmente:
compatible con un filtro DNS que impide llegar al colector. No es evidencia de rechazo HTTP.
El usuario confirma que utiliza Pi-hole; permitir el dominio exacto, no todos los dominios Twitch.

La app detiene el reporte ante DNS sin resolución, direcciones nulas/locales o timeout DNS y
distingue errores de transporte HTTPS. No cambia servidores DNS, usa IPs alternativas ni evade
filtros. El usuario debe revisar su filtro y permitir específicamente `spade.twitch.tv` si desea
continuar. Después, desactivar/reactivar la prueba y repetir la medición; sigue pendiente confirmar
minutos remotos, incluso si el envío recibe HTTP 204.

## Evidencia útil si falla

Captura del panel completo con canal/campaña, mensaje de la prueba, reportes aceptados y progreso
antes/después; tiempo reproducido y si hubo buffering. Logs con prefijo `[DropsWatch]` sin copiar
cookies, tokens, cabeceras de autorización ni URLs firmadas de reproducción.
