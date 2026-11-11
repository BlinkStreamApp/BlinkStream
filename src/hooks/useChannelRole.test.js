import { StrictMode, createElement } from 'react'


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

it('does not expose the previous channel role while the next role is unresolved', async () => {
  clearChannelRoleCache()
  let resolve
  getChannelRoleMock.mockResolvedValueOnce({ success: true, value: 'broadcaster' })
    .mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const seen = []
  const { result, rerender } = renderHook(({ channel, broadcasterId }) => {
    const role = useChannelRole({ channel, broadcasterId, userId: 'safe-viewer' })
    seen.push({ channel, privileged: role.isModerator || role.isBroadcaster })
    return role
  }, { initialProps: { channel: 'safe-a', broadcasterId: '101' } })
  await waitFor(() => expect(result.current.isBroadcaster).toBe(true))
  rerender({ channel: 'safe-b', broadcasterId: '202' })
  expect(result.current.isModerator).toBe(false)
  expect(seen.filter(item => item.channel === 'safe-b').every(item => !item.privileged)).toBe(true)
  await act(async () => resolve({ success: true, value: 'viewer' }))
  expect(result.current.role).toBe('viewer')
})

it('rejects stale account events and unsafe details without contaminating role cache', async () => {
  clearChannelRoleCache()
  getChannelRoleMock.mockResolvedValue({ success: true, value: 'viewer' })
  const { result, rerender, unmount } = renderHook(({ userId }) => useChannelRole({ broadcasterId: '10', channel: 'alpha', userId }), { initialProps: { userId: '123' } })
  await waitFor(() => expect(result.current.role).toBe('viewer'))
  const emit = detail => act(() => window.dispatchEvent(new CustomEvent('bs:user-role-detected', { detail })))
  emit({ channel: 'alpha', userId: '123', role: 'mod' })
  expect(result.current.role).toBe('mod')
  rerender({ userId: '456' })
  await waitFor(() => expect(result.current.role).toBe('viewer'))
  emit({ channel: 'alpha', userId: '123', role: 'broadcaster' })
  expect(result.current.role).toBe('viewer')
  for (const detail of [
    { channel: 'alpha', role: 'mod' },
    { channel: 'alpha', userId: '', role: 'mod' },
    { channel: 'alpha', userId: 456, role: 'mod' },
    { channel: 'alpha', userId: '456', role: 'admin' },
    { channel: 'beta', userId: '456', role: 'mod' },
    { channel: {}, userId: '456', role: 'mod' },
    null,
  ]) {
    emit(detail)
    expect(result.current.role).toBe('viewer')
  }
  unmount()
  const cached = renderHook(() => useChannelRole({ broadcasterId: '10', channel: 'alpha', userId: '456' }))
  expect(cached.result.current.role).toBe('viewer')
  cached.unmount()
  const unresolved = renderHook(() => useChannelRole({ broadcasterId: '10', channel: 'alpha', userId: '' }))
  await waitFor(() => expect(unresolved.result.current.role).toBe('viewer'))
  emit({ channel: 'alpha', userId: '', role: 'mod' })
  expect(unresolved.result.current.role).toBe('viewer')
  unresolved.unmount()
  const same = renderHook(() => useChannelRole({ broadcasterId: '10', channel: 'alpha', userId: '456' }))
  emit({ channel: 'ALPHA', userId: '456', role: 'vip' })
  expect(same.result.current.role).toBe('vip')
  same.unmount()
  const updated = renderHook(() => useChannelRole({ broadcasterId: '10', channel: 'alpha', userId: '456' }))
  expect(updated.result.current.role).toBe('vip')
})

