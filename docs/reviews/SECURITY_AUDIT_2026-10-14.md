# Auditoría de seguridad de BlinkStream

Fecha: 2026-10-14. Estado: correcciones locales implementadas y controles cloud desplegados con autorización; aceptación nativa y publicación pendientes.

## Remediación verificada

Los hallazgos siguientes conservan la evidencia de la revisión inicial, no describen todos
el estado actual del árbol local. La versión pública 1.4.4 no incorpora estas correcciones.

- Supabase producción: migración `20261014191011_harden_favorites_identity_permissions`
  aplicada (equivale al archivo local `20260804195525`). RPC inaccesible a anon/authenticated,
  ejecutable solo por service_role; permisos anon y tres políticas legacy de favoritos retirados.
  Permanecen únicamente las políticas de propietario. Verificación por catálogo, sin leer
  favoritos ni cuentas reales. No se borraron datos.
- `twitch-auth` versión 36 desplegada: refresh POST con JSON acotado; GET legacy temporal
  para 1.4.4. Pruebas HTTP anónimas con tokens sintéticos: POST y GET devuelven
  `400 refresh_failed`; JSON inválido devuelve `400 invalid_refresh_body`.
  Esto verifica transporte/compatibilidad, no una renovación real de sesión.
- Cliente local: tokens nuevos solo en memoria/almacén nativo; migración de secretos legacy
  fuera de localStorage. Logout invalida respuestas tardías y serializa escrituras/borrado.
- Medios nativos: URL HTTPS analizada, dominios por límites exactos, DNS público fijado,
  redirects desactivados, límites de tiempo/tamaño. Recorte MP4 local acotado a 600 s,
  FFmpeg sin stdin ni sobrescritura, proceso con timeout/kill. El recorte HLS no se admite.
- Companion opt-in, token aleatorio de 128 bits, rate limit por IP, Host/Origin validados,
  cuerpos HTTP acotados y comandos validados. Rendering remoto con DOM/textContent;
  QR generado localmente, sin enviar credenciales a un proveedor externo.
- IPC con lista explícita de comandos y webviews locales; sin wildcard/devtools remotos.
  CSP connect-src restringida; diagnóstico redacta secretos y parámetros de URL.
- h2 0.4.16, quinn-proto 0.11.18 y rustls 0.23.46: consulta OSV de los paquetes Rust
  de registro sin vulnerabilidades activas. Seis avisos de dependencias transitivas sin
  mantenimiento permanecen. GLib vendorizado requiere su regresión específica Linux.
- CI de release/updater con acciones fijadas por SHA y gates de vulnerabilidades,
  Companion y parsing refresh. Estos gates aún no han corrido en GitHub.

### Límites y pendientes

Validación local final: 681 tests frontend correctos (uno omitido), 59 Rust Windows,
23 release/documentación, 16 OAuth, dos Companion y dos refresh POST. ESLint sin avisos,
fmt/Clippy y builds frontend/Rust release Windows correctos; pnpm audit producción sin
avisos conocidos. Deno completo no ejecutado localmente por ausencia del runtime.
Ejecutable de prueba único actualizado, sin instalación ni ejecución por el agente.
Corrección posterior de empaquetado: el primer Cargo release directo buscaba localhost;
el ejecutable de prueba se recompila con `pnpm build:desktop` (Tauri CLI, custom-protocol)
para incrustar la interfaz. Veinticuatro pruebas release/documentación correctas.

- Companion sigue usando HTTP: solo redes de confianza. No hay confidencialidad TLS y
  el servidor puede sufrir denegación de servicio local por conexiones lentas.
- Retirar refresh GET tras migrar clientes antiguos. Activación de protección de contraseñas
  filtradas Supabase pendiente de autorización/configuración; advisor de usuarios anónimos
  exige revisar el uso esperado, no ampliar permisos ni borrar usuarios a ciegas.
