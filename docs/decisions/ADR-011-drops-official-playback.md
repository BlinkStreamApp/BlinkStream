# ADR-011: Reproducción oficial explícita para validar minutos de Drops

Status: Rejected
Date: 2026-10-02

## Context

El usuario observa una campaña elegible a cero minutos tras cinco minutos de reproducción nativa.
El inventario sincroniza y contiene recompensas históricas reclamadas, pero eso no prueba tiempo
acreditado ahora. El iframe oficial de 400×300 estaba completamente cubierto por el vídeo HLS;
Twitch exige visibilidad para autoplay y anteriormente registró un rechazo por `style visibility`.

## Decision

El usuario rechaza trasladar la reproducción a Twitch: BlinkStream debe conservar el player
nativo sin depender de otra ventana/player oficial con anuncios. Retirada la acción de abrir
el canal oficial, su comando IPC y la pausa del vídeo nativo. No restaurar el iframe oculto que
no cumplía los requisitos de autoplay. La acreditación nativa sigue sin implementación validada.

Consultar/actualizar el inventario no constituye reproducción ni incrementa minutos. El panel
conserva exclusivamente el progreso que comunica Twitch, sin temporizadores que lo simulen.

## Consequences

- Mantener reproducción nativa y un único player; no presentar abrir Twitch como solución.
- El watcher actual solo consulta inventario; falta estudiar una integración de acreditación
  ligada a reproducción real, con sesión de usuario, lifecycle y confirmación remota.
- No confundir esta decisión de reproducción con el reclamo definido en ADR-010, cuya
  automatización y dependencia de la página oficial también siguen pendientes de validación.

Referencia: https://dev.twitch.tv/docs/embed/video-and-clips/
