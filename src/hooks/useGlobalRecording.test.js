// Tests del hook useGlobalRecording (G1 / WT-20260628-16).
// Mockeamos measureInvoke (perf.js) para simular el backend.
// Validamos: cache local, refresh desde backend (unificado + legacy),
// setState con optimistic update, polling al montar, cleanup al
// desmontar, helper nextRecordingState.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const measureInvokeMock = vi.fn()
vi.mock('../utils/perf', () => ({
  measureInvoke: (...args) => measureInvokeMock(...args),
}))

const { useGlobalRecording, nextRecordingState } = await import('./useGlobalRecording')

// FIX P1-2: payloads del nuevo invoke unificado `recorder_get_full_state`.
// Devuelve { state, diskFreeGb, activeRecordings } en un solo round trip.
const FULL_OK = { state: 'OFF', diskFreeGb: 50.0, activeRecordings: [] }
const FULL_ON = { state: 'ON', diskFreeGb: 12.3, activeRecordings: [{ channelId: 'current', channelName: null, active: true }] }
// Mantenemos los shapes legacy para los tests que verifican el fallback.
const STATE_OK = { state: 'OFF', activeCount: 0, diskFreeGb: 50.0 }
const STATE_ON = { state: 'ON', activeCount: 1, diskFreeGb: 12.3 }
const LIST_OK = []
const LIST_ONE = [{ channelId: 'current', channelName: null, active: true }]

/**
 * Mock por nombre de command. Devuelve un mockImplementation que
 * devuelve el valor adecuado segun el primer argumento (cmd).
 */
function setupInvokeMock(responses) {
  measureInvokeMock.mockImplementation(async (cmd) => {
    const r = responses[cmd]
    if (r === undefined) return undefined
    if (r instanceof Error) throw r
    return r
  })
}

