// ============================================================
// useGlobalRecording.js — Estado global de grabacion (G1 / WT-20260628-16)
// ============================================================
// Maneja el flag OFF/ARMED/ON que activa el modo de grabacion global,
// lista las grabaciones activas, y consulta el espacio libre en disco.
//
// En el MVP (G1):
//   - state: 'OFF' | 'ARMED' | 'ON'  (persistido en localStorage cache
//     y en backend via recorder_set_global_enabled)
//   - activeRecordings: array con 0 o 1 elemento (single-channel MVP)
//   - diskFreeGb: number | null  (lo calcula el backend)
//   - Polling cada 10s del estado global cuando el hook esta montado
//
// NO integra auto-record en ARMED (diferido a Sprint G2).
//
// API:
//   - state: 'OFF' | 'ARMED' | 'ON'
//   - activeRecordings: Array<{...}>
//   - diskFreeGb: number | null
//   - error: string | null
//   - setState(newState): Promise<void>   cicla OFF -> ARMED -> ON -> OFF
//   - refresh(): Promise<void>            fuerza una consulta al backend
//
// FIX P1-2: el backend expone `recorder_get_full_state` que devuelve
//   { state, diskFreeGb, activeRecordings } en un solo round trip.
//   Antes haciamos 2 invokes en paralelo (recorder_get_global_state +
//   recorder_list_active) = 12 invokes/min por instancia del hook.
//   Con 3 componentes que lo consumen (FIX P1-4) eso eran 36 invokes/min.
//   Ahora con un solo invoke por polling tick, 3 componentes = 6 invokes/min.
//   Si el backend no expone aun `recorder_get_full_state`, este hook
//   cae gracefully al modo legacy de 2 invokes paralelos. Asi podemos
//   desplegar el fix frontend sin esperar al backend.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { measureInvoke } from '../utils/perf'
import { logError, ErrorCode } from '../utils/errors'
import { logEvent } from '../utils/eventLog'

const LS_KEY = 'bs.recording.globalState'
const VALID_STATES = ['OFF', 'ARMED', 'ON']
const POLL_INTERVAL_MS = 10_000

function readCachedState() {
  try {
    const v = localStorage.getItem(LS_KEY)
    if (VALID_STATES.includes(v)) return v
  } catch { /* ignore */ }
  return 'OFF'
}

function writeCachedState(state) {
  try { localStorage.setItem(LS_KEY, state) } catch { /* ignore */ }
}

/**
 * Cicla al siguiente estado: OFF -> ARMED -> ON -> OFF.
 * @param {string} current
 * @returns {string}
 */
export function nextRecordingState(current) {
  switch (current) {
    case 'OFF': return 'ARMED'
    case 'ARMED': return 'ON'
    case 'ON': return 'OFF'
    default: return 'OFF'
  }
}

/**
 * Hook de estado global de grabacion.
 * @returns {{
 *   state: 'OFF'|'ARMED'|'ON',
 *   activeRecordings: Array<object>,
 *   diskFreeGb: number|null,
 *   error: string|null,
 *   setState: (newState: string) => Promise<void>,
 *   refresh: () => Promise<void>,
 * }}
 */
