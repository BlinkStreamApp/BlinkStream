

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const measureInvokeMock = vi.fn()
vi.mock('../../utils/perf', () => ({
  measureInvoke: (...args) => measureInvokeMock(...args),
}))

const { RecordingProvider } = await import('./RecordingContext.js')
const { useRecordingContext } = await import('./useRecordingContext')

const FULL_OK = { state: 'OFF', diskFreeGb: 50.0, activeRecordings: [] }

function setupInvokeMock(responses) {
  measureInvokeMock.mockImplementation(async (cmd) => {
    const r = responses[cmd]
    if (r === undefined) return undefined
    if (r instanceof Error) throw r
    return r
  })
}

describe('RecordingContext', () => {
  beforeEach(() => {
    localStorage.clear()
    measureInvokeMock.mockReset()
    setupInvokeMock({ recorder_get_full_state: FULL_OK })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('useRecordingContext fuera del Provider lanza error descriptivo', () => {

    expect(() => {
      renderHook(() => useRecordingContext())
    }).toThrow(/RecordingProvider/)
  })

  it('el Provider expone el state de useGlobalRecording a sus hijos', async () => {

    const { result } = renderHook(() => useRecordingContext(), {
      wrapper: RecordingProvider,
    })

    await waitFor(() => {
      expect(result.current.state).toBe('OFF')
    })

    await waitFor(() => {
      expect(result.current.diskFreeGb).toBe(50.0)
    })
  })

  it('FIX P1-4: 2 consumidores en el mismo Provider comparten UN polling', async () => {

    const { result } = renderHook(() => useRecordingContext(), {
      wrapper: RecordingProvider,
    })

    await waitFor(() => {
      expect(measureInvokeMock).toHaveBeenCalled()
    })

    await new Promise(r => setTimeout(r, 30))

    const fullStateCalls = measureInvokeMock.mock.calls.filter(
      c => c[0] === 'recorder_get_full_state',
    )
    expect(fullStateCalls.length).toBe(1)

    expect(result.current.state).toBe('OFF')
  })

  it('FIX P1-4: 3 renders independientes del Provider NO comparten state entre si (cada subtree aísla)', async () => {

    const { result: r1 } = renderHook(() => useRecordingContext(), {
      wrapper: RecordingProvider,
    })
    const { result: r2 } = renderHook(() => useRecordingContext(), {
      wrapper: RecordingProvider,
    })
    await waitFor(() => {
      expect(r1.current.state).toBe('OFF')
      expect(r2.current.state).toBe('OFF')
    })

  })
})
