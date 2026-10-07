# ADR-010: Reclamar Drops mediante la página oficial

Status: Accepted; presentación mediante popout sustituida por ADR-013 el 2026-10-07
Date: 2026-10-02

## Context

Twitch acepta el reclamo manual en la ventana oficial de BlinkStream, según la prueba del usuario,
pero rechaza la mutación enviada por Rust con `failed integrity check`. Leer el inventario no
otorga autorización de reclamo ni confirma acreditación de minutos.

## Decision

En escritorio, `claim_twitch_drop` usa la página oficial visible de inventario, integrada dentro
del modal según ADR-013 (la ventana aparte descrita originalmente queda sustituida). Un controlador
limitado solicita un clic en un botón específico de Drops dentro de la tarjeta del objetivo
obtenido de la caché, sin peticiones propias, cookies JavaScript, login automático ni bypass.
Solo se admite `https://www.twitch.tv/drops/inventory`; tarjetas ambiguas o no reconocidas
requieren intervención manual. No se conceden permisos IPC a páginas externas.

El reclamo se serializa y tiene timeout de 35 segundos; el clic no equivale a éxito. El comando
solo confirma cuando una nueva lectura del inventario marca el ID de Drop como reclamado.
Ausencia del Drop o timeout se consideran falta de confirmación, no éxito.

## Consequences

- Twitch procesa su propio flujo de verificación; no se falsifican sus tokens de integridad.
- El inventario oficial integrado permanece disponible para intervención del usuario; el reclamo
  ya no abre ventanas aparte. El montaje, cierre y permisos se definen en ADR-013.
- Los selectores/estructura del inventario pueden cambiar; el controlador falla cerrado.
- El control localizado «Reclamar ahora»/«Claim now» solo se reconoce si la tarjeta coincide
  con el nombre y la imagen de la recompensa recibidos del inventario; no basta el texto del botón.
- Cerrar la página requiere una lectura final del inventario antes de informar falta de confirmación.
  Un fallo del reclamo nativo pausa Auto-Claim de forma persistida; no reabrir periódicamente la ventana.
  Si una actualización confirma el ID estable como reclamado, se elimina el error de ese intento,
  aunque Twitch haya retirado su antiguo ID de instancia. El usuario puede reintentar explícitamente.
- Si una campaña desaparece inmediatamente al completarse, la lectura puede no confirmar
  el último reclamo: debe revisarse el inventario oficial, sin reintentos automáticos del mismo ID.
- La prueba manual de la página oficial no sustituye validar esta automatización en una sesión real.
