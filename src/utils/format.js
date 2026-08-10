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

export function formatDurationHMS(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

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