describe('useGlobalRecording', () => {
  beforeEach(() => {
    localStorage.clear()
    measureInvokeMock.mockReset()
    // Default: invoke unificado devuelve estado OK + lista vacia.
    // (FIX P1-2: nuevo invoke `recorder_get_full_state`.)
    setupInvokeMock({
      recorder_get_full_state: FULL_OK,
      recorder_get_global_state: STATE_OK,
      recorder_list_active: LIST_OK,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('estado inicial sin cache: OFF, sin activeRecordings, diskFreeGb=null', () => {
    const { result } = renderHook(() => useGlobalRecording())
    // Antes del primer fetch el state inicial es el cache (OFF)
    expect(result.current.state).toBe('OFF')
    expect(result.current.activeRecordings).toEqual([])
    expect(result.current.diskFreeGb).toBe(null)
  })

  it('cache en localStorage: arranca con el valor cacheado', () => {
    localStorage.setItem('bs.recording.globalState', 'ARMED')
    const { result } = renderHook(() => useGlobalRecording())
    expect(result.current.state).toBe('ARMED')
  })

  it('FIX P1-2: refresh usa recorder_get_full_state (un solo invoke) cuando el backend lo soporta', async () => {
    // El backend nuevo expone `recorder_get_full_state` que devuelve
    // { state, diskFreeGb, activeRecordings } en un solo round trip.
    setupInvokeMock({
      recorder_get_full_state: FULL_ON,
    })
    const { result } = renderHook(() => useGlobalRecording())
    await waitFor(() => {
      expect(result.current.state).toBe('ON')
    })
    expect(result.current.diskFreeGb).toBe(12.3)
    expect(result.current.activeRecordings).toEqual(LIST_ONE)
    // FIX P1-2 verificado: SOLO se invoca el comando unificado, NO
    // recorder_get_global_state ni recorder_list_active (modo legacy).
    // Eso reduce 6 invokes/min a 2 invokes/min por instancia del hook.
    const cmds = measureInvokeMock.mock.calls.map(c => c[0])
    expect(cmds).toContain('recorder_get_full_state')
    expect(cmds).not.toContain('recorder_get_global_state')
    expect(cmds).not.toContain('recorder_list_active')
  })

  it('FIX P1-2: fallback al modo legacy (2 invokes) si recorder_get_full_state no existe', async () => {
    // El backend viejo NO expone `recorder_get_full_state` — el invoke
    // devuelve undefined. El hook debe caer al modo legacy de 2 invokes
    // paralelos para mantener compatibilidad con builds pre-fix.
    setupInvokeMock({
      recorder_get_full_state: undefined,
      recorder_get_global_state: STATE_ON,
      recorder_list_active: LIST_ONE,
    })
    const { result } = renderHook(() => useGlobalRecording())
    await waitFor(() => {
      expect(result.current.state).toBe('ON')
    })
    expect(result.current.diskFreeGb).toBe(12.3)
    expect(result.current.activeRecordings).toEqual(LIST_ONE)
    // Fallback aplicado: se usaron los 2 invokes legacy.
    const cmds = measureInvokeMock.mock.calls.map(c => c[0])
    expect(cmds).toContain('recorder_get_global_state')
    expect(cmds).toContain('recorder_list_active')
  })

  it('refresh falla: setea error pero no rompe el state previo', async () => {
    const { result } = renderHook(() => useGlobalRecording())
    await waitFor(() => expect(result.current.state).toBe('OFF'))
    // Ahora hacemos que el siguiente refresh falle
    measureInvokeMock.mockImplementation(async () => {
      throw new Error('backend down')
    })
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.error).toBeTruthy()
    expect(String(result.current.error)).toMatch(/backend down/)
    // El state no se "rompe" — sigue siendo el ultimo conocido
    expect(result.current.state).toBe('OFF')
  })

  it('setState: actualiza optimistamente, llama backend, cachea en localStorage', async () => {
    const { result } = renderHook(() => useGlobalRecording())
    await waitFor(() => expect(result.current.state).toBe('OFF'))
    measureInvokeMock.mockClear()
    setupInvokeMock({
      recorder_set_global_enabled: undefined,
      recorder_get_full_state: FULL_OK,
    })
    await act(async () => {
      await result.current.setState('ARMED')
    })
    // Optimistic update
    expect(result.current.state).toBe('ARMED')
    expect(localStorage.getItem('bs.recording.globalState')).toBe('ARMED')
    expect(measureInvokeMock).toHaveBeenCalledWith(
      'recorder_set_global_enabled',
      { state: 'ARMED' },
    )
  })

  it('setState con valor invalido: rechaza sin llamar al backend', async () => {
    const { result } = renderHook(() => useGlobalRecording())
    await waitFor(() => expect(result.current.state).toBe('OFF'))
    measureInvokeMock.mockClear()
    await act(async () => {
      await result.current.setState('FOO')
    })
    expect(measureInvokeMock).not.toHaveBeenCalled()
    expect(result.current.error).toBeTruthy()
  })

  it('setState backend falla: hace rollback al prevState y dispara refresh', async () => {
    // FIX P0-4: el rollback ahora es INMEDIATO (no espera a refresh).
    // El state vuelve a 'OFF' en cuanto falla el set_global_enabled.
    // El refresh() best-effort puede o no traer el valor real, pero
    // la UI ya esta mostrando el valor consistente.
    const { result } = renderHook(() => useGlobalRecording())
    await waitFor(() => expect(result.current.state).toBe('OFF'))
    // Primer fetch (refresh) trae state=OFF y el primer set_global_enabled
    // falla. Despues del rollback, el refresh best-effort tambien falla,
    // asi que el error persiste en `error`.
    measureInvokeMock.mockImplementation(async (cmd) => {
      if (cmd === 'recorder_set_global_enabled') {
        throw new Error('write failed')
      }
      throw new Error('backend down')
    })
    await act(async () => {
      await result.current.setState('ON')
    })
    // FIX P0-4 verificado: el state revirtio a 'OFF' (prevState), no se
    // quedo en 'ON' mintiendole al usuario.
    expect(result.current.state).toBe('OFF')
    expect(result.current.error).toBeTruthy()
    // El localStorage tambien se reverte
    expect(localStorage.getItem('bs.recording.globalState')).toBe('OFF')
    // El refresh() disparado por el catch del setState ya se ejecutó
    // (FIX P1-2: ahora usa el invoke unificado `recorder_get_full_state`).
    expect(measureInvokeMock).toHaveBeenCalledWith(
      'recorder_get_full_state',
      undefined,
      expect.any(Object),
    )
  })

  it('FIX P0-4: rollback usa prevState y NO un valor hardcodeado', async () => {
    // Estado inicial cacheado = 'ARMED'. Si setState('ON') falla, el
    // rollback debe volver a 'ARMED' (no a 'OFF' hardcodeado).
    localStorage.setItem('bs.recording.globalState', 'ARMED')
    const { result } = renderHook(() => useGlobalRecording())
    // El primer fetch (refresh) dira que el backend confirma ARMED.
    // (FIX P1-2: el invoke unificado `recorder_get_full_state` es el
    // que se prefiere ahora.)
    measureInvokeMock.mockImplementation(async (cmd) => {
      if (cmd === 'recorder_set_global_enabled') {
        throw new Error('write failed')
      }
      if (cmd === 'recorder_get_full_state') {
        return { state: 'ARMED', diskFreeGb: 50.0, activeRecordings: [] }
      }
      return []
    })
    await waitFor(() => expect(result.current.state).toBe('ARMED'))
    // mockClear para no contar los invokes previos
    measureInvokeMock.mockClear()
    // Volvemos a hacer que set_global_enabled falle
    measureInvokeMock.mockImplementation(async (cmd) => {
      if (cmd === 'recorder_set_global_enabled') {
        throw new Error('write failed')
      }
      return undefined
    })
    await act(async () => {
      await result.current.setState('ON')
    })
    // El rollback debe volver a 'ARMED', no a 'OFF'.
    expect(result.current.state).toBe('ARMED')
    expect(localStorage.getItem('bs.recording.globalState')).toBe('ARMED')
  })

  it('FIX P0-5: refresh con diskFreeGb=null limpia el state a null', async () => {
    // FIX P0-5: si el backend devuelve diskFreeGb=null, el state debe
    // limpiarse a null (no mantener el valor anterior indefinidamente).
    // Antes el check era `typeof === 'number'`, asi que null caia en
    // el else (no se actualizaba) y el state quedaba stale.
    // Primer refresh: establece diskFreeGb=50.0 (invoke unificado FIX P1-2)
    setupInvokeMock({
      recorder_get_full_state: { state: 'OFF', diskFreeGb: 50.0, activeRecordings: [] },
    })
    const { result } = renderHook(() => useGlobalRecording())
    await waitFor(() => expect(result.current.diskFreeGb).toBe(50.0))
    // Segundo refresh: backend devuelve diskFreeGb=null (caso Unix sin statvfs)
    measureInvokeMock.mockClear()
    setupInvokeMock({
      recorder_get_full_state: { state: 'OFF', diskFreeGb: null, activeRecordings: [] },
    })
    await act(async () => {
      await result.current.refresh()
    })
    // FIX P0-5 verificado: null limpio, no se quedo en 50.0 stale.
    expect(result.current.diskFreeGb).toBe(null)
  })

  it('FIX P0-5: refresh con diskFreeGb=undefined tambien limpia a null', async () => {
    // Variante: el campo no viene en el payload (undefined explicito).
    setupInvokeMock({
      recorder_get_full_state: { state: 'OFF', diskFreeGb: 100.0, activeRecordings: [] },
    })
    const { result } = renderHook(() => useGlobalRecording())
    await waitFor(() => expect(result.current.diskFreeGb).toBe(100.0))
    measureInvokeMock.mockClear()
    setupInvokeMock({
      recorder_get_full_state: { state: 'OFF', activeRecordings: [] }, // sin diskFreeGb
    })
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.diskFreeGb).toBe(null)
  })

  it('nextRecordingState: cicla OFF -> ARMED -> ON -> OFF', () => {
    expect(nextRecordingState('OFF')).toBe('ARMED')
    expect(nextRecordingState('ARMED')).toBe('ON')
    expect(nextRecordingState('ON')).toBe('OFF')
    expect(nextRecordingState('FOO')).toBe('OFF')
  })

  it('cleanup en unmount: no deja intervalos colgados', async () => {
    const { unmount } = renderHook(() => useGlobalRecording())
    await waitFor(() => expect(measureInvokeMock).toHaveBeenCalled())
    measureInvokeMock.mockClear()
    unmount()
    // Esperar un poco y verificar que no se invoca nada mas.
    // (El POLL_INTERVAL_MS es 10s; no esperamos tanto, solo validamos
    // que el cleanup limpia el interval y no hay loop inmediato.)
    await new Promise(r => setTimeout(r, 30))
    expect(measureInvokeMock).not.toHaveBeenCalled()
  })
})
