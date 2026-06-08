# Plan Estratégico BlinkStream v1.0.3

**Fecha:** 2026-06-08  
**Versión actual:** 1.0.2  
**Versión objetivo:** 1.0.3  
**Estado:** Pendiente de implementación

---

## Resumen Ejecutivo

Auditoría completa del proyecto. **82 hallazgos** clasificados en 4 categorías:

| Categoría | Críticos | Altos | Medios | Bajos | Total |
|-----------|----------|-------|--------|-------|-------|
| 🔴 Bugs/Crashes | 3 | 5 | 3 | 0 | **11** |
| 🖥️ Mejoras UI | 0 | 1 | 1 | 9 | **11** |
| ⚙️ Mejoras Internas | 0 | 1 | 7 | 12 | **20** |
| 🚀 Nuevas Funcionalidades | 0 | 3 | 4 | 3 | **10** |
| **Total** | **3** | **10** | **15** | **24** | **52** |

---

## 🔴 4 — BÚSQUEDA DE BUGS / CRASHES

### B1 — Selector de calidad no funciona (Crítico)
- **Archivo:** `src/components/VideoPlayer.jsx:89`
- **Problema:** `fetchStream` siempre invoca `get_stream_url` con `quality: 'best'` ignorando la calidad seleccionada por el usuario en el `QualitySelector`.
- **Impacto:** El usuario cambia la calidad en la UI pero el stream real no cambia nunca. Funcionalidad completamente rota.
- **Solución:** Pasar la variable `quality` en lugar del string hardcodeado `'best'`:
  ```js
  const url = await invoke('get_stream_url', { channel: ch, quality: quality })
  ```
  Y asegurar que `fetchStream` tenga `quality` en sus dependencias o la reciba como parámetro.

### B2 — Deadlock potencial en `run_streamlink` (Crítico)
- **Archivo:** `src-tauri/src/lib.rs:257-295`
- **Problema:** Los pipes de stdout/stderr se toman antes de `wait_timeout()`, pero se leen DESPUÉS de que el hijo termine. Si streamlink produce suficiente salida para llenar el buffer del pipe (64KB en Unix), el hijo se bloquea intentando escribir. El padre está en `wait_timeout` esperando a que el hijo termine → **deadlock**. El timeout de 10s lo rompe, pero trunca la salida.
- **Impacto:** `get_available_qualities` puede perder datos de stderr. `get_stream_url` puede truncar la URL. En casos extremos, la app se congela 10s.
- **Solución:** Leer los pipes concurrentemente con `std::thread::spawn` o usar `tokio::process::Command`.

### B3 — `devtools: true` en producción (Crítico)
- **Archivo:** `src-tauri/tauri.conf.json:21`
- **Problema:** Las DevTools de Chromium están habilitadas en el build de producción. Cualquier usuario puede hacer clic derecho → Inspeccionar, ver el DOM, leer tokens, modificar estado, inyectar scripts.
- **Impacto:** Riesgo de seguridad severo. Un atacante con acceso a la máquina puede extraer tokens de Twitch, modificar el comportamiento de la app, etc.
- **Solución:** Cambiar a `"devtools": false`.

### B4 — Re-fetch huérfano al cambiar calidad (Alta)
- **Archivo:** `src/components/VideoPlayer.jsx:123`
- **Problema:** El `useEffect` con dependencia `[quality]` dispara `fetchStream` sin cancelar la ejecución anterior. Si el usuario cambia calidad rápidamente, múltiples fetches compiten y gana el último en completarse (no necesariamente el más reciente).
- **Solución:** Añadir flag `cancelled` o `AbortController` para cancelar fetches previos.

### B5 — Error de HLS.js usa `channel` stale (Alta)
- **Archivo:** `src/components/VideoPlayer.jsx:134`
- **Problema:** El handler de `Hls.Events.ERROR` captura `channel` del closure. Si el canal cambia justo cuando ocurre un error fatal, se reconecta al canal antiguo.
- **Solución:** Usar `channelRef.current` en lugar de `channel` directamente.

### B6 — `get_available_qualities` falla silenciosamente (Alta)
- **Archivo:** `src-tauri/src/lib.rs:375-385`
- **Problema:** Si streamlink falla o no produce "Available streams:" en stderr, la función retorna una lista de calidades por defecto (`["audio_only", "160p", "360p", "720p60", "1080p60"]`) como si todo estuviera bien. El usuario selecciona 1080p60, `get_stream_url` falla, y el error es confuso.
- **Solución:** Verificar si stderr contiene errores antes de retornar defaults. Si el parsing no encuentra nada y hay errores, propagar el error real.

