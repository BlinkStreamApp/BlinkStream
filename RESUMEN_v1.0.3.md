# v1.0.3 — Resumen completo de implementación

> Fecha: 8 de Junio, 2026
> Proyecto: BlinkStream — Visor de Twitch de escritorio (Tauri v2 + React + hls.js)

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Bugs corregidos (B)](#2-bugs-corregidos-b)
3. [Mejoras internas (I)](#3-mejoras-internas-i)
4. [Mejoras UI/UX (UI)](#4-mejoras-uiux-ui)
5. [Features (F)](#5-features-f)
6. [Parches post-build](#6-parches-post-build)
7. [Problemas conocidos](#7-problemas-conocidos)
8. [Arquitectura de calidad](#8-arquitectura-de-calidad)
9. [Cambios técnicos relevantes](#9-cambios-técnicos-relevantes)

---

## 1. Resumen ejecutivo

**v1.0.3** es una release de mantenimiento y estabilidad que aborda **22 hallazgos** del plan de auditoría (`PLAN_v1.0.3.md`). Los objetivos principales eran:

- **Estabilidad del reproductor**: Deadlock en pipes de streamlink, timeouts HTTP, logging
- **Seguridad**: Capabilities restringidas, devtools desactivado
- **UX**: Selector de calidad funcional, mensajes de error informativos, modo compacto, chat a la derecha
- **Calidad de código**: Versiones sincronizadas, dependencias limpias, sin fallos silenciosos

**Agentes involucrados**: Walter White (dirección), Hermes (vault/config), Jesse (Rust/Python), Takamura (JS/React), Vigía (QA/auditoría), Kernel (revisor Tauri)

---

## 2. Bugs corregidos (B)

### B1 — Selector de calidad funcional
- **Antes**: `fetchStream` usaba `quality` hardcodeado como `'best'` en la petición a streamlink, ignorando la selección del usuario
- **Después**: Dependencia `[quality]` añadida al `useCallback`. La variable `quality` real se pasa a `invoke('get_stream_url', ...)`. Efecto duplicado de `[quality]` eliminado
- **Archivo**: `src/components/VideoPlayer.jsx`

### B2 — Deadlock pipes en run_streamlink
- **Antes**: stdout/stderr se leían SECUENCIALMENTE tras `wait_timeout`. Si streamlink producía mucha salida (ej: video), el buffer del pipe (64KB) se llenaba y streamlink se bloqueaba al escribir → deadlock
- **Después**: Pipes leídos en **hilos concurrentes** (`std::thread::spawn`) MIENTRAS el proceso hijo se ejecuta. Timeout subido de 10s a 60s. Thread leak corregido (join en ambas ramas)
- **Archivo**: `src-tauri/src/lib.rs`, función `run_streamlink()`

### B3 — Devtools desactivado en producción
- `tauri.conf.json` → `"devtools": false`

### B6 — get_available_qualities sin fallos silenciosos (revisado)
- **Antes (v1.0.2)**: Si streamlink devolvía error, se devolvían calidades por defecto silenciosamente
- **v1.0.3 inicial**: Se añadió validación de stderr (error/not found → Err)
- **v1.0.3 final**: Se cambió a función **infalible**: siempre devuelve `Vec<String>`, nunca `Result`. Si streamlink falla o el parsing da vacío, devuelve 7 calidades por defecto. Si stderr indica error real, se logea pero se devuelven defaults
- **Archivo**: `src-tauri/src/lib.rs`, función `get_available_qualities()`

### B7 — DMG name dinámico
- **Antes**: Nombre del DMG hardcodeado en `release.yml`
- **Después**: Se lee la versión con `jq -r '.version' src-tauri/tauri.conf.json`
- **Archivo**: `.github/workflows/release.yml`

### B8 — Favicon arreglado
- `index.html` ahora apunta a `/favicon.svg` (existente en `public/`), no a `/src/assets/logo.png`

### B9 — Catch vacío en fetchQualities
- **Antes**: El catch de `fetchQualities` estaba vacío
- **Después**: `console.warn('Error fetching qualities:', e)`

---

## 3. Mejoras internas (I)

### I1 — Versiones sincronizadas
- `tauri.conf.json`, `Cargo.toml`, `package.json` todos en `1.0.3`

### I2 — Dependencias muertas eliminadas
- `pnpm remove @supabase/supabase-js @tauri-apps/plugin-http`

### I3 — Capabilities restringidas
- **Antes**: `shell:default`, `process:default`, `fs:default` — acceso total
- **Después**: Solo `fs:allow-write` y `fs:allow-write-text-file` con scope acotado a `$DESKTOP/**`, `$DOCUMENTS/**`, `$DOWNLOAD/**`. Sin shell ni process
- **Archivo**: `src-tauri/capabilities/default.json`

### I4 — Validar output_path en grabaciones
- Se verifica que la ruta sea absoluta y el directorio padre exista antes de iniciar grabación
- **Archivo**: `src-tauri/src/lib.rs`, función `start_recording()`

### I5 — Logging en producción activo
- `tauri_plugin_log` configurado con nivel `Info` en debug, `Warn` en release
- **Archivo**: `src-tauri/src/lib.rs`, función `run()`

### I7 — Timeouts HTTP
- Los 3 clientes `reqwest::Client` ahora tienen `.timeout(Duration::from_secs(30))` y `.connect_timeout(Duration::from_secs(10))`

### I10 — libc condicional
- Movido a `[target.'cfg(not(windows))'.dependencies]` para no compilar en Windows

---

## 4. Mejoras UI/UX (UI)

### UI1 — Mensajes de error informativos
- **Antes**: `setError(\`No se pudo cargar ${ch}: ¿Está online?\`)` — mensaje genérico
- **Después**: Captura el mensaje real del backend: `e?.message || e?.toString() || 'Error desconocido'`

### UI2 — Spinner en ChannelSearch
- Nuevo estado `searching`. Muestra un spinner `animate-spin` mientras se realiza la búsqueda
- **Archivo**: `src/components/ChannelSearch.jsx`

### UI6 — Toggle Chat a la derecha funcional
- Nuevo estado `chatOnRight` en `App.jsx` leído de localStorage
- Aplica `flex-row-reverse` condicional. `border-l`/`border-r` según posición
- **Archivos**: `src/App.jsx`

---

## 5. Features (F)

### F5 — Búsqueda: lives primero
- Resultados de `searchChannels` ordenados con `.sort()` para que canales en vivo aparezcan primero
- **Archivo**: `src/utils/twitch.js`

---

## 6. Parches post-build

Durante las pruebas del build compilado, se detectaron y corrigieron estos problemas adicionales:

### 6.1 — QualitySelector desaparecía en build (CRÍTICO)
- **Síntoma**: En dev se veía, en build no. Mostraba "..." y luego desaparecía
- **Causa raíz**: `get_available_qualities` devolvía `Err` por:
  1. Streamlink sin `--stream-url` se colgaba intentando reproducir (60s timeout)
  2. B6 convertía el error silencioso en error explícito
- **Solución triple**:
  1. Rust: `--stream-url` añadido a la llamada → streamlink sale al instante
  2. Rust: `get_available_qualities` ahora devuelve `Vec<String>` (nunca `Result`) → infalible
  3. JS: `setAvailableQualities(FALLBACK_QUALITIES)` como último recurso (7 calidades hardcodeadas)

### 6.2 — Pantalla negra con calidades no estándar (936p60)
- **Síntoma**: Al seleccionar 936p60, pantalla negra. Había que bajar manualmente a 720p
- **Causa**: Ciertas variantes de Twitch (936p60, etc.) tienen codecs/perfiles que el navegador no decodifica correctamente
- **Solución**: **Auto-fallback de 8 segundos**. Tras cargar el stream, se inicia un timer. Si `video.readyState < 2` (HAVE_CURRENT_DATA) a los 8s, se fuerza cambio a `'best'` automáticamente
- **Archivo**: `src/components/VideoPlayer.jsx`

### 6.3 — Modo compacto no funcionaba
- **Síntoma**: El toggle en PlayerSettingsPanel no aplicaba cambios visuales
- **Causa**: Estado `compact` duplicado entre `App.jsx` (controla clase CSS) y `VideoPlayer.jsx` (controla el toggle). El toggle solo actualizaba el estado local de VideoPlayer, nunca llegaba a App
- **Solución**: `compact` y `onToggleCompact` viajan como **props** desde App. Eliminado `useState` duplicado en VideoPlayer

### 6.4 — toggleAudioOnly con side effects en updater de estado
- **Problema**: Llamaba a `fetchStream` y `onQualityChange` DENTRO del callback de `setAudioOnly`, violando el principio de React de que los updaters deben ser funciones puras
- **Solución**: Side effects separados del updater. Se lee `audioOnly` directamente y se llama a `setAudioOnly(next)` después de los efectos
- **Archivo**: `src/components/VideoPlayer.jsx`

### 6.5 — get_master_playlist no registrado en generate_handler!
- **Problema (detectado por Vigía)**: El nuevo comando `get_master_playlist` no estaba en `generate_handler!` por lo que todas las llamadas desde JS fallaban con "command not found"
- **Solución**: Añadido a `generate_handler!`. El comando NO se usa actualmente (se prefiere `get_stream_url` con auto-fallback), pero queda disponible para futuras implementaciones
- **Archivo**: `src-tauri/src/lib.rs`

---

## 7. Problemas conocidos

| # | Problema | Estado | Notas |
|---|---------|--------|-------|
| 1 | hls.js no puede cambiar calidad sin recargar stream | Aceptado | Se recarga vía streamlink en cada cambio. Tarda ~1-2s |
| 2 | Auto-fallback 8s puede ser lento en conexiones lentas | Aceptado | En redes lentas, `readyState < 2` a los 8s es normal aunque la calidad funcione |
| 3 | Sin auto-updater todavía | Pendiente v1.1 | Planificado como F6 |
| 4 | Sin modo claro/oscuro | Pendiente v1.2 | Planificado como F3 |
| 5 | Sin notificaciones de live | Pendiente v1.1 | Planificado como F2 |
| 6 | Sin instalación de streamlink desde la UI | Pendiente v1.1 | Planificado como F4 |

---

## 8. Arquitectura de calidad

### Flujo de fetchStream (v1.0.3 final)

```
Usuario selecciona calidad
  → onQualityChange(newQuality) [persiste en localStorage]
  → fetchStream(channel, newQuality)
    → invoke('get_stream_url', { channel, quality: targetQuality })
      → streamlink twitch.tv/CHANNEL QUALITY --stream-url
      → URL devuelta en stdout
    → setStreamUrl(url)
    → hls.js effect se ejecuta
      → destroy hls anterior
      → new Hls() + loadSource(url) + attachMedia(video)
      → MANIFEST_PARSED: video.play()
      → Timer 8s: si readyState < 2, auto-fallback a 'best'
```

### Flujo de fetchQualities (v1.0.3 final)

```
Componente monta
  → invoke('get_available_qualities', { channel })
    → streamlink twitch.tv/CHANNEL --stream-url
    → stderr parseado: líneas con "Available streams:"
    → calidades extraídas
    → SIEMPRE devuelve array (nunca error)
  → Si array con items: setAvailableQualities(items)
  → Si array vacío o error: setAvailableQualities(FALLBACK_QUALITIES)
```

### Capas de tolerancia a fallos (QualitySelector)

```
1. Rust: get_available_qualities → Vec<String> (nunca Result)
   ├── streamlink funciona → calidades reales
   ├── streamlink falla → 7 defaults
   └── parsing vacío → 7 defaults

2. JS: fetchQualities
   ├── invoke OK + array con items → calidades reales
   ├── invoke OK + array vacío → FALLBACK_QUALITIES
   └── invoke error (catch) → FALLBACK_QUALITIES

3. JS: Render
   ├── availableQualities === null → "..." (loading)
   ├── availableQualities.length > 0 → QualitySelector
   └── availableQualities.length === 0 → null (no renderiza)
```

---

## 9. Cambios técnicos relevantes

### Rust (`src-tauri/src/lib.rs`)

| Cambio | Líneas | Descripción |
|--------|--------|-------------|
| `run_streamlink` | 238-308 | Pipes en hilos paralelos. Timeout 60s. Sin thread leak |
| `start_recording` | 312-341 | Validación de ruta absoluta y directorio padre |
| `get_stream_url` | 356-365 | Sin cambios funcionales |
| `get_master_playlist` | 370-409 | NUEVO. Convierte URL variante → master. NO usado actualmente |
| `get_available_qualities` | 415-462 | Infalible. Siempre Vec<String>. --stream-url añadido |
| `get_direct_stream_url` | 464-472 | Sin cambios |
| `generate_handler!` | 667-676 | + get_master_playlist |
| Timeouts HTTP | 3 clients | 30s read + 10s connect |
| libc | Cargo.toml | Condicional: solo Unix |

### JavaScript (`src/components/VideoPlayer.jsx`)

| Cambio | Líneas | Descripción |
|--------|--------|-------------|
| `fetchStream` | 84-117 | `[quality]` dep. 3 intentos: targetQuality → best → error |
| `handleQualityChange` | 139-143 | NUEVO. Recarga con nueva calidad |
| `fetchQualities` | 126-137 | Infalible. FALLBACK_QUALITIES de respaldo |
| hls effect | 157-216 | Auto-fallback 8s. Error handler simple |
| `toggleAudioOnly` | 223-235 | Side effects fuera del updater de estado |
| `audioOnlyRef` | 72-73 | Para reconexión 25min en modo audio |
| `fallbackTimersRef` | 54 | Timer de auto-fallback |
| Compact mode | Props | compact/onToggleCompact desde App |

### CSS y Config

| Archivo | Cambio |
|---------|--------|
| `src/index.css` | Variables CSS de tema oscuro (sin cambios) |
| `tauri.conf.json` | devtools: false, versión 1.0.3 |
| `capabilities/default.json` | Sin shell/process. fs scope restrictivo |
| `.github/workflows/release.yml` | DMG name dinámico |

---

*Documento generado por Walter White / MADH*
*Agentes: Hermes (vault), Jesse (Rust), Takamura (JS), Vigía (QA), Kernel (revisor)*
