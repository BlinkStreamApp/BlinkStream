// Tests del hook useChannelRole (M1 / WT-20260628-13).
// Estrategia: mockeamos getChannelRole (de twitch.js) para que devuelva
// lo que queramos en cada test. Asi testeamos la cache, el fallback
// conservador y el helper isModerator sin tocar red real.
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

// Importamos DESPUES de los mocks.
const { useChannelRole, clearChannelRoleCache } = await import('./useChannelRole')

describe('useChannelRole', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearChannelRoleCache()  // CRITICO: limpia cache del modulo entre tests
    getChannelRoleMock.mockReset()
    // Default: viewer (no logueado o no mod)
    getChannelRoleMock.mockResolvedValue({ success: true, value: 'viewer' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('estado inicial sin broadcasterId/userId: role=unknown, isModerator=false', async () => {
    const { result } = renderHook(() => useChannelRole({ broadcasterId: null, userId: null }))
    // Sin IDs no hay fetch; role debe ser 'unknown' inmediatamente
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

    // Nuevo render con mismos IDs: debe usar cache y NO re-llamar
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

    // Cambiamos la respuesta del mock y llamamos refresh
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
    expect(getChannelRoleMock).toHaveBeenCalledTimes(1) // re-fetch tras limpiar
  })

  it('FIX P1-1: el cache crece acotado a 100 entradas (LRU eviction)', async () => {
    // FIX P1-1: antes el _cache Map crecia indefinidamente. Ahora tiene
    // un cap de 100 entradas con eviction LRU al insertar. Insertamos
    // 105 entradas distintas y verificamos que las 5 mas antiguas
    // fueron evictadas (re-fetch si se piden de nuevo).
    getChannelRoleMock.mockResolvedValue({ success: true, value: 'mod' })
    // Insertamos 105 entradas (broadcasterId 1..105, userId comun).
    for (let i = 1; i <= 105; i++) {
      const { unmount } = renderHook(() => useChannelRole({ broadcasterId: String(i), userId: 'u' }))
      await waitFor(() => { /* espera el fetch */ })
      unmount()
    }
    // Las primeras 5 (broadcasterId 1..5) deberian haber sido evictadas.
    // Si las pido de nuevo, deben re-fetchar.
    getChannelRoleMock.mockClear()
    for (let i = 1; i <= 5; i++) {
      const { unmount } = renderHook(() => useChannelRole({ broadcasterId: String(i), userId: 'u' }))
      await waitFor(() => { /* espera */ })
      unmount()
    }
    // FIX P1-1 verificado: 5 re-fetches (los evictados).
    expect(getChannelRoleMock).toHaveBeenCalledTimes(5)
    // Y un broadcasterId alto (100) NO fue evictado: 0 re-fetches.
    getChannelRoleMock.mockClear()
    const { unmount } = renderHook(() => useChannelRole({ broadcasterId: '100', userId: 'u' }))
    await waitFor(() => { /* espera */ })
    unmount()
    expect(getChannelRoleMock).not.toHaveBeenCalled()
    // Cleanup para no contaminar otros tests.
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
    // Verificamos que el hook pasa el signal como 3er argumento. Esto
    // cierra la race condition donde fetches viejos sobrescribian el
    // state de un canal mas nuevo al cambiar rapido.
    getChannelRoleMock.mockResolvedValue({ success: true, value: 'mod' })
    renderHook(() => useChannelRole({ broadcasterId: '111', userId: '222' }))
    await waitFor(() => expect(getChannelRoleMock).toHaveBeenCalled())
    // El 3er argumento debe ser un AbortSignal
    const lastCall = getChannelRoleMock.mock.calls[getChannelRoleMock.mock.calls.length - 1]
    expect(lastCall[0]).toBe('111') // broadcasterId
    expect(lastCall[1]).toBe('222') // userId
    expect(lastCall[2]).toBeDefined() // signal
    expect(typeof lastCall[2].aborted).toBe('boolean') // API de AbortSignal
    expect(typeof lastCall[2].addEventListener).toBe('function')
  })

  it('FIX P0-1: cambio rapido de canal aborta el fetch anterior', async () => {
    // Simulamos cambio rapido: renderizamos con bId=1, luego rerender con
    // bId=2 antes de que el primer fetch termine. El primer fetch debe
    // recibir el signal abortado (o no llegar a actualizar el state).
    let firstResolve
    const firstPromise = new Promise((resolve) => { firstResolve = resolve })
    getChannelRoleMock
      .mockImplementationOnce(() => firstPromise) // primer fetch "lento"
      .mockResolvedValue({ success: true, value: 'mod' }) // segundo fetch "rapido"

    const { result, rerender } = renderHook(
      ({ bId }) => useChannelRole({ broadcasterId: bId, userId: '99' }),
      { initialProps: { bId: '1' } },
    )
    // Antes de que termine el primer fetch, cambiamos de canal.
    rerender({ bId: '2' })
    // Esperamos a que el segundo fetch se resuelva y actualice el state.
    await waitFor(() => expect(result.current.role).toBe('mod'))
    // Ahora dejamos que el primer fetch "lento" termine DESPUES de que
    // ya abortamos su signal. El hook debe NO actualizar el state con
    // ese resultado (el if (ac.signal.aborted) return lo bloquea).
    firstResolve({ success: true, value: 'broadcaster' })
    // Esperamos un tick para que el microtask se ejecute.
    await new Promise(r => setTimeout(r, 20))
    // El state sigue siendo 'mod' (del segundo fetch), NO 'broadcaster'
    // (que era el resultado del primer fetch, ya abortado).
    expect(result.current.role).toBe('mod')
  })
})
