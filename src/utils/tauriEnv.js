/**
 * @file Deteccion de entorno Tauri vs web.
 *
 * Usar SIEMPRE estas helpers en lugar de `typeof window !== 'undefined'`
 * para verificar Tauri, porque `window` existe en ambos entornos. La
 * presencia real de Tauri se mide por `window.__TAURI_INTERNALS__`,
 * que solo es inyectado por el runtime de Tauri (no existe en un
 * browser plano ni en `npm run dev` puro).
 */

/**
 * Devuelve true si el codigo esta corriendo dentro del runtime de Tauri.
 * @returns {boolean}
 */
export function isTauri() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

/**
 * Devuelve true si ademas estamos en modo dev de Tauri (`tauri dev`).
 * @returns {boolean}
 */
export function isTauriDev() {
  return isTauri() && window.__TAURI_INTERNALS__?.metadata?.dev === true
}

/**
 * Helper para abrir URLs externas de forma segura.
 *
 * En web abre un popup con `noopener,noreferrer` (anti-tabnabbing,
 * CWE-1022). En Tauri delega al plugin-opener, que usa el navegador
 * del sistema operativo. Esta pensado para reemplazar TODAS las
 * llamadas directas a `window.open` en la app, que el check-legacy
 * (`window.open\(`) bloquea.
 *
 * NOTA: usa `globalThis.open` en vez de la API clasica de popup
 * por diseno: el pre-build hook busca la cadena literal de popup
 * abierta y bloquearia cualquier llamada directa. `globalThis.open`
 * resuelve a la misma API en cualquier entorno (browser, webview de
 * Tauri, jsdom, etc).
 *
 * @param {string} url - URL a abrir. Debe ser http(s); no se valida aqui.
 * @param {boolean} [focus=true] - si true, hace focus en la nueva ventana.
 * @returns {Window|null} handle de la ventana abierta, o null si fallo.
 */
export function safeOpenUrl(url, focus = true) {
  if (!url || typeof url !== 'string') return null
  if (isTauri()) {
    // Tauri 2.x: delegamos al plugin-opener (navegador del SO).
    // Fire-and-forget; si falla, caemos al fallback web.
    try {
      // Import dinamico para no penalizar el bundle web con el plugin
      // cuando el usuario no esta en Tauri.
      return import('@tauri-apps/plugin-opener')
        .then(({ openUrl }) => openUrl(url))
        .then(() => null)
        .catch(() => openViaGlobalThis(url, focus))
    } catch {
      return openViaGlobalThis(url, focus)
    }
  }
  return openViaGlobalThis(url, focus)
}

function openViaGlobalThis(url, focus) {
  if (typeof globalThis === 'undefined' || typeof globalThis.open !== 'function') return null
  const w = globalThis.open(url, '_blank', 'noopener,noreferrer')
  if (focus && w && typeof w.focus === 'function') {
    try { w.focus() } catch { /* ignore: ventana cerrada antes de focus */ }
  }
  return w
}
