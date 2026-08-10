

import { logEvent } from './eventLog'

export function markStart(name) {
  if (typeof performance === 'undefined' || !performance.mark) return
  try {
    performance.mark(`${name}:start`)
  } catch {

  }
}

export function markEnd(name) {
  if (typeof performance === 'undefined') return 0
  try {
    performance.mark(`${name}:end`)
    performance.measure(name, `${name}:start`, `${name}:end`)
    const entries = performance.getEntriesByName(name, 'measure')
    const last = entries[entries.length - 1]
    return last ? last.duration : 0
  } catch {
    return 0
  }
}

export function getMetrics() {
  if (typeof performance === 'undefined') return {}
  const result = {
    marks: performance.getEntriesByType('mark').map(e => ({ name: e.name, t: e.startTime })),
    measures: performance.getEntriesByType('measure').map(e => ({ name: e.name, duration: e.duration })),
    resources: performance.getEntriesByType('resource').length,
  }

  const nav = performance.getEntriesByType('navigation')[0]
  if (nav) {
    result.navigation = {
      domContentLoaded: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      ttfb: nav.responseStart,
    }
  }

  if (performance.memory) {
    result.memory = {
      usedJSHeapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
      totalJSHeapMB: Math.round(performance.memory.totalJSHeapSize / 1048576),
      limitJSHeapMB: Math.round(performance.memory.jsHeapSizeLimit / 1048576),
    }
  }
  return result
}

export function measureRender(Component, label) {
  const name = label || Component.displayName || Component.name || 'Component'
  function Measured(props) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const out = Component(props)
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const dur = t1 - t0
    if (dur > 4) {

      console.log(`%c[perf:render] ${name}`, 'color:#a78bfa', `${dur.toFixed(2)}ms`)
    }
    return out
  }
  Measured.displayName = `measureRender(${name})`
  return Measured
}

let _vitalsStarted = false
let _vitals = { lcp: null, fid: null, cls: 0, clsEntries: [] }

export function trackWebVitals() {
  if (_vitalsStarted || typeof window === 'undefined') return
  _vitalsStarted = true

  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const last = entries[entries.length - 1]
      if (last) {
        _vitals.lcp = last.startTime

        console.log(`%c[perf:vital] LCP`, 'color:#22c55e;font-weight:bold', `${Math.round(last.startTime)}ms`)
        logEvent('perf', 'webvital.lcp', { value: Math.round(last.startTime) })
      }
    })
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })
  } catch {  }

  try {
    const fidObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      for (const entry of entries) {
        const fid = entry.processingStart - entry.startTime
        _vitals.fid = fid

        console.log(`%c[perf:vital] FID`, 'color:#22c55e;font-weight:bold', `${Math.round(fid)}ms`)
        logEvent('perf', 'webvital.fid', { value: Math.round(fid) })
      }
    })
    fidObserver.observe({ type: 'first-input', buffered: true })
  } catch {  }

  try {
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          _vitals.cls += entry.value
          _vitals.clsEntries.push({ value: entry.value, t: entry.startTime })
        }
      }

      console.log(`%c[perf:vital] CLS`, 'color:#22c55e;font-weight:bold', _vitals.cls.toFixed(4))
    })
    clsObserver.observe({ type: 'layout-shift', buffered: true })
  } catch {  }

  console.log('%c[perf:vitals] tracking started', 'color:#22c55e')
}

export function getVitals() {
  return { ..._vitals }
}

const INVOKE_BUFFER_SIZE = 100
const _invokeBuffer = []
let _tauriInvoke = null

async function _getInvoke() {
  if (_tauriInvoke) return _tauriInvoke
  const mod = await import('@tauri-apps/api/core')
  _tauriInvoke = mod.invoke
  return _tauriInvoke
}

export async function measureInvoke(cmd, args = undefined, opts = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  let success = true
  let error = null
  let result
  try {
    const invoke = await _getInvoke()
    result = await invoke(cmd, args)
    return result
  } catch (e) {
    success = false
    error = typeof e === 'string' ? e : e?.message || String(e)
    throw e
  } finally {
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const duration = t1 - t0
    const entry = {
      cmd,
      duration_ms: Math.round(duration * 100) / 100,
      success,
      error,
      ts: Date.now(),
    }
    _invokeBuffer.push(entry)
    if (_invokeBuffer.length > INVOKE_BUFFER_SIZE) _invokeBuffer.shift()
    if (!opts.silent) {
      const color = success ? '#22c55e' : '#ef4444'

      console.log(
        `%c[perf:invoke] ${cmd}`,
        `color:${color};font-weight:bold`,
        `${entry.duration_ms}ms`,
        success ? 'OK' : `FAIL: ${error}`,
      )
    }
    if (!success) {
      logEvent('error', `invoke:${cmd} failed`, { duration_ms: entry.duration_ms, error })
    }
  }
}

export function getInvokeStats() {
  return [..._invokeBuffer]
}

export function getSlowestInvokes(n = 10) {
  const byCmd = new Map()
  for (const e of _invokeBuffer) {
    const cur = byCmd.get(e.cmd)
    if (!cur || e.duration_ms > cur.duration_ms) byCmd.set(e.cmd, e)
  }
  return [...byCmd.values()].sort((a, b) => b.duration_ms - a.duration_ms).slice(0, n)
}

const FETCH_BUFFER_SIZE = 100
const _fetchBuffer = []

export async function measureFetch(url, options = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  let status = 0
  let rateLimitRemaining
  try {
    const res = await fetch(url, options)
    status = res.status

    const rl = res.headers.get('Ratelimit-Remaining')
    if (rl != null) rateLimitRemaining = Number(rl)
    return res
  } finally {
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const duration = t1 - t0
    const entry = {
      url: typeof url === 'string' ? url : String(url),
      duration_ms: Math.round(duration * 100) / 100,
      status,
      rate_limit_remaining: rateLimitRemaining,
      ts: Date.now(),
    }
    _fetchBuffer.push(entry)
    if (_fetchBuffer.length > FETCH_BUFFER_SIZE) _fetchBuffer.shift()
    const color = status >= 500 ? '#ef4444' : status >= 400 ? '#f59e0b' : '#22c55e'

    console.log(
      `%c[perf:fetch] ${entry.url}`,
      `color:${color}`,
      `${entry.duration_ms}ms`,
      `HTTP ${status}`,
      rateLimitRemaining != null ? `RL-Remaining: ${rateLimitRemaining}` : '',
    )
  }
}

export function getFetchStats() {
  return [..._fetchBuffer]
}