describe('USERSTATE frente a consultas pendientes', () => {
  const scope = { broadcasterId: '10', userId: '123', channel: 'alpha' }
  const emit = detail => act(() => window.dispatchEvent(new CustomEvent('bs:user-role-detected', { detail })))
  beforeEach(() => {
    clearChannelRoleCache()
    getChannelRoleMock.mockReset()
  })

  it.each([
    ['mod', { success: true, value: 'viewer' }],
    ['viewer', { success: true, value: 'mod' }],
    ['vip', { success: false, error: { message: 'late failure' } }],
  ])('conserva %s en dos consumidores y remount pese a respuesta tardía', async (role, late) => {
    const pending = []
    getChannelRoleMock.mockImplementation(() => new Promise(resolve => pending.push(resolve)))
    const first = renderHook(() => useChannelRole(scope))
    const second = renderHook(() => useChannelRole(scope))
    expect(first.result.current.loading).toBe(true)
    emit({ ...scope, role })
    for (const hook of [first, second]) {
      expect(hook.result.current.role).toBe(role)
      expect(hook.result.current.loading).toBe(false)
      expect(hook.result.current.error).toBeNull()
    }
    expect(getChannelRoleMock.mock.calls.every(call => call[2].aborted)).toBe(true)
    await act(async () => pending.forEach(resolve => resolve(late)))
    expect(first.result.current.role).toBe(role)
    expect(second.result.current.role).toBe(role)
    first.unmount()
    second.unmount()
    const cached = renderHook(() => useChannelRole(scope))
    expect(cached.result.current.role).toBe(role)
    expect(getChannelRoleMock).toHaveBeenCalledTimes(2)
    getChannelRoleMock.mockResolvedValueOnce({ success: true, value: 'broadcaster' })
    await act(async () => cached.result.current.refresh())
    expect(cached.result.current.role).toBe('broadcaster')
    cached.unmount()
  })

  it('eventos inválidos no cancelan consulta válida; evento aceptado limpia error', async () => {
    let resolve
    getChannelRoleMock.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const hook = renderHook(() => useChannelRole(scope))
    const signal = getChannelRoleMock.mock.calls[0][2]
    for (const detail of [null, { ...scope, userId: '456', role: 'mod' }, { ...scope, channel: 'beta', role: 'mod' }, { ...scope, role: 'admin' }]) {
      emit(detail)
      expect(signal.aborted).toBe(false)
      expect(hook.result.current.loading).toBe(true)
    }
    await act(async () => resolve({ success: false, error: { message: 'failure' } }))
    expect(hook.result.current.error).toBeTruthy()
    emit({ ...scope, role: 'mod' })
    expect(hook.result.current.error).toBeNull()
    expect(hook.result.current.loading).toBe(false)
    hook.unmount()
  })
})

it('StrictMode conserva USERSTATE y aísla cambios de cuenta, canal, caché y ámbito vacío', async () => {
  clearChannelRoleCache()
  const pending = []
  getChannelRoleMock.mockImplementation((_b, _u, signal) => new Promise(resolve => pending.push({ signal, resolve })))
  const a = { broadcasterId: '10', userId: '123', channel: 'alpha' }
  const b = { broadcasterId: '20', userId: '456', channel: 'beta' }
  const hook = renderHook(props => useChannelRole(props), {
    initialProps: a,
    wrapper: ({ children }) => createElement(StrictMode, null, children),
  })
  act(() => window.dispatchEvent(new CustomEvent('bs:user-role-detected', { detail: { ...a, role: 'mod' } })))
  expect(pending.every(request => request.signal.aborted)).toBe(true)
  hook.rerender(b)
  expect(hook.result.current.role).toBe('unknown')
  act(() => window.dispatchEvent(new CustomEvent('bs:user-role-detected', { detail: { ...a, role: 'broadcaster' } })))
  expect(pending.at(-1).signal.aborted).toBe(false)
  hook.rerender(a)
  expect(hook.result.current.role).toBe('mod')
  expect(pending.every(request => request.signal.aborted)).toBe(true)
  hook.rerender({ broadcasterId: null, userId: null, channel: null })
  await act(async () => pending.forEach(request => request.resolve({ success: true, value: 'broadcaster' })))
  expect(hook.result.current.role).toBe('unknown')
  expect(hook.result.current.loading).toBe(false)
  hook.unmount()
  const cached = renderHook(() => useChannelRole(a))
  expect(cached.result.current.role).toBe('mod')
  cached.unmount()
})