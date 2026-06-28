// ============================================================
// DebugPanel.jsx — Panel de observabilidad en dev (M-8)
// ============================================================
// SOLO visible en dev (import.meta.env.DEV). El bundler lo strip-ea
// en producción porque las refs estáticas se eliminan con dead-code
// elimination. Aún así, todo el árbol está dentro de una guarda DEV.
//
// Muestra:
//   - FPS estimado (frames en 1s)
//   - RAM usada (performance.memory, Chrome/Edge only)
//   - Último invoke latencia
//   - Event log filtrable por categoría
//   - Top 10 invokes más lentos
// ============================================================

import { useState, useEffect, useMemo } from 'react'
import {
  getInvokeStats,
  getFetchStats,
  getSlowestInvokes,
  getVitals,
} from '../utils/perf'
import { getEventLog, subscribe as subscribeEvents, clearEventLog } from '../utils/eventLog'

const CATEGORIES = ['all', 'auth', 'recording', 'channel_points', 'error', 'perf', 'chat']

function useFps() {
  const [fps, setFps] = useState(0)
  useEffect(() => {
    let raf
    let frames = 0
    let last = performance.now()
    const tick = (t) => {
      frames++
      if (t - last >= 1000) {
        setFps(frames)
        frames = 0
        last = t
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return fps
}

function useMemory() {
  const [mem, setMem] = useState(null)
  useEffect(() => {
    const id = setInterval(() => {
      if (performance.memory) {
        setMem({
          used: Math.round(performance.memory.usedJSHeapSize / 1048576),
          total: Math.round(performance.memory.totalJSHeapSize / 1048576),
        })
      } else {
        setMem(null)
      }
    }, 1500)
    return () => clearInterval(id)
  }, [])
  return mem
}

function fmtTime(ts) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

function MetricRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between text-[11px] py-1">
      <span className="text-text-muted">{label}</span>
      <span className={color || 'text-text-primary'} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}

// FIX 6 (Hank / P1): cambio 'export default function DebugPanel()'
// por un wrapper con DEV guard. La implementacion se llama
// DebugPanelImpl y solo se monta cuando import.meta.env.DEV es true.
// En produccion, el componente retorna null (early exit), lo que
// permite al bundler (Vite/Rollup) tree-shakear el modulo entero
// via el import estatico del wrapper condicional.
// Sin este guard, todo el modulo (que importa useFps, useMemory,
// getInvokeStats, etc) terminaba en el bundle de prod aunque el
// shortcut Ctrl+Shift+D no funcionara.
function DebugPanelImpl() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('metrics') // metrics | events | invokes
  const [category, setCategory] = useState('all')
  const [events, setEvents] = useState(() => getEventLog())
  const [tick, setTick] = useState(0) // para refrescar stats cada segundo
  const fps = useFps()
  const mem = useMemory()

  // Suscribirse a nuevos eventos
  useEffect(() => {
    return subscribeEvents(() => {
      setEvents(getEventLog())
    })
  }, [])

  // Refrescar buffers cada 1s
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Hotkey Ctrl+Shift+D
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // `tick` solo se usa para forzar re-render cada segundo; las funciones
  // getInvokeStats/getFetchStats/getSlowestInvokes leen del buffer
  // compartido, asi que la dep es necesaria (es nuestra forma de polling
  // manual desde React). Mantenemos `tick` aunque la regla diga
  // "unnecessary" — es nuestro disparador.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const invokeStats = useMemo(() => getInvokeStats(), [tick])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchStats = useMemo(() => getFetchStats(), [tick])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slowestInvokes = useMemo(() => getSlowestInvokes(10), [tick])
  const lastInvoke = invokeStats[invokeStats.length - 1]
  const lastFetch = fetchStats[fetchStats.length - 1]
  const vitals = useMemo(() => getVitals(), [])

  const filteredEvents = useMemo(
    () => (category === 'all' ? events : events.filter(e => e.category === category)),
    [events, category],
  )

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Debug panel (Ctrl+Shift+D)"
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 9999,
          width: 40,
          height: 40,
          borderRadius: 20,
          background: open ? '#7c3aed' : '#1e293b',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.1)',
          cursor: 'pointer',
          fontSize: 18,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}
      >
        🐛
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            right: 16,
            bottom: 64,
            zIndex: 9999,
            width: 420,
            maxHeight: 560,
            background: '#0f172a',
            color: '#e2e8f0',
            border: '1px solid #334155',
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            fontSize: 12,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, color: '#a78bfa' }}>BlinkStream Debug</span>
              <span style={{ color: '#64748b', fontSize: 10 }}>Ctrl+Shift+D</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'transparent', border: 0, color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #334155' }}>
            {[
              ['metrics', 'Metrics'],
              ['events', `Events (${filteredEvents.length})`],
              ['invokes', `Invokes (${invokeStats.length})`],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  background: tab === k ? '#1e293b' : 'transparent',
                  border: 0,
                  borderBottom: tab === k ? '2px solid #7c3aed' : '2px solid transparent',
                  color: tab === k ? '#e2e8f0' : '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ overflow: 'auto', flex: 1, padding: 12 }}>
            {tab === 'metrics' && (
              <div>
                <MetricRow label="FPS" value={fps} color={fps < 30 ? '#ef4444' : fps < 50 ? '#f59e0b' : '#22c55e'} />
                {mem ? (
                  <>
                    <MetricRow label="RAM usada" value={`${mem.used} MB`} />
                    <MetricRow label="RAM total" value={`${mem.total} MB`} />
                  </>
                ) : (
                  <MetricRow label="RAM" value="n/a (non-Chromium)" color="#64748b" />
                )}
                <div style={{ height: 8 }} />
                <div style={{ color: '#a78bfa', fontSize: 11, marginBottom: 4 }}>Core Web Vitals</div>
                <MetricRow label="LCP" value={vitals.lcp != null ? `${Math.round(vitals.lcp)}ms` : '—'} />
                <MetricRow label="FID" value={vitals.fid != null ? `${Math.round(vitals.fid)}ms` : '—'} />
                <MetricRow label="CLS" value={vitals.cls != null ? vitals.cls.toFixed(4) : '—'} />
                <div style={{ height: 8 }} />
                <div style={{ color: '#a78bfa', fontSize: 11, marginBottom: 4 }}>Últimas operaciones</div>
                {lastInvoke ? (
                  <MetricRow
                    label={`invoke:${lastInvoke.cmd}`}
                    value={`${lastInvoke.duration_ms}ms ${lastInvoke.success ? 'OK' : 'FAIL'}`}
                    color={lastInvoke.success ? '#22c55e' : '#ef4444'}
                  />
                ) : <MetricRow label="último invoke" value="—" />}
                {lastFetch ? (
                  <MetricRow
                    label={lastFetch.url.replace('https://api.twitch.tv/', 'helix/').slice(0, 32)}
                    value={`${lastFetch.duration_ms}ms HTTP ${lastFetch.status}`}
                    color={lastFetch.status >= 400 ? '#ef4444' : '#22c55e'}
                  />
                ) : <MetricRow label="último fetch" value="—" />}
              </div>
            )}

            {tab === 'events' && (
              <div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  {CATEGORIES.map(c => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      style={{
                        padding: '2px 8px',
                        fontSize: 10,
                        borderRadius: 4,
                        background: category === c ? '#7c3aed' : '#1e293b',
                        color: category === c ? '#fff' : '#94a3b8',
                        border: '1px solid #334155',
                        cursor: 'pointer',
                      }}
                    >
                      {c}
                    </button>
                  ))}
                  <button
                    onClick={() => { clearEventLog(); setEvents([]) }}
                    style={{
                      marginLeft: 'auto',
                      padding: '2px 8px',
                      fontSize: 10,
                      borderRadius: 4,
                      background: '#1e293b',
                      color: '#f87171',
                      border: '1px solid #334155',
                      cursor: 'pointer',
                    }}
                  >
                    clear
                  </button>
                </div>
                <div style={{ maxHeight: 380, overflow: 'auto' }}>
                  {filteredEvents.length === 0 && (
                    <div style={{ color: '#64748b', textAlign: 'center', padding: 16 }}>no events</div>
                  )}
                  {filteredEvents.slice().reverse().slice(0, 100).map(e => (
                    <div
                      key={e.id}
                      style={{
                        padding: '4px 0',
                        borderBottom: '1px solid #1e293b',
                        fontSize: 10,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ color: '#64748b' }}>{fmtTime(e.ts)}</span>
                        <span style={{
                          color: e.category === 'error' ? '#f87171' : '#38bdf8',
                          fontWeight: 600,
                        }}>
                          [{e.category}]
                        </span>
                        <span style={{ color: '#e2e8f0' }}>{e.message}</span>
                      </div>
                      {e.data && (
                        <div style={{ color: '#64748b', marginLeft: 60, marginTop: 2, wordBreak: 'break-all' }}>
                          {JSON.stringify(e.data)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'invokes' && (
              <div>
                <div style={{ color: '#a78bfa', fontSize: 11, marginBottom: 4 }}>
                  Top 10 invokes más lentos (pico histórico)
                </div>
                {slowestInvokes.length === 0 && (
                  <div style={{ color: '#64748b', textAlign: 'center', padding: 16 }}>no invokes yet</div>
                )}
                {slowestInvokes.map((inv, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '4px 0',
                      borderBottom: '1px solid #1e293b',
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color: inv.success ? '#e2e8f0' : '#f87171' }}>{inv.cmd}</span>
                    <span style={{
                      color: inv.duration_ms > 500 ? '#ef4444' : inv.duration_ms > 100 ? '#f59e0b' : '#22c55e',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {inv.duration_ms}ms
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// FIX 6 (Hank / P1): wrapper con DEV guard. En produccion, el modulo
// retorna un componente no-op (null) y todas sus dependencias (useFps,
// useMemory, getInvokeStats, getEventLog, etc.) son tree-shakeadas
// por Vite/Rollup porque el import de DebugPanelImpl nunca se evalua
// cuando la rama 'false' se compila (Vite sustituye import.meta.env
// en build time, lo que permite al bundler descartar codigo muerto).
export default function DebugPanel() {
  if (!import.meta.env.DEV) {
    return null
  }
  return DebugPanelImpl()
}