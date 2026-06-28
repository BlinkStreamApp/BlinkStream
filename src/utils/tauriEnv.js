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
