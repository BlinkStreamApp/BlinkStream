# StreamNook: funciones aplicables y análisis de Drops/recompensas

Fecha: 2026-11-04. Revisión de web pública, código fuente y comparación con BlinkStream.

Referencia fijada: [bc86adc57541bc1f92056db6d9f55d79c24f32bb](https://github.com/StreamNook/StreamNook/tree/bc86adc57541bc1f92056db6d9f55d79c24f32bb), commit del 2026-11-03, versión 8.8.21. La web mostraba esa versión. BlinkStream local: c8ca7ca, candidata 1.5.4/17.

La web se abrió en navegador y se revisaron sus funciones y capturas. Se inspeccionaron los módulos de autenticación, inventario, telemetría, canjes, cofres, eventos y UI del repositorio. No se instaló ni ejecutó el binario de StreamNook, ni se inició sesión con cuentas del usuario. Por tanto, esta revisión verifica implementación estática, no crédito de Drops ni éxito real de canjes. Los comentarios del código expresan la intención de sus autores; no son prueba de funcionamiento.

## Conclusión

StreamNook ofrece buenas referencias para un centro de recompensas, chat independiente y organización multiventana. Sus Drops no dependen de una nueva API pública que nos falte: emplean servicios internos de Twitch, credenciales específicas y tráfico auxiliar. Podemos aprovechar el diseño y las reglas de consistencia, pero su transporte requiere una evaluación independiente.

Hallazgo propio prioritario: `src/utils/twitch.js:906`, `redeemCustomReward`, hace POST a `/helix/channel_points/custom_rewards/redemptions`. La API pública documenta GET y PATCH para esa ruta, sin una operación POST de canje del espectador. El mensaje actual atribuye ciertos errores a restricciones de recompensas creadas por otras aplicaciones, mezclando dos problemas diferentes. Hay que corregir ese flujo y su explicación antes de anunciar canjes nativos.

## Funciones que merece la pena adaptar

| Función | Referencia comprobada | Aplicación a BlinkStream | Orden propuesto |
|---|---|---|---|
| Centro de Drops por juego/campaña | `DropsCenter.tsx`, `drops_overview.rs` | Separar descubrimiento, progreso, reclamables e inventario obtenido; filtros de juego/caducidad y canal elegible | Alta |
| Estado de recompensas contextual | `channel_rewards.rs`, `reward_redeem.rs` | Mostrar saldo, coste, pausa, cooldown y límites; texto requerido e identificador estable para reintentos | Alta, después de resolver el transporte |
| Chat independiente con pestañas/divisiones | `multichat/SplitLayout.tsx`, `utils/splitTree.ts` | Reutilizar nuestro Chat Ligero para varias conversaciones sin reproducir vídeo; aprovechar ventana oficial separada cuando se necesite | Alta, entrega separada |
| Multistream con foco de audio y presets | `multi-nook`, `multiNookStore.ts` | Ampliar Grid existente con selección explícita de audio, calidad por celda y espacios guardados | Media; encaja en 1.6 |
| Paleta de acciones | `CommandPalette.tsx` | Ampliar la búsqueda Ctrl+K a ajustes, canales y acciones existentes | Media |
| Preferencias por usuario del chat | `userChatOverrides.ts` y UI de perfiles | Alias, colores y notas privadas; reglas de resaltado | Media; no enviar notas a Twitch |
| Overlay configurable para OBS | Presentado en la web | Posible integración posterior; decidir primero alojamiento, privacidad y credenciales de cada fuente | Posterior |

No duplicar lo que ya existe: BlinkStream tiene Grid, búsqueda de chat, emotes, temas y avisos de directo. La mejora está en su organización, autonomía y consistencia. Kick/YouTube, comunidad y plugins amplían bastante el alcance; no son requisito para cerrar 1.5.4.

Fuentes de producto: [web](https://streamnook.app/), [paleta](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src/components/CommandPalette.tsx), [divisiones de chat](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src/components/multichat/SplitLayout.tsx), [reproductor Grid](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src/components/multi-nook/useMultiNookPlayer.ts).

## Cómo implementan Drops

### Sesión

`drops_auth_service.rs` mantiene una credencial distinta, emitida bajo el cliente Android de Twitch. Contiene flujo de dispositivo y autorización en navegador integrado. Guarda el token mediante `token_vault`, con cifrado AES-GCM y almacenamiento de clave del sistema cuando está disponible; existe fallback de clave en archivo. No equivale a nuestro OAuth propio ni se debe mezclar un token con otro Client-ID.

Fuente: [autenticación Drops](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src-tauri/src/services/drops_auth_service.rs), [almacenamiento](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src-tauri/src/services/token_vault/mod.rs).

### Inventario y presentación

Consultan GraphQL interno para campañas, inventario y minutos. `drops_overview.rs` combina campañas, progreso y objetos obtenidos en un modelo por juego. `dropProgressDisplay.ts` centraliza la selección del Drop y el porcentaje entre varias superficies. Es una referencia útil para evitar que tarjetas, panel y avisos discrepen.

BlinkStream ya sincroniza inventario/campañas del canal y utiliza progreso remoto. Lo que falta respecto a esa experiencia es un catálogo organizado, selección clara del objetivo y mejor estado de elegibilidad.

Fuentes: [modelo agregado](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src-tauri/src/services/drops_overview.rs), [progreso compartido](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src/utils/dropProgressDisplay.ts).

### Tiempo visto

`watch_heartbeat_service.rs` sigue un canal activo y envía eventos `minute-watched` aproximadamente cada minuto mediante Spade y una mutación GraphQL de respaldo. Sigue el foco del Grid y dispone de parada por estado de reproducción. El estado inicial se establece optimistamente como reproduciendo; parte del payload declara valores fijos de visibilidad y audio. No son mediciones equivalentes a nuestro muestreo de fotogramas/posición.

Además, `drop_playback.rs` obtiene una lista autenticada de baja calidad y envía HEAD a segmentos nuevos, sin descargar vídeo, para intentar asociar tráfico a esa cuenta. Esto identifica una hipótesis útil: la identidad del token de reproducción puede importar además de la telemetría. No demuestra que HEAD produzca crédito. Su contador considera suficiente que la petición no falle en transporte, sin comprobar el estado HTTP del segmento.

Propuesta: comparar identidad de reproducción y progreso remoto durante visionado real. Mantener el inventario como autoridad y nuestra parada ante pausa/buffering. No introducir tráfico sintético de segmentos ni adoptar otro Client-ID como supuesto arreglo.

Fuentes: [heartbeat](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src-tauri/src/services/watch_heartbeat_service.rs), [tráfico auxiliar](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src-tauri/src/services/drop_playback.rs).

### Reclamación

`drops_service.rs` llama a `DropsPage_ClaimDropRewards` con `dropInstanceID`. Tiene Auto-Claim, memoria de intentos y reintentos espaciados. El flujo automático incluye comprobación posterior del inventario para no anunciar como entregado un Drop que sigue pendiente. La reclamación manual aún actualiza estado local al aceptar determinados resultados; hay fallbacks que construyen un ID cuando no tienen el emitido por Twitch. No conviene trasladarlos.

BlinkStream reclama actualmente mediante el inventario oficial integrado y espera confirmación. Podemos mejorar descubrimiento y notificaciones conservando ese límite.

Fuente: [servicio de Drops](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src-tauri/src/services/drops_service.rs).

## Puntos y canjes: tres operaciones distintas

1. **Obtener puntos y cofres:** `watched_chest.rs` recibe ofertas por eventos y consulta periódica, aplica la preferencia de Auto-Claim y deduplica. La independencia del chat visible es un buen patrón. Sin embargo, su función subyacente `claim_channel_points` interpreta HTTP correcto y campos ausentes con valores por defecto, sin comprobar completamente errores GraphQL/de negocio; podría anunciar un cofre sin confirmación. La deduplicación también recuerda un intento antes de saber si tuvo éxito.
2. **Gastar puntos como espectador:** `reward_redeem.rs` valida la recompensa y despacha operaciones específicas. `commands/drops.rs:1663` implementa el canje personalizado con `RedeemCustomReward`, credencial Drops y GraphQL interno. Mantiene un transaction ID para reintentos. Demuestra que existe un flujo interno distinto del POST Helix incorrecto que tenemos; no garantiza que nuestra credencial propia pueda usarlo.
3. **Aprobar/rechazar como moderador:** no se encontró una implementación equivalente en los módulos de recompensas/moderación revisados. No debe inferirse que su canje del espectador solucione nuestra cola. Helix exige que el cliente coincida con la aplicación que creó la recompensa, además de token y permisos del creador. Mantener Mod View oficial para esas acciones externas.

Fuentes: [cofres](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src-tauri/src/services/watched_chest.rs), [despacho de canjes](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src-tauri/src/services/reward_redeem.rs), [mutación de canje](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src-tauri/src/commands/drops.rs#L1663), [restricción oficial de gestión](https://dev.twitch.tv/docs/api/reference/#update-redemption-status).

## Dependencias privadas y licencia

- El servicio de puntos usa `pubsub-edge.twitch.tv` y topics internos. Twitch retiró el PubSub público para terceros; un uso interno aparente no ofrece compatibilidad oficial. No afirmar que ese socket funciona o falla actualmente sin probarlo. Referencias: [código](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src-tauri/src/services/channel_points_websocket_service.rs), [ciclo de vida oficial](https://dev.twitch.tv/docs/product-lifecycle/).
- Existe infraestructura que obtiene Client-Integrity en una página Twitch oculta para determinadas operaciones web. No es la vía utilizada por todos sus Drops/canjes ni una autorización pública que podamos trasladar. [Código](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/src-tauri/src/services/twitch_integrity.rs).
- La licencia actual declara PolyForm Noncommercial 1.0.0 con permisos adicionales; no MIT. Permite determinados forks gratuitos y donaciones con condiciones. Esta revisión no incorpora código de StreamNook. Implementar patrones con código propio; revisar condiciones concretas antes de importar componentes. [LICENSE](https://github.com/StreamNook/StreamNook/blob/bc86adc57541bc1f92056db6d9f55d79c24f32bb/LICENSE).

## Secuencia propuesta y aceptación

1. Corregir el contrato y mensaje del canje del espectador. Si no hay transporte nativo validado, ofrecer la acción oficial y no intentar un endpoint inexistente. Mantener separada la gestión del creador/moderador.
2. Diagnóstico Drops controlado: campaña activa, misma cuenta, canal elegible, reproducción real, inventario remoto antes/después de varios minutos. Comparar con Twitch oficial. Una respuesta HTTP aceptada no basta.
3. Prototipo propio del centro de recompensas: juegos, campañas, requisitos, fechas, estado de vinculación, progreso confirmado, reclamables y objetos obtenidos. Reutilizar inventario y UI oficial existentes; ocho idiomas.
4. Chat Ligero independiente y después Grid/workspaces. Mantener la mitigación Windows de chat oficial en ventana separada y medir FPS/CPU con los layouts reales.

Criterios: sin confundir pendiente con obtenido, sin mezclar cuentas/canales, sin doble gasto por reintentos, sin crédito local inventado, sin errores tratados como listas vacías y sin regresión de latencia/FPS. La revisión no altera el roadmap aprobado ni publica una versión.