### B7 — DMG name hardcodeado a 1.0.2 en CI (Alta)
- **Archivo:** `.github/workflows/release.yml:104`
- **Problema:** El nombre del DMG tiene `1.0.2` hardcodeado. Al hacer release 1.0.3, el DMG se llamará incorrectamente.
- **Solución:** Leer la versión desde `tauri.conf.json` con `jq`:
  ```bash
  VERSION=$(jq -r '.version' src-tauri/tauri.conf.json)
  DMG_NAME="BlinkStream_${VERSION}_..."
  ```

### B8 — Favicon roto en producción (Alta)
- **Archivo:** `index.html:12`
- **Problema:** El href `/src/assets/logo.png` no existe en `dist/` porque Vite procesa y renombra los assets de `src/assets/`.
- **Solución:** Mover `logo.png` a `public/favicon.png` y referenciarlo como `/favicon.png`.

### B9 — Catch vacío en `fetchQualities` (Alta)
- **Archivo:** `src/components/VideoPlayer.jsx:112`
- **Problema:** `catch {}` completamente vacío. Si el backend falla al obtener calidades, el error se traga y `setAvailableQualities([])` oculta el selector de calidad sin avisar al usuario.
- **Solución:** Añadir `console.warn` y propagar información de error a la UI.

### B10 — Timeout de 10s insuficiente en `run_streamlink` (Media)
- **Archivo:** `src-tauri/src/lib.rs:261`
- **Problema:** 10 segundos no son suficientes para que streamlink resuelva DNS, conecte a Twitch y obtenga el manifest en redes lentas o con VPN.
- **Solución:** Aumentar a 30-60 segundos.

### B11 — `localStorage` sin try/catch en App.jsx (Media)
- **Archivo:** `src/App.jsx:110`
- **Problema:** La inicialización de estado `useState(() => !localStorage.getItem('blinkstream_onboarded'))` no tiene try/catch. Si localStorage está corrupto o no disponible, la app crashea al iniciar.
- **Solución:** Envolver en try/catch como en el resto del código.

---

## 🖥️ 1 — MEJORAS DE INTERFAZ

| # | Mejora | Archivo | Esfuerzo | Prioridad |
|---|--------|---------|----------|-----------|
| UI1 | Mensajes de error informativos en lugar de "No se pudo cargar ¿Está online?" | `VideoPlayer.jsx:99` | Bajo | Alta |
| UI2 | Spinner de carga en ChannelSearch mientras busca | `ChannelSearch.jsx` | Bajo | Media |
| UI3 | `role="log"` + `aria-live="polite"` en el chat para lectores de pantalla | `Chat.jsx:1078` | Bajo | Media |
| UI4 | `aria-label` y `title` en el elemento `<video>` | `VideoPlayer.jsx:234` | Bajo | Media |
| UI5 | `aria-label` en botones icon-only (cerrar, eliminar fav, emotes) | Múltiples | Bajo | Baja |
| UI6 | Toggle "Chat a la derecha" no tiene efecto real en el layout | `Settings.jsx` → `App.jsx` | Bajo | Media |
| UI7 | Virtualización o `React.memo` en mensajes del chat para rendimiento | `Chat.jsx:1088` | Medio | Media |
| UI8 | Barra de progreso muestra tiempo desde que se abrió la app (sin sentido) | `VideoPlayer.jsx:345` | Bajo | Baja |
| UI9 | i18n: 50+ strings hardcodeados en español, el selector de idioma no funciona | `utils/i18n.js` + todos | Alto | Baja (v1.2) |
| UI10 | Tamaño mínimo de ventana ausente | `tauri.conf.json` | Bajo | Media |
| UI11 | Feedback visual de grabación (tiempo transcurrido) | `VideoPlayer.jsx` | Bajo | Baja |

### UI1 — Detalle de implementación
**Estado actual:** El error "No se pudo cargar ${ch}. ¿Está online?" es genérico y no ayuda al usuario a diagnosticar el problema.

**Propuesta:**
```js
catch (e) {
  const msg = typeof e === 'string' ? e : e?.message || e?.toString() || 'Error desconocido'
  setError(`No se pudo cargar ${ch}: ${msg}`)
}
```
También añadir un botón "Ver detalles" que muestre el error completo en un tooltip.

---

## ⚙️ 2 — MEJORAS INTERNAS

### Prioridad Alta

| # | Mejora | Archivo | Esfuerzo |
|---|--------|---------|----------|
| I19 | Almacenar token de Twitch en keychain del SO en lugar de localStorage | `useAuth.js` | Alto |

### Prioridad Media

