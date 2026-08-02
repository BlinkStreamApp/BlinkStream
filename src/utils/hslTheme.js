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
]

export const DEFAULT_HSL = { h: 264, s: 100, l: 64, id: 'twitch' }

const STORAGE_KEY = 'blinkstream_custom_hsl'

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
