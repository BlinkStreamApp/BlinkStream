# StreamNook: transporte real de Drops frente a BlinkStream

Fecha: 2026-11-04. Revisión fijada: `bc86adc57541bc1f92056db6d9f55d79c24f32bb`
(HEAD main consultado mediante GitHub API). Complementa la revisión inicial;
no incorpora código ni credenciales del proyecto externo.

## Hallazgo

StreamNook usa una autorización y token específicos para Drops vinculados al
cliente Android de Twitch. No consulta su catálogo simplemente con la cookie de
la sesión web principal. Nuestra consulta personalizada con sesión web no es una
implementación equivalente; la captura real de BlinkStream devuelve
`Catálogo: failed integrity check`.

| Capa | StreamNook, código revisado | BlinkStream 24 |
| --- | --- | --- |
| Autorización | El centro llama a `connect_twitch_approval`; abre autorización adicional reutilizando el perfil web activo | Sesión web existente del inventario integrado |
| Identidad OAuth | `TWITCH_ANDROID_CLIENT_ID` para autorización y peticiones de Drops | Cliente web en las consultas nativas de inventario/catálogo |
| Credencial | Token dedicado de `DropsAuthService`, conservado en `token_vault` | Token leído nativamente de la sesión web |
| Catálogo | `currentUser.dropCampaigns` con token dedicado y cabeceras del cliente Android; caché de5min | Consulta personalizada con token web; rechazo autenticado de integridad |
| Cabeceras | Client-ID, OAuth, Origin/Referer y IDs de dispositivo/sesión | Client-ID web, OAuth y User-Agent en el transporte actual |
| Reclamo | Operación persistida `DropsPage_ClaimDropRewards`, con `dropInstanceID` | Intento nativo web y ruta oficial, exigiendo confirmación posterior del inventario |

El código también conserva Device Code Flow con scopes vacíos para obtener el
token de Drops. El flujo de escritorio del centro revisado utiliza la autorización
adicional integrada; no es correcto describirlo únicamente como login por código.
Una autorización sin scopes explícitos no acredita que una aplicación tercera
obtenga las capacidades internas del cliente oficial.

## Fuentes principales

- [Centro: inicio de la autorización separada](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src/components/DropsCenter.tsx)
- [Aprobación integrada y seguimiento de token](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src-tauri/src/services/twitch_approval.rs)
- [Cliente OAuth, flujos y almacenamiento de Drops](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src-tauri/src/services/drops_auth_service.rs)
- [Cabeceras, catálogo, inventario y reclamación](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src-tauri/src/services/drops_service.rs)
- [Captura nativa del resultado de la autorización](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src-tauri/src/commands/twitch.rs)

## Implicaciones para la implementación

- La identidad/token del cliente constituye una diferencia comprobada. Es la
  hipótesis principal de la incompatibilidad; no se ha realizado aquí una prueba
  autenticada comparativa que aísle por separado cada cabecera o decisión de Twitch.
- Una consulta anónima aceptada solo comprueba esquema/forma. No demuestra acceso
  autenticado al catálogo ni capacidad de reclamar.
- El patrón trasladable es sesión Drops separada, token protegido, identidad/cuenta
  verificadas, cliente/token coherentes y pruebas reales de catálogo/reclamo antes
  de ampliar la interfaz. No basta con sustituir una constante de Client-ID.
- Twitch indica que cada aplicación debe utilizar su propio Client-ID y advierte
  contra compartirlo entre aplicaciones: [registro oficial](https://dev.twitch.tv/docs/authentication/register-app/).
  El uso del cliente Android oficial por StreamNook no demuestra que esté permitido
  para BlinkStream ni que un token de nuestro cliente tenga las mismas capacidades.
- Candidata24 es una recuperación mediante página oficial; no una corrección del
  transporte de la galería nativa. No generar otra candidata por cambios cosméticos
  ni presentar otro ensayo anónimo como solución de este rechazo.

## Evidencia del usuario

El usuario confirma que Battle Support Chest x1 ya estaba obtenido antes de la
prueba. Su estado reclamado no valida el transporte de reclamación de candidata23.
Siguen pendientes un reclamo nuevo atribuible y la fuente autenticada del catálogo.
