/**
 * @file hslTheme.js
 * Utilidad de alto rendimiento para aplicar temas HSL en tiempo real al DOM de BlinkStream.
 * Permite cambiar el color de acento, bordes de neón y barras al milisegundo sin recargas.
 */

export const HSL_PRESETS = [
  { id: 'twitch', name: 'Twitch Clásico', h: 264, s: 100, l: 64, color: '#9146ff' },
  { id: 'cyberpunk', name: 'Cyberpunk Neon', h: 322, s: 85, l: 60, color: '#ec4899' },
  { id: 'matrix', name: 'Matrix Emerald', h: 142, s: 71, l: 45, color: '#10b981' },
  { id: 'nord', name: 'Nord Ice', h: 217, s: 91, l: 60, color: '#3b82f6' },
  { id: 'sunset', name: 'Sunset Overdrive', h: 24, s: 95, l: 53, color: '#f97316' },
  { id: 'midnight', name: 'Midnight Prestige', h: 45, s: 93, l: 54, color: '#f59e0b' },
  { id: 'obsidian', name: 'Obsidian Crimson', h: 349, s: 86, l: 50, color: '#e11d48' },
  { id: 'vaporwave', name: 'Miami Vaporwave', h: 189, s: 94, l: 43, color: '#06b6d4' },
  { id: 'sakura', name: 'Sakura Blossom', h: 328, s: 85, l: 70, color: '#f472b6' },
  { id: 'amethyst', name: 'Deep Amethyst', h: 262, s: 83, l: 58, color: '#7c3aed' },
  { id: 'radioactive', name: 'Radioactive Acid', h: 84, s: 81, l: 44, color: '#84cc16' },
  { id: 'slate', name: 'Platinum Cyber', h: 215, s: 16, l: 65, color: '#94a3b8' },
]

export const FONT_PRESETS = [
  { id: 'inter', name: 'Inter (Modern UI)', family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", preview: "Aa Bb Cc — Moderno & Limpio" },
  { id: 'outfit', name: 'Outfit (Futurista)', family: "'Outfit', 'Montserrat', 'Segoe UI', sans-serif", preview: "Aa Bb Cc — Futurista & Geométrico" },
  { id: 'monospace', name: 'Cyber Monospaced', family: "'Fira Code', 'JetBrains Mono', 'Consolas', monospace", preview: "const theme = 'cyber';" },
  { id: 'cozy', name: 'Cozy Quicksand', family: "'Nunito', 'Quicksand', 'Segoe UI', sans-serif", preview: "Aa Bb Cc — Suave & Redondeado" },
  { id: 'twitch', name: 'Twitch Classic', family: "'Roobert', 'Helvetica Neue', Arial, sans-serif", preview: "Aa Bb Cc — Clásica Twitch" },
]

export const DEFAULT_HSL = { h: 264, s: 100, l: 64, id: 'twitch' }
export const DEFAULT_FONT = FONT_PRESETS[0]

export const ICON_STYLES = [
  { id: 'duotone', name: 'Duotone Neon', weight: 'duotone', desc: 'Doble capa con brillo neón temático' },
  { id: 'regular', name: 'Regular Clean', weight: 'regular', desc: 'Línea clásica equilibrada y nítida' },
  { id: 'bold', name: 'Cyberpunk Bold', weight: 'bold', desc: 'Línea gruesa de alto contraste' },
  { id: 'light', name: 'Minimalist Light', weight: 'light', desc: 'Línea ultrafino elegante' },
]
export const DEFAULT_ICON_STYLE = ICON_STYLES[0]

const STORAGE_KEY = 'blinkstream_custom_hsl'
const FONT_STORAGE_KEY = 'blinkstream_custom_font'
const ICON_STORAGE_KEY = 'blinkstream_icon_style'

let currentIconWeight = DEFAULT_ICON_STYLE.weight
const iconSubscribers = new Set()

export function subscribeToIconStyle(cb) {
  iconSubscribers.add(cb)
  return () => iconSubscribers.delete(cb)
}

export function getIconWeight() {
  return currentIconWeight
}

/**
 * Aplica en caliente las variables CSS HSL sobre el elemento raíz del DOM.
 * @param {{ h: number, s: number, l: number, id?: string }} theme
 */
export function applyHslTheme({ h, s, l }) {
  if (typeof document === 'undefined') return

  const root = document.documentElement

  const primary = `hsl(${h}, ${s}%, ${l}%)`
  const dark = `hsl(${h}, ${Math.max(0, s - 10)}%, ${Math.max(10, l - 15)}%)`
  const light = `hsl(${h}, ${Math.min(100, s + 10)}%, ${Math.min(95, l + 15)}%)`

  root.style.setProperty('--color-twitch', primary)
  root.style.setProperty('--color-twitch-dark', dark)
  root.style.setProperty('--color-twitch-light', light)
  root.style.setProperty('--color-accent', light)
}

/**
 * Guarda en localStorage y aplica el tema HSL seleccionado.
 * @param {{ h: number, s: number, l: number, id?: string }} theme
 */
export function saveAndApplyHslTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme))
    if (theme.id && ['purple', 'blue', 'green', 'orange', 'pink', 'red'].includes(theme.id)) {
      localStorage.setItem('blinkstream_accent', theme.id)
    }
  } catch {
    // ignorar en entornos sin localStorage o privados
  }
  applyHslTheme(theme)
}

