

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const measureInvokeMock = vi.fn()
vi.mock('../utils/perf', () => ({
  measureInvoke: (...args) => measureInvokeMock(...args),
}))

const { useGlobalRecording, nextRecordingState } = await import('./useGlobalRecording')

const FULL_OK = { state: 'OFF', diskFreeGb: 50.0, activeRecordings: [] }
const FULL_ON = { state: 'ON', diskFreeGb: 12.3, activeRecordings: [{ channelId: 'current', channelName: null, active: true }] }

const STATE_OK = { state: 'OFF', activeCount: 0, diskFreeGb: 50.0 }
const STATE_ON = { state: 'ON', activeCount: 1, diskFreeGb: 12.3 }
const LIST_OK = []
const LIST_ONE = [{ channelId: 'current', channelName: null, active: true }]

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

    setupInvokeMock({
      recorder_get_full_state: FULL_ON,
    })
    const { result } = renderHook(() => useGlobalRecording())
    await waitFor(() => {
      expect(result.current.state).toBe('ON')
    })
    expect(result.current.diskFreeGb).toBe(12.3)
    expect(result.current.activeRecordings).toEqual(LIST_ONE)

    const cmds = measureInvokeMock.mock.calls.map(c => c[0])
    expect(cmds).toContain('recorder_get_full_state')
    expect(cmds).not.toContain('recorder_get_global_state')
    expect(cmds).not.toContain('recorder_list_active')
  })

  it('FIX P1-2: fallback al modo legacy (2 invokes) si recorder_get_full_state no existe', async () => {

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

    const cmds = measureInvokeMock.mock.calls.map(c => c[0])
    expect(cmds).toContain('recorder_get_global_state')
    expect(cmds).toContain('recorder_list_active')
  })

  it('refresh falla: setea error pero no rompe el state previo', async () => {
    const { result } = renderHook(() => useGlobalRecording())
    await waitFor(() => expect(result.current.state).toBe('OFF'))

    measureInvokeMock.mockImplementation(async () => {
      throw new Error('backend down')
    })
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.error).toBeTruthy()
    expect(String(result.current.error)).toMatch(/backend down/)

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

    const { result } = renderHook(() => useGlobalRecording())
    await waitFor(() => expect(result.current.state).toBe('OFF'))

    measureInvokeMock.mockImplementation(async (cmd) => {
      if (cmd === 'recorder_set_global_enabled') {
        throw new Error('write failed')
      }
      throw new Error('backend down')
    })
    await act(async () => {
      await result.current.setState('ON')
    })

    expect(result.current.state).toBe('OFF')
    expect(result.current.error).toBeTruthy()

    expect(localStorage.getItem('bs.recording.globalState')).toBe('OFF')

    expect(measureInvokeMock).toHaveBeenCalledWith(
      'recorder_get_full_state',
      undefined,
      expect.any(Object),
    )
  })

  it('FIX P0-4: rollback usa prevState y NO un valor hardcodeado', async () => {

    localStorage.setItem('bs.recording.globalState', 'ARMED')
    const { result } = renderHook(() => useGlobalRecording())

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

    measureInvokeMock.mockClear()

    measureInvokeMock.mockImplementation(async (cmd) => {
      if (cmd === 'recorder_set_global_enabled') {
        throw new Error('write failed')
      }
      return undefined
    })
    await act(async () => {
      await result.current.setState('ON')
    })

    expect(result.current.state).toBe('ARMED')
    expect(localStorage.getItem('bs.recording.globalState')).toBe('ARMED')
  })

  it('FIX P0-5: refresh con diskFreeGb=null limpia el state a null', async () => {

    setupInvokeMock({
      recorder_get_full_state: { state: 'OFF', diskFreeGb: 50.0, activeRecordings: [] },
    })
    const { result } = renderHook(() => useGlobalRecording())
    await waitFor(() => expect(result.current.diskFreeGb).toBe(50.0))

    measureInvokeMock.mockClear()
    setupInvokeMock({
      recorder_get_full_state: { state: 'OFF', diskFreeGb: null, activeRecordings: [] },
    })
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.diskFreeGb).toBe(null)
  })

  it('FIX P0-5: refresh con diskFreeGb=undefined tambien limpia a null', async () => {

    setupInvokeMock({
      recorder_get_full_state: { state: 'OFF', diskFreeGb: 100.0, activeRecordings: [] },
    })
    const { result } = renderHook(() => useGlobalRecording())
    await waitFor(() => expect(result.current.diskFreeGb).toBe(100.0))
    measureInvokeMock.mockClear()
    setupInvokeMock({
      recorder_get_full_state: { state: 'OFF', activeRecordings: [] }, 
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

    await new Promise(r => setTimeout(r, 30))
    expect(measureInvokeMock).not.toHaveBeenCalled()
  })
})