- Verificar Twitch/OAuth real, QR desde móvil, recorte/grabación, DNS/CDN y reproducción
  nativa sostenida en Windows; Linux/macOS y CI firmado pendientes.
- Authenticode/MSIX y las detecciones VirusTotal no quedan resueltos por estos cambios.
  No se ejecutó el instalador señalado, no se añadieron exclusiones de antivirus.

## Evidencia inicial (antes de las correcciones)

## Alcance y límites

Revisión dirigida de autenticación React/Rust/Supabase, comandos IPC, cliente HTTP nativo,
recorte/grabación, Companion, CSP/capabilities, dependencias y firma/distribución.
Incluye el árbol local (con 1.5 en desarrollo) y comprobaciones de Supabase de solo lectura.
Los archivos principales citados de Rust/auth no difieren del tag público v1.4.4.

No es una auditoría exhaustiva, certificación ni demostración de que el EXE sea malware o
esté libre de él. No se ejecutó el instalador señalado por VirusTotal, no se enviaron muestras,
no se explotaron servicios ni se consultaron datos personales de usuarios.
Solo se ejecutaron pruebas compiladas desde el código y reproducciones sintéticas sin red.
No se cambió código funcional, RLS, secretos, permisos ni infraestructura.

P1: corregir antes de una nueva distribución Store. P2: endurecimiento posterior o paralelo.
La prioridad de corrección no equivale automáticamente a severidad crítica de explotación.

## Hallazgos comprobados y correcciones propuestas

### SEC-01 · P1 · Endurecimiento Supabase pendiente en producción

- Advisor de seguridad en el proyecto BlinkStream confirma que
  `public.get_user_id_by_email(target_email text)` es SECURITY DEFINER y ejecutable por
  `anon` y `authenticated`. Su definición local consulta `auth.users` y devuelve un ID.
- Riesgo: consultas no previstas de existencia/identidad de cuentas mediante el RPC público.
  No implica por sí solo acceso a contraseñas, tokens o todas las filas de usuarios.
- Advisors también señalan políticas de favoritos que admiten roles anónimos. Este aviso
  no prueba que un anónimo pueda leer todos los favoritos: falta revisar las expresiones
  desplegadas y probar acceso con identidades separadas, sin datos de terceros.
- La lista de migraciones remotas solo incluye `20260703000000` y `20260804171344`.
  Falta `20260804195525_harden_favorites_identity_permissions.sql`, que ya restringe el RPC
  a service_role y retira permisos/políticas legacy.
- Propuesta: revisar y aplicar esa migración con autorización específica; comprobar que
  anon/authenticated no pueden ejecutar el RPC, y que dos cuentas no comparten favoritos.
- Referencias: `supabase/migrations/20260703000000_add_get_user_id_by_email.sql:10`,
  `supabase/migrations/20260804195525_harden_favorites_identity_permissions.sql`.
