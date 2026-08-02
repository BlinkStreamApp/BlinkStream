export function formatViewers(n) {
  if (n == null) return null
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function formatDuration(seconds) {
  if (seconds == null) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Variante de formatDuration que SIEMPRE devuelve HH:MM:SS (rellena con
 * ceros a la izquierda). Pensada para timers de grabacion donde el ancho
 * visual es estable y la columna de horas ayuda a escanear duraciones
 * largas. FIX WT-20260628-52 (P1): antes vivia duplicada inline en
 * src/components/recording/RecordingList.jsx — extraida aqui para
 * tener una sola fuente de verdad.
 *
 * @param {number|null|undefined} seconds
 * @returns {string} ej. "00:00:09", "01:23:45"
 */
export function formatDurationHMS(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/**
 * Asegura que un color en formato hex (#RRGGBB) tenga la luminiscencia
 * mínima adecuada para leerse sobre el fondo oscuro de Twitch (#18181b)
 * cumpliendo criterios de legibilidad WCAG AAA. Si el color es excesivamente
 * oscuro, incrementa proporcionalmente su brillo en espacio de luminiscencia.
 */
export function adjustColorContrast(color) {
  if (!color || typeof color !== 'string' || !color.startsWith('#') || color.length !== 7) {
    return color || '#adadb8'
  }
  let r = parseInt(color.slice(1, 3), 16) || 0
  let g = parseInt(color.slice(3, 5), 16) || 0
  let b = parseInt(color.slice(5, 7), 16) || 0

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b)
  if (luminance < 110) {
    const factor = 110 / Math.max(15, luminance)
    r = Math.min(255, Math.round(r * factor + 30))
    g = Math.min(255, Math.round(g * factor + 30))
    b = Math.min(255, Math.round(b * factor + 30))
    const toHex = (val) => Math.max(0, Math.min(255, val)).toString(16).padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }
  return color
}
