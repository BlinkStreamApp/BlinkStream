

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const getChannelRoleMock = vi.fn()
vi.mock('../utils/twitch', async () => {
  const actual = await vi.importActual('../utils/twitch')
  return {
    ...actual,
    getChannelRole: (...args) => getChannelRoleMock(...args),
  }
})

const { useChannelRole, clearChannelRoleCache } = await import('./useChannelRole')

describe('useChannelRole', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearChannelRoleCache()  
    getChannelRoleMock.mockReset()

    getChannelRoleMock.mockResolvedValue({ success: true, value: 'viewer' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('estado inicial sin broadcasterId/userId: role=unknown, isModerator=false', async () => {
    const { result } = renderHook(() => useChannelRole({ broadcasterId: null, userId: null }))

    expect(result.current.role).toBe('unknown')
    expect(result.current.isModerator).toBe(false)
    expect(result.current.isBroadcaster).toBe(false)
    expect(result.current.isVip).toBe(false)
    expect(result.current.loading).toBe(false)
  })

  it('broadcaster: detecta role=broadcaster, isModerator=true', async () => {
    getChannelRoleMock.mockResolvedValue({ success: true, value: 'broadcaster' })
    const { result } = renderHook(() => useChannelRole({ broadcasterId: '100', userId: '200' }))
    await waitFor(() => expect(result.current.role).toBe('broadcaster'))
    expect(result.current.isModerator).toBe(true)
    expect(result.current.isBroadcaster).toBe(true)
    expect(result.current.loading).toBe(false)
  })

  it('mod: detecta role=mod, isModerator=true', async () => {
    getChannelRoleMock.mockResolvedValue({ success: true, value: 'mod' })
    const { result } = renderHook(() => useChannelRole({ broadcasterId: '100', userId: '200' }))
    await waitFor(() => expect(result.current.role).toBe('mod'))
    expect(result.current.isModerator).toBe(true)
    expect(result.current.isBroadcaster).toBe(false)
  })

  it('viewer: role=viewer, isModerator=false', async () => {
    getChannelRoleMock.mockResolvedValue({ success: true, value: 'viewer' })
    const { result } = renderHook(() => useChannelRole({ broadcasterId: '100', userId: '200' }))
    await waitFor(() => expect(result.current.role).toBe('viewer'))
    expect(result.current.isModerator).toBe(false)
  })

  it('vip: role=vip, isModerator=false pero isVip=true', async () => {
    getChannelRoleMock.mockResolvedValue({ success: true, value: 'vip' })
    const { result } = renderHook(() => useChannelRole({ broadcasterId: '100', userId: '200' }))
    await waitFor(() => expect(result.current.role).toBe('vip'))
    expect(result.current.isModerator).toBe(false)
    expect(result.current.isVip).toBe(true)
  })

  it('API falla: asume role=viewer como fallback conservador, expone error', async () => {
    getChannelRoleMock.mockResolvedValue({ success: false, error: { message: 'Network down', code: 'MOD_ACTION_FAILED' } })
    const { result } = renderHook(() => useChannelRole({ broadcasterId: '100', userId: '200' }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.role).toBe('viewer')
    expect(result.current.isModerator).toBe(false)
    expect(result.current.error).toBeTruthy()
    expect(result.current.error.message).toBe('Network down')
  })

  it('cache: segunda llamada con mismos IDs no re-fetchea', async () => {
    getChannelRoleMock.mockResolvedValue({ success: true, value: 'mod' })
    const { result: r1, unmount } = renderHook(() => useChannelRole({ broadcasterId: '500', userId: '600' }))
    await waitFor(() => expect(r1.current.role).toBe('mod'))
    expect(getChannelRoleMock).toHaveBeenCalledTimes(1)
    unmount()

    getChannelRoleMock.mockClear()
    const { result: r2 } = renderHook(() => useChannelRole({ broadcasterId: '500', userId: '600' }))
    await waitFor(() => expect(r2.current.role).toBe('mod'))
    expect(getChannelRoleMock).not.toHaveBeenCalled()
  })

  it('refresh() limpia cache y re-fetchea', async () => {
    getChannelRoleMock.mockResolvedValueOnce({ success: true, value: 'mod' })
    const { result } = renderHook(() => useChannelRole({ broadcasterId: '700', userId: '800' }))
    await waitFor(() => expect(result.current.role).toBe('mod'))
    expect(getChannelRoleMock).toHaveBeenCalledTimes(1)

    getChannelRoleMock.mockResolvedValueOnce({ success: true, value: 'vip' })
    await act(async () => { result.current.refresh() })
    await waitFor(() => expect(result.current.role).toBe('vip'))
    expect(getChannelRoleMock).toHaveBeenCalledTimes(2)
  })

  it('clearChannelRoleCache() limpia el cache del modulo', async () => {
    getChannelRoleMock.mockResolvedValue({ success: true, value: 'mod' })
    const { result: r1, unmount } = renderHook(() => useChannelRole({ broadcasterId: '900', userId: '1000' }))
    await waitFor(() => expect(r1.current.role).toBe('mod'))
    unmount()
    clearChannelRoleCache()
    getChannelRoleMock.mockClear()

    const { result: r2 } = renderHook(() => useChannelRole({ broadcasterId: '900', userId: '1000' }))
    await waitFor(() => expect(r2.current.role).toBe('mod'))
    expect(getChannelRoleMock).toHaveBeenCalledTimes(1) 
  })

  it('FIX P1-1: el cache crece acotado a 100 entradas (LRU eviction)', async () => {

    getChannelRoleMock.mockResolvedValue({ success: true, value: 'mod' })

    for (let i = 1; i <= 105; i++) {
      const { unmount } = renderHook(() => useChannelRole({ broadcasterId: String(i), userId: 'u' }))
      await waitFor(() => {  })
      unmount()
    }

    getChannelRoleMock.mockClear()
    for (let i = 1; i <= 5; i++) {
      const { unmount } = renderHook(() => useChannelRole({ broadcasterId: String(i), userId: 'u' }))
      await waitFor(() => {  })
      unmount()
    }

    expect(getChannelRoleMock).toHaveBeenCalledTimes(5)

    getChannelRoleMock.mockClear()
    const { unmount } = renderHook(() => useChannelRole({ broadcasterId: '100', userId: 'u' }))
    await waitFor(() => {  })
    unmount()
    expect(getChannelRoleMock).not.toHaveBeenCalled()

    clearChannelRoleCache()
  })

  it('cambio de channel prop dispara nuevo fetch', async () => {
    getChannelRoleMock.mockResolvedValue({ success: true, value: 'mod' })
    const { result, rerender } = renderHook(
      ({ channel, bId }) => useChannelRole({ broadcasterId: bId, userId: '11', channel }),
      { initialProps: { channel: 'a', bId: '111' } },
    )
    await waitFor(() => expect(result.current.role).toBe('mod'))
    expect(getChannelRoleMock).toHaveBeenCalledTimes(1)
    rerender({ channel: 'b', bId: '222' })
    await waitFor(() => expect(getChannelRoleMock).toHaveBeenCalledTimes(2))
  })

  it('FIX P0-1: propaga el AbortSignal del hook al helper getChannelRole', async () => {

    getChannelRoleMock.mockResolvedValue({ success: true, value: 'mod' })
    renderHook(() => useChannelRole({ broadcasterId: '111', userId: '222' }))
    await waitFor(() => expect(getChannelRoleMock).toHaveBeenCalled())

    const lastCall = getChannelRoleMock.mock.calls[getChannelRoleMock.mock.calls.length - 1]
    expect(lastCall[0]).toBe('111') 
    expect(lastCall[1]).toBe('222') 
    expect(lastCall[2]).toBeDefined() 
    expect(typeof lastCall[2].aborted).toBe('boolean') 
    expect(typeof lastCall[2].addEventListener).toBe('function')
  })

  it('FIX P0-1: cambio rapido de canal aborta el fetch anterior', async () => {

    let firstResolve
    const firstPromise = new Promise((resolve) => { firstResolve = resolve })
    getChannelRoleMock
      .mockImplementationOnce(() => firstPromise) 
      .mockResolvedValue({ success: true, value: 'mod' }) 

    const { result, rerender } = renderHook(
      ({ bId }) => useChannelRole({ broadcasterId: bId, userId: '99' }),
      { initialProps: { bId: '1' } },
    )

    rerender({ bId: '2' })

    await waitFor(() => expect(result.current.role).toBe('mod'))

    firstResolve({ success: true, value: 'broadcaster' })

    await new Promise(r => setTimeout(r, 20))

    expect(result.current.role).toBe('mod')
  })
})