- [Remediación del RPC](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
  [aviso de políticas anónimas](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins).

### SEC-02 · P1 · Filtro de URLs nativas eludible

- `fetch_m3u8_content` y `fetch_segment` comprueban substrings sobre toda la URL, no el hostname.
- La reproducción del predicado acepta `https://evil.example/ttvnw.net` y
  `https://127.0.0.1/?ttvnw.net`. No se enviaron solicitudes a esas direcciones.
- Riesgo: si una entrada no confiable alcanza esos IPC, la supuesta allowlist no limita el
  destino. El acceso efectivo a servicios internos depende de TLS, DNS y redirecciones;
  no se ha demostrado explotación remota ni una conexión SSRF en este análisis.
- Los clientes no añaden una política de redirecciones que revalide el destino, ni un límite
  explícito de bytes antes de cargar la respuesta completa.
- Propuesta: parsear URL, validar dominio exacto/subdominio con frontera de punto y destinos
  necesarios, rechazar credenciales/puertos no previstos; bloquear o revalidar cada redirect,
  considerar resolución DNS y límites de tamaño. Reutilizar los patrones de `drops_watch.rs`.
- Referencias: `src-tauri/src/lib.rs:1028`, `:1126`.

### SEC-03 · P1 · Credenciales de sesión en URL y almacenamiento inseguro de fallback

- El refresh Supabase se envía en un parámetro GET `?refresh=...`; puede acabar en logs de
  infraestructura y errores con URL completa. HTTPS no elimina ese riesgo.
- Si falla keychain, Twitch access tokens y refresh tokens Supabase se guardan en localStorage.
  El JWT Supabase se conserva allí de forma habitual. No son equivalentes al almacén del OS.
- Riesgo: una XSS/compromiso del frontend o acceso a su almacenamiento puede extraer sesiones;
  el fallback persiste secretos precisamente cuando falla la protección prevista.
- Propuesta: refresh por POST con body; compatibilidad/migración del endpoint antes de retirar GET.
  En desktop, fallar explícitamente o mantener sesión solo en memoria si keychain falla;
  retirar el fallback persistente y redactar query strings en logs/diagnósticos.
- Referencias: `src/utils/supabase.js:121`, `:166`, `:202`;
  `src/hooks/useAuth.js:216`, `:272`; `supabase/functions/twitch-auth/index.ts:213`.

### SEC-04 · P1 · Companion expuesto automáticamente y sin protección contra intentos

- `lib.rs` inicia Companion durante setup; `companion.rs` enlaza `0.0.0.0` por HTTP.
  No es opt-in efectivo por el simple hecho de abrir el menú del mando.
- El PIN es aleatorio, exacto y se rota al reiniciar el servidor, pero tiene seis dígitos;
  no se encontró rate limit/bloqueo de intentos ni comprobación de Host/Origin en la API.
- El PIN viaja en query/body sobre HTTP. Un observador de una red no confiable podría capturarlo.
  No habilitar CORS universal es correcto, pero no sustituye autenticación ni defensa de red.
- Propuesta: servidor apagado por defecto y activación explícita; sesión/token de mayor entropía
  tras emparejamiento, límites de intentos/conexiones y validación de origen/host. Retirar PIN de
  query/historial tras emparejar y evaluar transporte seguro sin bajar validación TLS.
- Referencias: `src-tauri/src/lib.rs:2557`; `src-tauri/src/companion.rs:155`, `:272`.

### SEC-05 · P1 · HTML/JavaScript interpolado en Companion

- Avatar, nombre de canal y favoritos se insertan en `innerHTML` y handlers `onclick`.
  `update_companion_state` acepta esas cadenas/JSON sin un contrato de saneamiento equivalente.
- Reproducción sintética del sink: una comilla en el avatar introduce un atributo `onerror`.
  JSDOM solo analizó el HTML: no ejecutó el handler ni cargó imágenes.
- Riesgo condicionado a controlar/modificar esos datos (p. ej. frontend comprometido o transporte
  HTTP manipulado); no se ha probado que nombres legítimos de Twitch permitan esa carga.
- Propuesta: `createElement`, `textContent`, propiedades DOM y `addEventListener`; URLs de imágenes
  validadas y DTO acotado nativo. Retirar scripts inline/unsafe-inline del mando cuando sea viable.
- Referencias: `src-tauri/src/companion.rs:423`, `:634`, `:656`.

### SEC-06 · P1 · Recorte FFmpeg sin validación nativa del origen ni ejecución acotada

- `download_media_range` pasa la URL recibida directamente a `ffmpeg -i`; no limita esquema/host
  ni protocolos de entradas y playlists. No basta con validar la URL en React.
- La comparación de tiempos no rechaza todos los valores no finitos; no hay tope nativo de
  duración ni timeout/cancelación del proceso. `-y` sobrescribe archivos de salida coincidentes.
- Riesgo condicionado a una entrada IPC manipulada: lectura de medios locales/destinos arbitrarios,
  consumo de recursos y sobrescritura de clips existentes, sin afirmar ejecución de shell.
  Los argumentos se pasan separados, por lo que no se identificó shell injection en este comando.
- Propuesta: origen y protocolos limitados en Rust/FFmpeg, tiempos finitos y acotados,
  timeout/cancelación/cleanup y nombre único o confirmación de sobrescritura.
- Referencia: `src-tauri/src/lib.rs:1654`.

## Mejoras preventivas (P2)

- **IPC mínimo:** capability con `windows/webviews: ["*"]`, devtools permitidos y comandos
  propios registrados sin AppManifest específico. Separar permisos por ventana local y
  allowlist de claves del keychain. No declarar que Twitch remoto tiene esos permisos:
  no hay remote capability configurada y Tauri niega acceso remoto por defecto.
- **CSP:** limitar `connect-src https:` a los hosts necesarios para reducir la salida de datos
  si el frontend se compromete, conservando reproducción/CDNs válidos.
- **Logs:** redactar tokens/query de manifests en errores y en estadísticas HTTP; hoy varios
  errores de Rust devuelven URLs completas. No registrar payloads OAuth.
- **Cadena CI:** fijar por SHA las actions restantes; instalar dependencias desde fuentes
  verificadas y registrar procedencia/versión de Streamlink/FFmpeg. El nuevo workflow Pi
  ya usa checkout fijado y petición HMAC, pero aún no está desplegado/probado con Docker real.
- **Supabase:** activar protección de contraseñas filtradas tras revisar elegibilidad/configuración.
  Advisor la señala desactivada; su relevancia para las contraseñas aleatorias server-side actuales
  es distinta de una contraseña elegida por el usuario.
- **Rutas de grabación:** existe canonicalización del padre y allowlist. Revisar también archivo
  final existente/symlink y carreras, sin afirmar un escape demostrado en Windows.

## Validaciones y controles existentes

- `pnpm audit --json`: cero avisos conocidos en el lockfile JavaScript consultado.
- GitHub Dependabot: cero alertas abiertas en esta consulta; no certifica dependencias sin riesgos.
- `cargo audit` no está instalado: auditoría independiente del catálogo RustSec **pendiente**.
  No se instaló una herramienta nueva. GLib es un vendor con backport, no asumir que la versión
  declarada por sí sola confirma o descarta el aviso original.
- 56 tests Rust Windows, 16 checks OAuth, 14 tests frontend auth/Supabase y 23 tests
  release/documentación correctos. Pruebas sintéticas de URL/HTML reproducidas sin red.
- Grabación principal: validación de canal/ruta y mutex antes de crear proceso.
- Drops: validación estricta de endpoint, sin redirects y sin bypass de integridad/DNS.
- Inventario remoto y errores se distinguen; páginas remotas no heredan capabilities locales.
- Favoritos: código local utiliza identidad confiable y SQL parametrizado; la divergencia
  entre código/migraciones del repo y servicio desplegado sigue siendo relevante.
- Firma updater y coherencia de manifiestos verificadas; no equivalen a Authenticode ni a un AV.

## Orden recomendado

1. Autorizar/remediar Supabase y validar aislamiento con cuentas de prueba.
2. URLs nativas/FFmpeg y secretos/refresh/logs con tests de regresión.
3. Companion opt-in, emparejamiento, contrato DOM y pruebas de red aisladas.
4. IPC/CSP y auditoría RustSec completa; revisar dependencias nativas reales.
5. Candidato limpio, inspección PE y evaluación en sandbox aislada/proveedores AV.
6. MSIX específico Store: validar dependencias, permisos, sesiones y updater separado.

MSIX/firma no corrigen estos hallazgos por sí solos. No continuar con excepciones de antivirus
ni tratar la proporción de detecciones de VirusTotal como una probabilidad de seguridad.
