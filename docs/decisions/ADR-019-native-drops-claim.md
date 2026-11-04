# ADR-019: Reclamo de Drops con sesión web nativa

Status: Accepted for candidate validation
Date: 2026-11-04

## Context

El usuario solicita implementar la galería y las acciones observadas en StreamNook,
incluido el reclamo de Drops. Su código usa un cliente Android y autorización
separada ([autenticación](https://github.com/StreamNook/StreamNook/blob/main/src-tauri/src/services/drops_auth_service.rs)).
BlinkStream ya conserva una sesión web oficial en la capa nativa y verifica su
inventario. La coincidencia de minutos está confirmada en una muestra; un reclamo
real con esta ampliación sigue pendiente.

## Decision

- Intentar `claimDropRewards` desde Rust con la sesión web existente y una instancia
  emitida por Twitch presente en el inventario sincronizado. No generar IDs ni
  introducir credenciales del cliente Android.
- Mantener separado `instanceId` del identificador temporal del trabajo de UI.
- Comprobar que inventario y ventana oficial comparten sesión antes de actuar.
- Una aceptación de la solicitud no confirma la recompensa: exigir `isClaimed`
  para el mismo Drop en una lectura posterior del inventario.
- Rechazos explícitos permiten la ruta oficial existente. Respuesta desconocida,
  timeout o inventario no confirmado devuelven incertidumbre y pausan Auto-Claim;
  no repetir automáticamente la mutación.
- Conservar el bloqueo nativo de una operación, los límites de tiempo, la página
  oficial y los controles de integridad. Tokens exclusivamente nativos.

## Consequences

El reclamo puede resolverse sin automatizar un botón cuando Twitch admite la
petición. Una recompensa que desaparezca del inventario sin confirmación explícita
permanece incierta. La candidata necesita prueba con el Drop pendiente indicado
por el usuario; tests y compilación no acreditan éxito en Twitch. No habilita canjes
de puntos ni operaciones de pago: esos contratos y sus pruebas son independientes.
