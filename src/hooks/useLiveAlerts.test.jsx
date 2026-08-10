

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { mockResponse } from '../test/__mocks__/response'

const sendNotificationMock = vi.fn()
const isPermissionGrantedMock = vi.fn(async () => true)
const requestPermissionMock = vi.fn(async () => 'granted')
const isFocusedMock = vi.fn(async () => false)

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: isPermissionGrantedMock,
  requestPermission: requestPermissionMock,
  sendNotification: sendNotificationMock,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(async () => ({
    isFocused: isFocusedMock,
  })),
}))

const { useLiveAlerts } = await import('./useLiveAlerts')

function buildGqlResponse(liveFlags) {
  const data = {}
  liveFlags.forEach((isLive, i) => {
    data[`a${i}`] = isLive
      ? { stream: { id: 's1', title: 'Playing', game: { displayName: 'Game' } }, profileImageURL: 'https://x/i.png' }
      : { stream: null, profileImageURL: 'https://x/i.png' }
  })
  return mockResponse({ ok: true, status: 200, json: async () => ({ data }) })
}

async function flush(ms) {
  await vi.advanceTimersByTimeAsync(ms)

  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useLiveAlerts — regresion B-1', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    sendNotificationMock.mockClear()
    isPermissionGrantedMock.mockReset()
    isPermissionGrantedMock.mockResolvedValue(true)
    requestPermissionMock.mockReset()
    requestPermissionMock.mockResolvedValue('granted')
    isFocusedMock.mockReset()
    isFocusedMock.mockResolvedValue(false)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('PRIMER check: canales que YA estaban live NO disparan notificacion (B-1 fix)', async () => {

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      buildGqlResponse([true])
    )

    renderHook(() => useLiveAlerts(['streamer_a'], 1000))

    await flush(50)   
    await flush(2000) 

    expect(sendNotificationMock).not.toHaveBeenCalled()

    expect(fetchSpy).toHaveBeenCalled()
  })

  it('un canal que sigue live entre checks NO dispara notificacion duplicada (B-1)', async () => {

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      buildGqlResponse([true])
    )

    renderHook(() => useLiveAlerts(['streamer_a'], 1000))

    await flush(50)
    await flush(2000)
    await flush(2000)

    expect(sendNotificationMock).not.toHaveBeenCalled()
  })

  it('sin favoritos: no se hace fetch ni se envia notificacion', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ ok: true })
    )
    renderHook(() => useLiveAlerts([], 1000))
    await flush(2000)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(sendNotificationMock).not.toHaveBeenCalled()
  })

  it('cleanup en unmount: no se sigue ejecutando el polling', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      buildGqlResponse([false])
    )

    const { unmount } = renderHook(() => useLiveAlerts(['streamer_a'], 1000))

    await flush(50)
    const callsBeforeUnmount = fetchSpy.mock.calls.length
    expect(callsBeforeUnmount).toBeGreaterThan(0)

    unmount()

    await flush(5000)
    expect(fetchSpy).toHaveBeenCalledTimes(callsBeforeUnmount)
  })

  it.skip('SEGUNDO check: transicion offline -> live SI dispara notificacion (requiere infra)', () => {

  })
})
