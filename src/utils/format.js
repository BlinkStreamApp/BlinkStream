export function formatViewers(n) {
  if (n == null) return null
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function formatDuration(seconds) {
  if (seconds == null) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
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
