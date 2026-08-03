/**
 * storage.js — Módulo centralizado y resistente a excepciones para acceso a localStorage.
 * Encapsula comprobaciones de cuota, modo privado, serialización JSON segura y valores por defecto en BlinkStream.
 */

export const STORAGE_KEYS = {
  VOLUME: 'blinkstream_volume',
  LANG: 'blinkstream_lang',
  THEME_MODE: 'blinkstream_theme_mode',
  HSL_PALETTE: 'blinkstream_hsl_palette',
  HSL_THEME: 'blinkstream_hsl_theme',
  ANTISPAM: 'blinkstream_antispam',
  CHAT_ON_RIGHT: 'blinkstream_chat_right',
  CHAT_FONT_SIZE: 'blinkstream_chat_font_size',
  TWITCH_TOKEN: 'blinkstream_twitch_token',
  TWITCH_USERNAME: 'blinkstream_twitch_username',
  STREAM_QUALITY: 'blinkstream_quality',
  OVERLAY_CHAT: 'blinkstream_overlay_chat',
  OVERLAY_OPACITY: 'blinkstream_overlay_opacity',
  FAVORITE_CHANNELS: 'blinkstream_favorites',
}

/**
 * Obtiene un valor de string de localStorage de forma segura frente a excepciones (p.ej., WebView privada).
 * @param {string} key - Clave del almacenamiento
 * @param {string} [defaultValue=''] - Valor devuelto si no existe o falla
 * @returns {string}
 */
export function getItem(key, defaultValue = '') {
  try {
    const item = localStorage.getItem(key)
    return item !== null && item !== undefined ? item : defaultValue
  } catch {
    return defaultValue
  }
}

/**
 * Almacena un string en localStorage salvaguardando errores de cuota agotada o modo privado.
 * @param {string} key
 * @param {string|number|boolean} value
 * @returns {boolean} True si se completó con éxito
 */
export function setItem(key, value) {
  try {
    localStorage.setItem(key, String(value))
    return true
  } catch (e) {
    console.warn('[Storage] Error guardando clave:', key, e)
    return false
  }
}

/**
 * Elimina una clave de localStorage con protección de excepciones.
 * @param {string} key
 * @returns {boolean}
 */
export function removeItem(key) {
  try {
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

/**
 * Obtiene y deserializa con seguridad un objeto JSON guardado en localStorage.
 * @param {string} key
 * @param {any} defaultValue
 * @returns {any}
 */
export function getJSON(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key)
    if (!item) return defaultValue
    return JSON.parse(item)
  } catch {
    return defaultValue
  }
}

/**
 * Serializa y guarda en localStorage un objeto en formato JSON de forma segura.
 * @param {string} key
 * @param {any} value
 * @returns {boolean}
 */
export function setJSON(key, value) {
  try {
    const serialized = JSON.stringify(value)
    localStorage.setItem(key, serialized)
    return true
  } catch (e) {
    console.warn('[Storage] Error al serializar y guardar JSON en clave:', key, e)
    return false
  }
}

/**
 * Limpia masivamente un conjunto de claves relacionadas sin afectar a otras.
 * @param {string[]} keys
 */
export function removeItems(keys = []) {
  for (const k of keys) {
    removeItem(k)
  }
}
