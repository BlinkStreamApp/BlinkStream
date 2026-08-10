

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
  } catch {  }
  return 'OFF'
}

function writeCachedState(state) {
  try { localStorage.setItem(LS_KEY, state) } catch {  }
}

export function nextRecordingState(current) {
  switch (current) {
    case 'OFF': return 'ARMED'
    case 'ARMED': return 'ON'
    case 'ON': return 'OFF'
    default: return 'OFF'
  }
}

export function useGlobalRecording() {

  const [state, setStateLocal] = useState(readCachedState)
  const [activeRecordings, setActiveRecordings] = useState([])
  const [diskFreeGb, setDiskFreeGb] = useState(null)
  const [error, setError] = useState(null)

  const isFetchingRef = useRef(false)
  const mountedRef = useRef(true)

  const stateRef = useRef(state)
  // eslint-disable-next-line react-hooks/refs
  stateRef.current = state

  const refresh = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {

      let fullRes
      try {
        fullRes = await measureInvoke('recorder_get_full_state', undefined, { silent: true })
      } catch (fullErr) {

        void fullErr
        fullRes = undefined
      }
      if (!mountedRef.current) return

      if (fullRes && typeof fullRes === 'object' && (
        'state' in fullRes || 'diskFreeGb' in fullRes || 'activeRecordings' in fullRes
      )) {
        const newState = fullRes.state
        if (VALID_STATES.includes(newState)) {
          setStateLocal(newState)
          writeCachedState(newState)
        }

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

    const prevState = stateRef.current

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

      setStateLocal(prevState)
      writeCachedState(prevState)

      refresh()
    }
  }, [refresh])

  useEffect(() => {
    mountedRef.current = true

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
