# ADR-013: Inventario oficial integrado en el panel de Drops

Status: Accepted
Date: 2026-10-07
Deciders: usuario y desarrollo de BlinkStream

## Context

El usuario rechaza varias ventanas para los Drops. El progreso nativo y el inventario remoto ya
funcionan en las pruebas observadas, pero el reclamo directo fue rechazado por integridad.
La ventana oficial permite reclamar manualmente y puede exigir vincular la cuenta del juego.

## Decision

Mantener la página oficial en una Webview hija visible dentro de `DropsModal`, alternando con
el progreso nativo. Auto-Claim espera su montaje antes de invocar el reclamo y ya no crea popouts.
Se conserva la sesión de cookies existente; ningún token se entrega a React ni se inyecta en la página.
El éxito sigue condicionado a `isClaimed` en una lectura del inventario, nunca al clic.

Cada apertura tiene una sesión de host propia: un montaje o cierre atrasado no destruye un panel
nuevo. Resize/scroll sincronizan el rectángulo; cerrar el modal destruye su vista, y otros diálogos
detectados la ocultan. El montaje tiene espera acotada y los errores se muestran, sin fallback a ventana.
Un retorno explícito al inventario permite recuperarse tras navegar para iniciar sesión o vincular cuentas.

Los comandos de control solo aceptan la Webview principal de origen local y límites válidos dentro
de la ventana. La página remota no obtiene permisos IPC. Las nuevas ventanas HTTPS solicitadas por
la página se redirigen a su propio panel; otros esquemas se bloquean. No se añade reproductor oficial,
iframe oculto, mutación de reclamo ni bypass de verificación. Un reclamo incierto conserva la pausa
persistida de Auto-Claim establecida en ADR-010.

Los comandos de inventario, reclamo y reporte reciben `Webview`, no `WebviewWindow`: Tauri deja
de considerar una ventana como `WebviewWindow` cuando tiene vistas hijas. Se preserva el handle
recibido, y la visibilidad/minimización se consulta en su ventana contenedora.

## Options Considered

- Popout: reutiliza el flujo anterior, pero incumple la preferencia explícita del usuario.
- Iframe React: no reutiliza el host nativo disponible; no se adopta.
- Webview hija: reutiliza el mecanismo de integración del chat, manteniendo controles React fuera
  del rectángulo nativo; exige gestionar límites, foco y cleanup entre dos superficies.

## Consequences and Validation

- Una sola ventana de BlinkStream; el paso de reclamo continúa siendo oficial, no 100 % nativo.
- No se automatiza la vinculación de cuentas ni se omiten requisitos del proveedor.
- Regresiones locales cubren montaje único, sesión por apertura, cierre atrasado, resize, timeout,
  navegación explícita, errores sin popout y espera del host antes de reclamar.
- Tras el pulido de foco/teclado y visibilidad, 507 tests frontend pasan, uno omitido; lint correcto.
  Última verificación del backend: 56 Rust, fmt y Clippy correctos.
- El usuario confirma «Funciona perfectamente» con el inventario integrado el 2026-10-07.
  La confirmación es general; no documenta por separado resize, retorno al chat, login/vinculación
  ni clic automático. El usuario acepta también el ejecutable con el pulido posterior («todo correcto»)
  el 2026-10-07; el foco React no controla la Webview. Después autoriza commit/push del código;
  publicar un release firmado requiere aprobación separada y resolver el bloqueo del updater.