| # | Mejora | Archivo | Esfuerzo |
|---|--------|---------|----------|
| I3 | Restringir capabilities: `fs:allow-write` con scope, eliminar `shell:default` y `process:default` | `capabilities/default.json` | Medio |
| I4 | Validar `output_path` en grabaciones (path traversal) | `lib.rs:301` | Medio |
| I13 | Single instance lock: TOCTOU race condition + limpieza al salir | `lib.rs:17-84` | Medio |
| I14 | Lazy loading de emotes (8 peticiones aunque no se abra el menú) | `Chat.jsx:465` | Medio |
| I15 | Cachear emotes por canal para evitar refetch | `Chat.jsx` | Medio |
| I18 | Parser de stderr de streamlink más robusto (usar `--json`) | `lib.rs:350-373` | Medio |

### Prioridad Baja

| # | Mejora | Archivo | Esfuerzo |
|---|--------|---------|----------|
| I1 | Sincronizar versión de `package.json` (0.2.0 → 1.0.3) | `package.json` | Bajo |
| I2 | Eliminar dependencias muertas: `@supabase/supabase-js`, `@tauri-apps/plugin-http` | `package.json` | Bajo |
| I5 | Activar logging en producción (nivel Warn) | `lib.rs:599-605` | Bajo |
| I6 | Eliminar instalación automática y silenciosa de streamlink (winget/brew) | `lib.rs:191-233` | Bajo |
| I7 | Añadir timeouts HTTP a todos los `reqwest::Client` | `lib.rs:390,454,500` | Bajo |
| I8 | Usar `rustls-tls` en lugar de `native-tls` para reqwest | `Cargo.toml:31` | Bajo |
| I9 | Reducir features de tokio de `"full"` a las necesarias | `Cargo.toml:33` | Bajo |
| I10 | Mover `libc` a dependencia condicional solo Unix | `Cargo.toml:34` | Bajo |
| I11 | Añadir `src-tauri/target/` a `.gitignore` | `.gitignore` | Bajo |
| I12 | Añadir `host: true` y `watch.ignored` en vite.config.js | `vite.config.js` | Bajo |
| I16 | Reemplazar `setInterval` por `setTimeout` recursivo en polling loops | `HomeScreen.jsx:455`, `VideoPlayer.jsx:118` | Bajo |
| I17 | Crear `rust-toolchain.toml` para pin exacto de Rust | raíz proyecto | Bajo |
| I20 | Eliminar `@types/react` y `@types/react-dom` o añadir `typescript` | `package.json` | Bajo |

---

## 🚀 3 — NUEVAS FUNCIONALIDADES

| # | Funcionalidad | Esfuerzo | Prioridad | Dependencias |
|---|---------------|----------|-----------|--------------|
| F1 | Multiventana (pop-out player: video en ventana separada) | Alto | Baja (v1.2) | Tauri multiventana |
| F2 | Notificaciones de live cuando un favorito se conecta | Medio | Alta (v1.1) | `tauri-plugin-notification` |
| F3 | Tema claro/oscuro | Medio | Media (v1.2) | Variables CSS + persistencia |
| F4 | Instalación de streamlink desde la UI con progreso | Medio | Media (v1.1) | Botón en Settings |
| F5 | Búsqueda de canales: resultados en vivo primero | Bajo | Alta | Solo lógica |
| F6 | Auto-updater (actualización automática) | Alto | Alta (v1.1) | `tauri-plugin-updater` |
| F7 | Marcadores en VODs (guardar timestamp) | Medio | Baja (v1.2) | Storage local |
| F8 | Historial de chat persistente | Bajo | Baja (v1.2) | localStorage |
| F9 | Soporte de paneles de Twitch (extensiones) | Alto | Baja (v2.0) | API Twitch Extensions |
| F10 | Mejorar flujo de auth y sincronización cloud de favoritos | Medio | Media (v1.1) | Supabase |

### F5 — Búsqueda: lives primero
**Implementación:** En `utils/twitch.js`, función `searchChannels`, ordenar resultados moviendo los canales con `isLive: true` al inicio del array.

### F2 — Notificaciones de live
**Implementación:**
1. Añadir `tauri-plugin-notification` al proyecto
2. En `HomeScreen.jsx`, en el polling de `fetchLiveStatus`, detectar transiciones offline→online
3. Disparar `Notification.send({ title: `${channel} está en vivo!`, body: game, icon: avatar })`

### F6 — Auto-updater
**Implementación:**
1. Añadir `tauri-plugin-updater` al proyecto
2. Configurar endpoints en `tauri.conf.json` apuntando a las releases de GitHub
3. La app verificará actualizaciones al iniciar y notificará al usuario

---

## 🚨 PRIORIZACIÓN PARA v1.0.3

### Imprescindibles (v1.0.3 blocker)

