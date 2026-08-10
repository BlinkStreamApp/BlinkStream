

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
  EMOTE_EFFECTS: 'blinkstream_emote_effects',
}

export function getItem(key, defaultValue = '') {
  try {
    const item = localStorage.getItem(key)
    return item !== null && item !== undefined ? item : defaultValue
  } catch {
    return defaultValue
  }
}

export function setItem(key, value) {
  try {
    localStorage.setItem(key, String(value))
    return true
  } catch (e) {
    console.warn('[Storage] Error guardando clave:', key, e)
    return false
  }
}

export function removeItem(key) {
  try {
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function getJSON(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key)
    if (!item) return defaultValue
    return JSON.parse(item)
  } catch {
    return defaultValue
  }
}

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

export function removeItems(keys = []) {
  for (const k of keys) {
    removeItem(k)
  }
}
