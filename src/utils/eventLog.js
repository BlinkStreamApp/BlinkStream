// ============================================================
// eventLog.js — Log de eventos local con ring buffer (M-8)
// ============================================================
// Provee:
//   - logEvent(category, message, data?)
//   - getEventLog(filter?)
//   - clearEventLog()
//   - Persistencia opcional en localStorage
//
// Categorías: 'auth' | 'recording' | 'channel_points' | 'error' |
//             'perf' | 'chat'
// ============================================================

const BUFFER_SIZE = 500
const LS_KEY = 'blinkstream_eventlog'
const LS_PERSIST_FLAG = 'blinkstream_eventlog_persist'

const _buffer = []
let _persistenceEnabled = false
const _listeners = new Set()

// Carga inicial desde localStorage si está habilitado
function _loadFromStorage() {
  try {
    if (localStorage.getItem(LS_PERSIST_FLAG) === '1') {
      _persistenceEnabled = true
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          // solo nos quedamos con las últimas BUFFER_SIZE entradas
          _buffer.push(...parsed.slice(-BUFFER_SIZE))
        }
      }
    }
  } catch {
    /* ignore — si falla, simplemente empezamos vacíos */
  }
}

function _saveToStorage() {
  if (!_persistenceEnabled) return
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(_buffer))
  } catch {
    /* quota exceeded: silencioso, no rompemos el flujo */
  }
}

// Carga en módulo init
_loadFromStorage()

/**
 * Registra un evento en el ring buffer.
 * @param {string} category - 'auth' | 'recording' | 'channel_points' | 'error' | 'perf' | 'chat'
 * @param {string} message  - descripción corta
 * @param {object} [data]   - payload arbitrario
 * @returns {object} el evento registrado (con id y ts)
 */
export function logEvent(category, message, data) {
  const evt = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    category,
    message,
    data: data || null,
  }
  _buffer.push(evt)
  if (_buffer.length > BUFFER_SIZE) _buffer.shift()
  // Notificar suscriptores (DebugPanel)
  for (const l of _listeners) {
    try { l(evt) } catch { /* no rompas el flujo si un listener peta */ }
  }
  // Persistir
  _saveToStorage()
   
  // FIX 5 (Hank / P1): el console.log del eventLog llevaba en PROD
  // datos arbitrarios del caller (a veces targetName, username,
  // tokens, URLs firmadas). CWE-532. En DEV logueamos todo. En
  // PROD, solo dejamos pasar la categoria 'error' para no
  // contaminar DevTools con datos de plataforma.
  const _isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV
  const _logCategory = (category === 'error' || _isDev)
  if (_logCategory) {
    const _style = _isDev ? 'color:#38bdf8;font-weight:bold' : 'color:#ef4444;font-weight:bold'
    console.log('%c[event:' + category + ']', _style, message, data || '')
  }
  return evt
}

/**
 * Devuelve el event log. Opcionalmente filtrado por categoría.
 * @param {object} [opts] - { category?: string, limit?: number }
 */
export function getEventLog(opts = {}) {
  let out = _buffer
  if (opts.category) out = out.filter(e => e.category === opts.category)
  if (opts.limit && opts.limit > 0) out = out.slice(-opts.limit)
  // devolver copia para que nadie mute el buffer
  return out.map(e => ({ ...e }))
}

/**
 * Vacía el event log y (si está persistido) borra de localStorage.
 */
export function clearEventLog() {
  _buffer.length = 0
  try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
  for (const l of _listeners) {
    try { l({ type: 'clear' }) } catch { /* ignore */ }
  }
}

/**
 * Activa o desactiva la persistencia en localStorage.
 * @param {boolean} enabled
 */
export function setPersistence(enabled) {
  _persistenceEnabled = !!enabled
  try {
    if (enabled) {
      localStorage.setItem(LS_PERSIST_FLAG, '1')
      _saveToStorage()
    } else {
      localStorage.removeItem(LS_PERSIST_FLAG)
      localStorage.removeItem(LS_KEY)
    }
  } catch { /* ignore */ }
}

export function isPersistenceEnabled() {
  return _persistenceEnabled
}

/**
 * Suscribe un listener que recibe cada nuevo evento (o { type: 'clear' }).
 * Devuelve función de unsubscribe.
 */
export function subscribe(listener) {
  _listeners.add(listener)
  return () => _listeners.delete(listener)
}

// Tamaños para inspección
export function getEventLogSize() {
  return _buffer.length
}