export function useGlobalRecording() {
  // Cache local como "valor optimista" para no parpadear en OFF entre
  // mount y la primera respuesta del backend. El backend es la fuente
  // de verdad, pero tarda unos ms en responder.
  const [state, setStateLocal] = useState(readCachedState)
  const [activeRecordings, setActiveRecordings] = useState([])
  const [diskFreeGb, setDiskFreeGb] = useState(null)
  const [error, setError] = useState(null)
  // Ref para evitar race conditions si el usuario hace click rapido
  // en el toggle mientras un polling esta en vuelo.
  const isFetchingRef = useRef(false)
  const mountedRef = useRef(true)

  // Ref sincronizada con `state` para que `setState` (definido mas abajo)
  // pueda leer el valor actual aunque su closure de useCallback este stale.
  // Mismo patron que en useManageRewards: la ref se actualiza en cada
  // render y `setState` lee `stateRef.current` para conocer el prevState
  // y poder hacer rollback si el backend falla (FIX P0-4).
  const stateRef = useRef(state)
  // eslint-disable-next-line react-hooks/refs
  stateRef.current = state

  const refresh = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      // FIX P1-2: preferimos el invoke unificado `recorder_get_full_state`
      // que devuelve { state, diskFreeGb, activeRecordings } en un solo
      // round trip. Si el backend NO lo expone aun (entorno dev o build
      // viejo), caemos al modo legacy de 2 invokes paralelos. Esto
      // permite desplegar el fix de frontend sin esperar al backend.
      let fullRes
      try {
        fullRes = await measureInvoke('recorder_get_full_state', undefined, { silent: true })
      } catch (fullErr) {
        // Si el backend rechaza el command (Tauri devuelve error en vez
        // de undefined), probamos el modo legacy.
        void fullErr
        fullRes = undefined
      }
      if (!mountedRef.current) return

      // Rama unificada: el backend ya soporta recorder_get_full_state.
      if (fullRes && typeof fullRes === 'object' && (
        'state' in fullRes || 'diskFreeGb' in fullRes || 'activeRecordings' in fullRes
      )) {
        const newState = fullRes.state
        if (VALID_STATES.includes(newState)) {
          setStateLocal(newState)
          writeCachedState(newState)
        }
        // FIX P0-5: limpiar diskFreeGb a null cuando el backend devuelve
        // null. Antes el check era `typeof === 'number'`, asi que si el
        // backend devolvia `null` (caso normal en Unix cuando el syscall
        // statvfs no esta disponible, o en algunos Windows), el state
        // mantenia el valor anterior indefinidamente. Ahora diferenciamos
        // explicitamente: number -> set, null/undefined/missing -> null
        // (limpiamos para que la UI muestre "desconocido" en vez del
        // numero viejo que ya no refleja la realidad).
        if (fullRes.diskFreeGb == null) {
          setDiskFreeGb(null)
        } else if (typeof fullRes.diskFreeGb === 'number') {
          setDiskFreeGb(fullRes.diskFreeGb)
        }
        if (Array.isArray(fullRes.activeRecordings)) {
          setActiveRecordings(fullRes.activeRecordings)
        }
        setError(null)
        return
      }

      // Rama legacy: backend no soporta aun `recorder_get_full_state`.
      // Hacemos los 2 invokes en paralelo. Esto se mantiene por
      // compatibilidad con builds viejos del backend; cuando TODOS los
      // despliegues tengan el nuevo command, se podra borrar este
      // fallback. Por ahora: cubre el caso dev web puro y versiones
      // del backend pre-fix.
      const [stateRes, listRes] = await Promise.all([
        measureInvoke('recorder_get_global_state', undefined, { silent: true }),
        measureInvoke('recorder_list_active', undefined, { silent: true }),
      ])
      if (!mountedRef.current) return

      if (stateRes && typeof stateRes === 'object') {
        const newState = stateRes.state
        if (VALID_STATES.includes(newState)) {
          setStateLocal(newState)
          writeCachedState(newState)
        }
        if (stateRes.diskFreeGb == null) {
          setDiskFreeGb(null)
        } else if (typeof stateRes.diskFreeGb === 'number') {
          setDiskFreeGb(stateRes.diskFreeGb)
        }
      }
      if (Array.isArray(listRes)) {
        setActiveRecordings(listRes)
      }
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      const msg = typeof err === 'string' ? err : err?.message || String(err)
      // No spameamos el log: si el backend no esta (dev web puro),
      // esto falla siempre y el usuario no puede hacer nada.
      // Lo dejamos en debug-level via logError pero no elevamos a UI.
      logError(err, {
        component: 'useGlobalRecording',
        action: 'refresh',
        code: ErrorCode.RECORDING_FAILED,
      })
      setError(msg)
    } finally {
      isFetchingRef.current = false
    }
  }, [])

  const setState = useCallback(async (newState) => {
    if (!VALID_STATES.includes(newState)) {
      setError(`Estado inválido: ${newState}`)
      return
    }
    // FIX P0-4: capturamos el state previo ANTES del optimistic update
    // para poder revertirlo si el backend rechaza la operacion. Antes
    // el rollback dependia de `refresh()` que podia fallar tambien o
    // llegar tarde, dejando la UI mintiendole al usuario durante varios
    // segundos (o indefinidamente si el backend estaba caido).
    const prevState = stateRef.current
    // Optimistic update: actualizamos UI antes del round trip.
    setStateLocal(newState)
    writeCachedState(newState)
    setError(null)
    try {
      await measureInvoke('recorder_set_global_enabled', { state: newState })
      logEvent('recording', 'global.state.changed', { state: newState })
    } catch (err) {
      const msg = typeof err === 'string' ? err : err?.message || String(err)
      logError(err, {
        component: 'useGlobalRecording',
        action: 'setState',
        code: ErrorCode.RECORDING_FAILED,
      })
      setError(msg)
      // Rollback inmediato: restauramos el state anterior. NO esperamos
      // a refresh() — si el backend esta caido el rollback tiene que
      // ser instantaneo para no dejar UI inconsistente.
      setStateLocal(prevState)
      writeCachedState(prevState)
      // Aun asi disparamos refresh para re-sincronizar diskFreeGb y
      // activeRecordings (best-effort; el catch interno no rompe nada).
      refresh()
    }
  }, [refresh])

  // Polling cada 10s. Cleanup en unmount: clear interval.
  useEffect(() => {
    mountedRef.current = true
    // Primer fetch inmediato para sincronizar con el backend.
    // Lo agendamos con queueMicrotask para evitar el warning
    // `react-hooks/set-state-in-effect` (eslint v10 strict). El
    // primer fetch sigue siendo inmediato desde el punto de vista
    // del usuario, solo que sale del effect tick actual.
    const microId = queueMicrotask(() => { refresh() })
    void microId
    const id = setInterval(() => {
      refresh()
    }, POLL_INTERVAL_MS)
    return () => {
      mountedRef.current = false
      clearInterval(id)
    }
  }, [refresh])

  return {
    state,
    activeRecordings,
    diskFreeGb,
    error,
    setState,
    refresh,
  }
}