| Orden | ID | Descripción | Esfuerzo estimado |
|-------|-----|-------------|-------------------|
| 1 | B1 | Arreglar selector de calidad | 15 min |
| 2 | B3 | Deshabilitar devtools en producción | 1 min |
| 3 | I1 | Sincronizar versión package.json → 1.0.3 | 1 min |
| 4 | B7 | DMG name dinámico en CI | 15 min |
| 5 | B8 | Mover favicon a public/ | 5 min |
| 6 | I2 | Eliminar dependencias muertas | 5 min |
| 7 | UI1 | Mensajes de error con información real | 15 min |
| 8 | I10 | libc condicional | 5 min |
| 9 | UI6 | Arreglar toggle Chat a la derecha | 15 min |

### Importantes (v1.0.3 recommended)

| Orden | ID | Descripción | Esfuerzo estimado |
|-------|-----|-------------|-------------------|
| 10 | B2 | Deadlock pipes en run_streamlink | 2-3 h |
| 11 | B6 | get_available_qualities sin fallback silencioso | 30 min |
| 12 | I7 | Timeouts HTTP en reqwest clients | 15 min |
| 13 | I5 | Logging en producción | 5 min |
| 14 | I4 | Validar output_path en grabaciones | 15 min |
| 15 | I3 | Restringir capabilities de seguridad | 30 min |
| 16 | B9 | Catch vacío en fetchQualities | 5 min |

### Features rápidas (si sobra tiempo)

| 17 | F5 | Búsqueda: lives primero | 10 min |
| 18 | UI2 | Spinner en ChannelSearch | 10 min |
| 19 | UI7 | React.memo en mensajes de chat | 30 min |

### Pospuesto a v1.1.0 / v1.2.0

- UI9 — i18n completo
- F2 — Notificaciones de live
- F6 — Auto-updater
- I19 — Keychain para tokens
- F1 — Pop-out player
- F3 — Tema claro/oscuro

---

## Notas Técnicas Adicionales

### Sobre el deadlock de pipes (B2)

Actualmente `run_streamlink` hace:
1. `child.stdout.take()` — toma el pipe
2. `child.stderr.take()` — toma el pipe
3. `child.wait_timeout(10s)` — espera al hijo
4. `handle.read_to_string(&mut buf)` — lee el pipe DESPUÉS de que el hijo terminó

Si streamlink produce mucha salida (ej. stderr con debug), el buffer del pipe se llena, el hijo se bloquea al escribir, nunca termina, el timeout de 10s lo mata, y los datos se pierden.

**Solución recomendada:**
```rust
use std::thread;

let stdout_handle = child.stdout.take();
let stderr_handle = child.stderr.take();

let stdout_thread = thread::spawn(move || -> String {
    let mut buf = String::new();
    if let Some(mut handle) = stdout_handle {
        let _ = handle.read_to_string(&mut buf);
    }
    buf
});

let stderr_thread = thread::spawn(move || -> String {
    let mut buf = String::new();
    if let Some(mut handle) = stderr_handle {
        let _ = handle.read_to_string(&mut buf);
    }
    buf
});

let _status = child.wait_timeout(Duration::from_secs(60))?;
let stdout = stdout_thread.join().map_err(|_| "Error leyendo stdout")?;
let stderr = stderr_thread.join().map_err(|_| "Error leyendo stderr")?;
```

### Sobre las capabilities de seguridad (I3)

**Estado actual:**
```json
{
  "permissions": [
    "core:default",
    "fs:default",
    "fs:allow-write",
    "fs:allow-write-text-file",
    "shell:default",
    "process:default",
    "dialog:default",
    "opener:default"
  ]
}
```

**Propuesta:**
```json
{
  "permissions": [
    "core:default",
    "dialog:default",
    "opener:default",
    {
      "identifier": "fs:allow-write",
      "scope": {
        "allow": ["$DESKTOP/**", "$DOCUMENTS/**", "$DOWNLOAD/**"]
      }
    },
    {
      "identifier": "fs:allow-write-text-file",
      "scope": {
        "allow": ["$DESKTOP/**", "$DOCUMENTS/**", "$DOWNLOAD/**"]
      }
    }
  ]
}
```

No se necesita `shell:default` ni `process:default` porque la comunicación con streamlink se hace desde Rust, no desde el frontend.

---

## Historial de Cambios

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | — | Release inicial |
| 1.0.1 | — | Fix cross-platform CI/CD, macOS Gatekeeper bypass |
| 1.0.2 | 2026-06-08 | DMG signing fix, Rust fallback para CORS, mini tutorial macOS |
| **1.0.3** | **Planificado** | **Ver secciones anteriores** |