/**
 * Lee y aplica el tema HSL guardado al iniciar la aplicación.
 * @returns {{ h: number, s: number, l: number, id?: string }}
 */
export function applyStoredHslTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const theme = JSON.parse(stored)
      applyHslTheme(theme)
      return theme
    }
  } catch {
    // ignore
  }
  applyHslTheme(DEFAULT_HSL)
  return DEFAULT_HSL
}

/**
 * Aplica en tiempo real la tipografía seleccionada al DOM.
 * @param {string} fontId
 */
export function applyCustomFont(fontId) {
  if (typeof document === 'undefined') return
  const preset = FONT_PRESETS.find(f => f.id === fontId) || DEFAULT_FONT
  document.documentElement.style.setProperty('--font-primary', preset.family)
  if (document.body) {
    document.body.style.fontFamily = preset.family
  }
}

/**
 * Guarda y aplica el identificador de fuente seleccionado.
 * @param {string} fontId
 */
export function saveAndApplyCustomFont(fontId) {
  try {
    localStorage.setItem(FONT_STORAGE_KEY, String(fontId))
  } catch {
    // ignorar
  }
  applyCustomFont(fontId)
}

/**
 * Lee desde localStorage y aplica al arrancar la tipografía elegida por el usuario.
 * @returns {string} fontId
 */
export function applyStoredCustomFont() {
  try {
    const stored = localStorage.getItem(FONT_STORAGE_KEY)
    if (stored && FONT_PRESETS.some(f => f.id === stored)) {
      applyCustomFont(stored)
      return stored
    }
  } catch {
    // ignorar
  }
  applyCustomFont(DEFAULT_FONT.id)
  return DEFAULT_FONT.id
}

/**
 * Aplica en caliente y notifica a los suscriptores el estilo del icono.
 * @param {string} styleId
 */
export function applyCustomIconStyle(styleId) {
  const preset = ICON_STYLES.find(s => s.id === styleId) || DEFAULT_ICON_STYLE
  currentIconWeight = preset.weight
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-icon-weight', preset.weight)
  }
  for (const cb of iconSubscribers) cb()
}

/**
 * Guarda y aplica el estilo visual de los iconos de la app.
 * @param {string} styleId
 */
export function saveAndApplyCustomIconStyle(styleId) {
  try {
    localStorage.setItem(ICON_STORAGE_KEY, String(styleId))
  } catch {
    // ignorar
  }
  applyCustomIconStyle(styleId)
}

/**
 * Lee desde localStorage y aplica al arrancar el estilo de icono deseado.
 * @returns {string} styleId
 */
export function applyStoredCustomIconStyle() {
  try {
    const stored = localStorage.getItem(ICON_STORAGE_KEY)
    if (stored && ICON_STYLES.some(s => s.id === stored)) {
      applyCustomIconStyle(stored)
      return stored
    }
  } catch {
    // ignorar
  }
  applyCustomIconStyle(DEFAULT_ICON_STYLE.id)
  return DEFAULT_ICON_STYLE.id
}
