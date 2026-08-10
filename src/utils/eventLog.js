

const BUFFER_SIZE = 500
const LS_KEY = 'blinkstream_eventlog'
const LS_PERSIST_FLAG = 'blinkstream_eventlog_persist'

const _buffer = []
let _persistenceEnabled = false
const _listeners = new Set()

function _loadFromStorage() {
  try {
    if (localStorage.getItem(LS_PERSIST_FLAG) === '1') {
      _persistenceEnabled = true
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {

          _buffer.push(...parsed.slice(-BUFFER_SIZE))
        }
      }
    }
  } catch {

  }
}

function _saveToStorage() {
  if (!_persistenceEnabled) return
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(_buffer))
  } catch {

  }
}

_loadFromStorage()

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

  for (const l of _listeners) {
    try { l(evt) } catch {  }
  }

  _saveToStorage()

  const _isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV
  const _logCategory = (category === 'error' || _isDev)
  if (_logCategory) {
    const _style = _isDev ? 'color:#38bdf8;font-weight:bold' : 'color:#ef4444;font-weight:bold'
    console.log('%c[event:' + category + ']', _style, message, data || '')
  }
  return evt
}

export function getEventLog(opts = {}) {
  let out = _buffer
  if (opts.category) out = out.filter(e => e.category === opts.category)
  if (opts.limit && opts.limit > 0) out = out.slice(-opts.limit)

  return out.map(e => ({ ...e }))
}

export function clearEventLog() {
  _buffer.length = 0
  try { localStorage.removeItem(LS_KEY) } catch {  }
  for (const l of _listeners) {
    try { l({ type: 'clear' }) } catch {  }
  }
}

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
  } catch {  }
}

export function isPersistenceEnabled() {
  return _persistenceEnabled
}

export function subscribe(listener) {
  _listeners.add(listener)
  return () => _listeners.delete(listener)
}

export function getEventLogSize() {
  return _buffer.length
}
