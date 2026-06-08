# PLAN v1.1.0 — Notificaciones, actualizaciones y calidad de vida

> **Versión target:** 1.1.0
> **Base:** v1.0.3 (release estable actual)
> **Prioridad:** Alta — funcionalidades que el usuario final nota
> **Esfuerzo total estimado:** ~40-50 horas efectivas

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Features principales](#2-features-principales)
3. [Backlog técnico](#3-backlog-técnico)
4. [Dependencias externas](#4-dependencias-externas)
5. [Plan de implementación](#5-plan-de-implementación)
6. [Estimación de esfuerzo](#6-estimación-de-esfuerzo)

---

## 1. Resumen ejecutivo

**v1.1.0** se centra en tres ejes:

| Eje | Feature principal | ¿Por qué ahora? |
|-----|-------------------|-----------------|
| **Notificaciones** | F2 — Notificaciones nativas de live | La app ya detecta lives (useLiveAlerts). Solo falta el plugin nativo. Bajo esfuerzo, alto impacto. |
| **Actualizaciones** | F6 — Auto-updater | Sin esto, los usuarios no reciben v1.0.3 ni futuras releases. CRÍTICO tras varias releases. |
| **Calidad de vida** | F4, I19, UI7, I16, I17+I9 | Streamlink desde UI, keychain, rendimiento y reproducibilidad. |

Se dejan **fuera del scope** de v1.1.0:
- F3 (tema claro/oscuro) → v1.2.0
- F1 (pop-out player) → v1.2.0
- F7/F8 (marcadores VODs, historial chat) → v1.2.0
- UI9 (i18n completo) → v1.2.0+ (el esqueleto ya existe)

---

## 2. Features principales

### F2 — Notificaciones nativas de live (Alta prioridad)

**Estado actual:** `useLiveAlerts.jsx` ya detecta transiciones offline→online cada 30s y muestra Toasts internos en la UI. El hook recibe `favorites` y emite alertas en un array local.

**Qué falta:** Notificaciones nativas del sistema operativo (Windows Toast, macOS Notification Center, Linux D-Bus).

#### Implementación

**Paso 1 — Añadir plugin Rust:**
```toml
# Cargo.toml
tauri-plugin-notification = "2"
```

**Paso 2 — Registrar el plugin en `lib.rs`:**
```rust
// lib.rs - setup
tauri_plugin_notification::init()
```

**Paso 3 — Añadir capability:**
```json
// capabilities/default.json
"notification:default": true
```

**Paso 4 — Modificar `useLiveAlerts.jsx`:**
```jsx
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

// En checkLive(), dentro del bloque de nueva alerta:
if (await isPermissionGranted()) {
  sendNotification({
    title: `${channel} está en vivo!`,
    body: game || 'Empezó a transmitir',
    icon: logo,
  })
} else {
  const permitted = await requestPermission()
  if (permitted) {
    sendNotification({ ... })
  }
}
```

**Paso 5 — No duplicar:** Si el usuario está dentro de la app, el Toast interno es suficiente. Solo enviar notificación nativa si la ventana NO está enfocada (usar `getCurrentWindow().isFocused()` o un flag de visibility API).

**Archivos afectados:**
- `src-tauri/Cargo.toml` + `lib.rs`
- `src-tauri/capabilities/default.json`
- `src/hooks/useLiveAlerts.jsx`
- `package.json` (añadir dependencia npm)

**Riesgos:**
- En Linux, las notificaciones dependen de D-Bus. Algunos entornos (Wayland sin portal) no las soportan. Degradación elegante → no crashear si falla.
- En Windows, el Toast requiere shortcut en Start Menu (Tauri lo maneja automáticamente en el installer NSIS/MSI).

**Estimación:** 3-4 horas

---

### F6 — Auto-updater (Prioridad crítica)

**Estado actual:** No hay auto-updater. Los usuarios deben descargar manualmente desde GitHub Releases. El workflow `release.yml` ya sube artefactos a releases en tags `v*`.

**Qué falta:** Plugin de updater, config en `tauri.conf.json`, endpoint público con versiones, UI de actualización.

#### Implementación

**Paso 1 — Añadir plugin Rust:**
```toml
# Cargo.toml
tauri-plugin-updater = "2"
```

**Paso 2 — Configurar `tauri.conf.json`:**
```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://raw.githubusercontent.com/alber-dev/blinkstream/main/updater.json"
      ],
      "pubkey": "--- (generar con tauri signer) ---",
      "windows": {
        "installMode": "passive"
      }
    }
  }
}
```

**Paso 3 — Generar clave de firma:**
```bash
pnpm tauri signer generate -w ~/.tauri/blinkstream.key
```

**Paso 4 — Crear endpoint de versión (`updater.json`):**
Archivo JSON estático alojado en GitHub raw (o propio server) con el formato:
```json
{
  "version": "1.1.0",
  "notes": "Novedades de v1.1.0...",
  "pub_date": "2025-07-15T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "...",
      "url": "https://github.com/alber-dev/blinkstream/releases/download/v1.1.0/BlinkStream_1.1.0_x64-setup.exe"
    },
    "darwin-aarch64": { ... },
    "darwin-x86_64": { ... },
    "linux-x86_64": { ... }
  }
}
```

**Paso 5 — Integración en `release.yml`:**
- Tras compilar cada target, extraer la `signature` del archivo `.sig` generado
- Subir signatures como artefactos
- En un job final (o manual), actualizar `updater.json` con las nuevas URLs + signatures

**Paso 6 — UI de actualización (opcional):**
```jsx
import { checkUpdate, installUpdate } from '@tauri-apps/plugin-updater'

const update = await checkUpdate()
if (update?.available) {
  // Mostrar diálogo "Nueva versión disponible"
  await installUpdate()
}
```

**Archivos afectados:**
- `src-tauri/Cargo.toml` + `lib.rs`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`
- `src/App.jsx` (check al iniciar, opcional)
- `.github/workflows/release.yml`
- `package.json` (añadir dependencia npm)
- **NUEVO:** `updater.json` en raíz del repo

**Riesgos:**
- Las signatures deben generarse con la MISMA clave privada en cada build. Guardar la clave en GitHub Secrets.
- En Windows NSIS, el instalador necesita permisos de administrador. `installMode: "passive"` lo hace silencioso.
- En macOS, la app sin firmar con Apple Developer ID puede dar Gatekeeper warnings. Ya tenemos ad-hoc signing.

**Estimación:** 8-10 horas (la mayor parte en CI/CD)

---

### F4 — Instalación de streamlink desde la UI (Prioridad media)

**Estado actual:** Streamlink debe instalarse manualmente. En CI se instala con `apt`/`brew`/`choco`. En `lib.rs` hay *comentada* la lógica de instalación automática (I6).

**Qué falta:** Un botón en Settings que instale streamlink con progreso visible.

#### Implementación

**Paso 1 — Detectar si streamlink está instalado:**
```rust
#[tauri::command]
async fn check_streamlink() -> Result<bool, String> {
    let status = Command::new(&*STREAMLINK_CMD)
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    Ok(status.is_ok())
}
```

**Paso 2 — Comando de instalación con progreso:**
```rust
#[tauri::command]
async fn install_streamlink(app: AppHandle) -> Result<(), String> {
    #[cfg(windows)] {
        // winget install streamlink
        // Emitir eventos de progreso via app.emit("install-progress", 50)
    }
    #[cfg(target_os = "macos")] {
        // brew install streamlink
    }
    #[cfg(target_os = "linux")] {
        // sudo apt install -y streamlink
        // (requiere pkexec o sudo con password)
    }
}
```

**Paso 3 — UI en Settings.jsx:**
```jsx
// Botón "Instalar streamlink" que:
// 1. Llama a check_streamlink()
// 2. Si no está instalado, muestra botón + barra de progreso
// 3. Llama a install_streamlink()
// 4. Escucha eventos de progreso via listen('install-progress', ...)
// 5. Al terminar, estado "Instalado"
```

**Archivos afectados:**
- `src-tauri/src/lib.rs` (2 comandos nuevos)
- `src-tauri/capabilities/default.json` (puede necesitar shell)
- `src/components/Settings.jsx`

**Riesgos:**
- En Linux, `sudo apt` requiere permisos elevados. Podría fallar sin `pkexec`. Considerar alternativa portable (winpty, AppImage de streamlink).
- En macOS, `brew` no siempre está instalado.
- **Alternativa:** Usar binario estático de streamlink descargado de GitHub.

**Estimación:** 4-6 horas

---

### I19 — Keychain para tokens de Twitch (Prioridad media)

**Estado actual:** El token de Twitch se guarda en `localStorage` como texto plano. Cualquier extensión de navegador o proceso que acceda al filesystem de Tauri puede leerlo.

**Qué falta:** Guardar el token en el llavero del sistema (Windows Credential Manager, macOS Keychain, Linux Secret Service).

#### Implementación

**Opción A (más simple) — `tauri-plugin-store`:**
```toml
tauri-plugin-store = "2"
```
Guarda datos cifrados en un archivo propio de Tauri. No es tan seguro como keychain nativo, pero mejor que localStorage.

**Opción B (recomendada) — Custom Rust FFI con keyring nativo:**
```rust
#[cfg(target_os = "windows")]
fn store_token(key: &str, value: &str) -> Result<(), String> {
    // Usar CredWriteW / CredReadW de winapi
}

#[cfg(target_os = "macos")]
fn store_token(key: &str, value: &str) -> Result<(), String> {
    // Usar Security Framework (SecKeychainAddGenericPassword)
}

#[cfg(target_os = "linux")]
fn store_token(key: &str, value: &str) -> Result<(), String> {
    // Usar libsecret-1
}
```

**Opción C — Crates.io `keyring`:**
```toml
keyring = "3"
```
Crate Rust multiplataforma que abstrae los 3 sistemas. Simple.

**Implementación con keyring crate:**
```rust
use keyring::Entry;

const SERVICE: &str = "blinkstream";

fn store_token(account: &str, token: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE, account).map_err(|e| e.to_string())?;
    entry.set_password(token).map_err(|e| e.to_string())
}

fn get_token(account: &str) -> Result<String, String> {
    let entry = Entry::new(SERVICE, account).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}
```

**JS → Rust:**
```rust
#[tauri::command]
async fn store_token_rs(account: String, token: String) -> Result<(), String> {
    store_token(&account, &token)
}

#[tauri::command]
async fn get_token_rs(account: String) -> Result<String, String> {
    get_token(&account)
}
```

**Archivos afectados:**
- `src-tauri/Cargo.toml` (keyring crate)
- `src-tauri/src/lib.rs` (2 comandos)
- `src/hooks/useAuth.js` (sustituir localStorage por comandos Tauri)
- `src/utils/twitch.js` (getStoredToken → get_token_rs)

**Riesgos:**
- `keyring` crate requiere `libsecret-1-dev` en Linux (ya instalado para Tauri en CI). En Windows/macOS va out-of-the-box.
- Migración: usuarios con token en localStorage deben migrarse silenciosamente al keychain la primera vez.

**Estimación:** 5-7 horas

---

### UI7 — React.memo en mensajes de chat (Prioridad baja, esfuerzo bajo)

**Estado actual:** Cada mensaje de chat se renderiza sin memo. En canales con 100+ msg/min, React reconcilia todos los nodos del DOM aunque el contenido no haya cambiado.

**Implementación:**
```jsx
const ChatMessage = memo(function ChatMessage({ msg, ... }) {
  return (
    <MessageContainer>
      <Badges badges={msg.badges} />
      <Username user={msg.user} color={msg.color} />
      <MessageText text={msg.message} />
    </MessageContainer>
  )
})
```

Solo necesita `React.memo` alrededor del componente de cada mensaje. Si cada mensaje tiene un `id` único, se evita re-render innecesario.

**Archivos afectados:**
- `src/components/Chat.jsx` (buscar donde se renderiza cada mensaje individual)

**Estimación:** 1-2 horas

---

### I16 — setTimeout recursivo en polling loops (Prioridad baja)

**Estado actual:** 4 lugares usan `setInterval` para polling:

| Archivo | Línea | Intervalo |
|---------|-------|-----------|
| `HomeScreen.jsx:455` | `setInterval(fetchLiveStatus, 60000)` | 60s |
| `useLiveAlerts.jsx:96` | `setInterval(checkLive, 30000)` | 30s |
| `App.jsx:152` | `setInterval(check, 600000)` | 10min |
| `VideoPlayer.jsx:155` | `setInterval(fetchStreamInfo, 120000)` | 2min |

**Problema:** `setInterval` se acumula si una ejecución tarda más que el intervalo (ej: GQL timeout de 8s + llamada lenta = siguiente tick se suma). `setTimeout` recursivo garantiza que la siguiente ejecución espera a que la anterior termine.

**Implementación:**
```jsx
// En vez de:
const interval = setInterval(fetchLiveStatus, 60000)

// Hacer:
const scheduleNext = () => {
    timerRef.current = setTimeout(async () => {
        await fetchLiveStatus()
        scheduleNext()
    }, 60000)
}
scheduleNext()
```

**Archivos afectados:**
- `src/components/HomeScreen.jsx` (línea 455)
- `src/hooks/useLiveAlerts.jsx` (línea 96)
- `src/App.jsx` (línea 152)
- `src/components/VideoPlayer.jsx` (línea 155)

**Observación:** `useLiveAlerts.jsx` tiene un bug de diseño: mezcla `setTimeout` para el init con `setInterval` para el polling. La refactorización a `setTimeout` recursivo lo arreglaría de paso.

**Estimación:** 2-3 horas

---

## 3. Backlog técnico

### De la v1.0.3 que no se hizo (baja prioridad, opcional)

| ID | Tarea | Archivos | Esfuerzo | Dependencia |
|----|-------|----------|----------|-------------|
| I17 | Crear `rust-toolchain.toml` para pin exacto de Rust | raíz proyecto | 10 min | Ninguna |
| I9  | Reducir features de tokio de `"full"` a las necesarias | `Cargo.toml` | 30 min | I17 (para testear) |
| I8  | Usar `rustls-tls` en lugar de `native-tls` | `Cargo.toml` | 15 min | Ninguna |
| I12 | Añadir `host: true` y `watch.ignored` en vite.config.js | `vite.config.js` | 5 min | Ninguna |
| I11 | Añadir `src-tauri/target/` a `.gitignore` | `.gitignore` | 1 min | Ninguna |
| I13 | Single instance lock sin TOCTOU + limpieza al salir | `lib.rs:17-84` | 1-2 h | Ninguna |
| I14 | Lazy loading de emotes (cargar solo al abrir menú) | `Chat.jsx` | 2-3 h | Ninguna |
| I15 | Cachear emotes por canal | `Chat.jsx` | 1-2 h | I14 |
| I18 | Parser de stderr de streamlink con `--json` | `lib.rs:350-373` | 1 h | Ninguna |
| I6  | Eliminar instalación automática silenciosa de streamlink | `lib.rs:191-233` | 15 min | Ninguna (código comentado) |

### Prioridad recomendada para v1.1.0

| Orden | ID | ¿Por qué ahora? |
|-------|----|-----------------|
| 1 | **I17** | Pin de Rust garantiza builds reproducibles. 10 minutos. |
| 2 | **I9+I8** | Reducir tamaño binario y dependencias. Van juntos. |
| 3 | **I11+I12** | Orden y DX. 6 minutos. |
| 4 | **I16** | Polling robusto. Previene bugs de acumulación. |
| 5 | **UI7** | Rendimiento en canales grandes. |
| 6 | **I6** | Código legacy que hay que limpiar. |
| 7 | **I13** | Seguridad: TOCTOU en lock. |
| 8 | **I14+I15** | Rendimiento de emotes. |
| 9 | **I18** | Robustez del parser. |

---

## 4. Dependencias externas

### Nuevas dependencias Rust

| Crate | Versión | Para |
|-------|---------|------|
| `tauri-plugin-notification` | 2.x | F2 — Notificaciones nativas |
| `tauri-plugin-updater` | 2.x | F6 — Auto-updater |
| `keyring` | 3.x | I19 — Keychain tokens |
| `rustls` + `reqwest/rustls-tls` (en vez de native-tls) | — | I8 — Portabilidad |

### Nuevas dependencias npm

| Paquete | Para |
|---------|------|
| `@tauri-apps/plugin-notification` | F2 — JS bindings |
| `@tauri-apps/plugin-updater` | F6 — JS bindings |
| `@tauri-apps/plugin-store` | I19 (opcional, alternativa A) |

### Capacidades nuevas

```json
// default.json - añadir:
"notification:default": true,
"updater:allow-check": true,
"updater:allow-install": true,
"updater:allow-download": true,
```

---

## 5. Plan de implementación

### Fase 1 — Fundación (día 1-2)

| Orden | ID | Tarea | Depende de |
|-------|-----|-------|------------|
| 1 | I17 | Crear `rust-toolchain.toml` con `1.77.2` | — |
| 2 | I9 | Reducir features de tokio (probar build) | I17 |
| 3 | I8 | Cambiar native-tls → rustls-tls | I17 |
| 4 | I11 | Añadir `.gitignore` para `target/` | — |
| 5 | I12 | Configurar `vite.config.js` | — |
| 6 | I6 | Limpiar código comentado de instalación streamlink | — |

### Fase 2 — Features core (día 2-5)

| Orden | ID | Tarea | Depende de |
|-------|-----|-------|------------|
| 7 | **F6** | Auto-updater (plugin Rust + config + workflow) | — |
| 8 | **F2** | Notificaciones nativas de live | F6 (por si acaso) |
| 9 | **I19** | Keychain para tokens | — |

### Fase 3 — Calidad de vida (día 5-7)

| Orden | ID | Tarea | Depende de |
|-------|-----|-------|------------|
| 10 | **F4** | Instalación streamlink desde UI | — |
| 11 | I16 | setTimeout recursivo en polling loops | — |
| 12 | UI7 | React.memo en chat | — |
| 13 | I13 | Single instance lock (TOCTOU fix) | — |
| 14 | I14+I15 | Lazy loading + caché de emotes | — |
| 15 | I18 | Parser stderr con --json | — |

### Fase 4 — Testeo y release (día 8)

| Orden | Tarea |
|-------|-------|
| 16 | Vigía: auditoría completa del código |
| 17 | Build de prueba en Windows + macOS + Linux |
| 18 | Subir `updater.json` con signatures |
| 19 | Tag v1.1.0 + Release en GitHub |

---

## 6. Estimación de esfuerzo

### Resumen por feature

| Feature | Esfuerzo | Impacto | Riesgo |
|---------|----------|---------|--------|
| **F6 — Auto-updater** | 8-10h | 🔴 Crítico | Alto (CI/CD) |
| **I19 — Keychain** | 5-7h | 🟡 Medio | Medio (cross-platform) |
| **F4 — Streamlink UI** | 4-6h | 🟡 Medio | Medio (permisos sudo) |
| **F2 — Notificaciones** | 3-4h | 🔴 Alto | Bajo |
| **I16 — Polling robusto** | 2-3h | 🟢 Bajo | Bajo |
| **UI7 — Chat memo** | 1-2h | 🟢 Bajo | Bajo |
| **I8+I9+I17** | 1h | 🟢 Bajo | Bajo |
| **I11+I12+I6** | 30min | 🟢 Bajo | Bajo |
| **I13 — TOCTOU lock** | 1-2h | 🟢 Bajo | Medio |
| **I14+I15 — Emotes** | 3-5h | 🟡 Medio | Medio |
| **I18 — Parser --json** | 1h | 🟢 Bajo | Bajo |

### Total estimado

| Categoría | Horas |
|-----------|-------|
| Features core (F2+F6+F4+I19) | 20-27h |
| Backlog técnico (I16+UI7+I17+I9+I8+I11+I12+I6+I13+I14+I15+I18) | 10-16h |
| Auditoría + release | 4-6h |
| **Total** | **34-49h** |

### Mínimo viable (v1.1.0 "core", ~20h)

Si hay que recortar, esto es lo imprescindible:

1. **F6 — Auto-updater** (8-10h) — Sin esto no hay canal de distribución
2. **F2 — Notificaciones nativas** (3-4h) — Bajo esfuerzo, alto impacto
3. **I17+I9+I8** — Fundación técnica (1h)
4. **I16 — Polling robusto** (2-3h) — Previene bugs
5. **I19 — Keychain** (5-7h) — Seguridad

El resto (F4, UI7, I13, I14, I15, I18) se pospone a v1.2.0 si no entra en tiempo.

---

## Archivos previsiblemente modificados

| Archivo | Cambios |
|---------|---------|
| `src-tauri/Cargo.toml` | +tauri-plugin-notification, +tauri-plugin-updater, +keyring, tokio features reducidos, rustls-tls |
| `src-tauri/src/lib.rs` | +register updater, +register notification, +keychain commands, +check_streamlink, +install_streamlink, parser --json, single instance lock fix |
| `src-tauri/tauri.conf.json` | +plugins.updater config, versión 1.1.0 |
| `src-tauri/capabilities/default.json` | +notification, +updater permissions |
| `src/hooks/useLiveAlerts.jsx` | +notificaciones nativas, setTimeout recursivo |
| `src/hooks/useAuth.js` | keychain en vez de localStorage |
| `src/utils/twitch.js` | keychain en vez de localStorage |
| `src/components/Settings.jsx` | +instalación streamlink (progreso) |
| `src/components/Chat.jsx` | +React.memo, lazy loading emotes |
| `src/components/HomeScreen.jsx` | setTimeout recursivo (línea 455) |
| `src/components/VideoPlayer.jsx` | setTimeout recursivo (línea 155) |
| `src/App.jsx` | setTimeout recursivo (línea 152), +check update al iniciar |
| `package.json` | +@tauri-apps/plugin-notification, +@tauri-apps/plugin-updater |
| `.github/workflows/release.yml` | +extraer signatures, +actualizar updater.json |
| `rust-toolchain.toml` | **NUEVO** — pin Rust 1.77.2 |
| `.gitignore` | +src-tauri/target/ |
| `updater.json` | **NUEVO** — endpoint de versiones |
| `vite.config.js` | host:true, watch.ignored |

---

*Plan generado por Walter White / MADH — 8 de Junio, 2026*
*Basado en auditoría de código v1.0.3 y análisis de dependencias*
