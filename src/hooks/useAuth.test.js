

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { mockResponse } from '../test/__mocks__/response'

const invokeMock = vi.fn(async () => null)
vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(async () => undefined),
}))

const { useAuth } = await import('./useAuth')

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(null) 
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('estado inicial: isLoggedIn false, sin user, loading true al montar', async () => {
    const { result } = renderHook(() => useAuth())

    expect(result.current.loading).toBe(true)
    expect(result.current.isLoggedIn).toBe(false)
    expect(result.current.user).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.authing).toBe(false)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isLoggedIn).toBe(false)
    expect(result.current.user).toBeNull()
  })

  it('con token en keychain al montar: isLoggedIn pasa a true', async () => {

    invokeMock.mockImplementation(async (cmd, args) => {
      if (cmd === 'get_secret' && args?.key === 'twitch_token') {
        return 'keychain_tok_abc'
      }
      return null
    })

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isLoggedIn).toBe(true)
    expect(result.current.user).not.toBeNull()
    expect(result.current.user.username).toBe('twitch_user') 
    expect(result.current.getTwitchToken()).toBe('keychain_tok_abc')
  })

  it('logout limpia tokens, user y avatar', async () => {

    invokeMock.mockImplementation(async (cmd, args) => {
      if (cmd === 'get_secret' && args?.key === 'twitch_token') return 'tok_xyz'
      return null
    })
    localStorage.setItem('blinkstream_twitch_username', 'alice')
    localStorage.setItem('blinkstream_twitch_avatar', 'https://example.com/avatar.png')
    localStorage.setItem('bs.twitch.viewer_userid', 'alice-id')
    localStorage.setItem('blinkstream_favorites', '["alice_follow"]')
    localStorage.setItem('blinkstream_recent', '["alice_recent"]')
    sessionStorage.setItem('blinkstream_live_status_v1', 'cached_status')
    sessionStorage.setItem('blinkstream_logos_v1', 'cached_logos')

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.isLoggedIn).toBe(true)
    })

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.user).toBeNull()
    expect(result.current.isLoggedIn).toBe(false)
    expect(result.current.getTwitchToken()).toBeNull()
    expect(result.current.avatar).toBeNull()
    expect(localStorage.getItem('blinkstream_twitch_username')).toBeNull()
    expect(localStorage.getItem('blinkstream_twitch_avatar')).toBeNull()
    expect(localStorage.getItem('bs.twitch.viewer_userid')).toBeNull()
    expect(localStorage.getItem('blinkstream_favorites')).toBeNull()
    expect(JSON.parse(localStorage.getItem('blinkstream_favorites_legacy')).owner).toBe('alice')
    expect(localStorage.getItem('blinkstream_recent')).toBeNull()
    expect(sessionStorage.getItem('blinkstream_live_status_v1')).toBeNull()
    expect(sessionStorage.getItem('blinkstream_logos_v1')).toBeNull()
  })

  it('una restauración pendiente no recupera la sesión después de logout', async () => {
    let resolveSecret
    invokeMock.mockImplementation(cmd => cmd === 'get_secret'
      ? new Promise(resolve => { resolveSecret = resolve }) : Promise.resolve(null))
    const { result } = renderHook(() => useAuth())
    await act(async () => { await result.current.logout() })
    await act(async () => { resolveSecret('old-token') })
    expect(result.current.isLoggedIn).toBe(false)
    expect(result.current.getTwitchToken()).toBeNull()
    expect(result.current.user).toBeNull()
  })

  it('un login pendiente no vuelve a guardar identidad después de cerrar sesión', async () => {
    let resolveValidate
    vi.spyOn(globalThis, 'fetch').mockImplementation(url => url.includes('/validate')
      ? new Promise(resolve => { resolveValidate = resolve })
      : Promise.resolve(mockResponse({ ok: true, json: async () => ({ data: [{ login: 'old_alice', id: 'old-id' }] }) })))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    let loginPromise
    act(() => { loginPromise = result.current.loginWithToken('old-token') })
    await act(async () => { await result.current.logout() })
    await act(async () => {
      resolveValidate(mockResponse({ ok: true, json: async () => ({ login: 'old_alice', user_id: 'old-id', client_id: 'client' }) }))
      await loginPromise
    })
    expect(result.current.isLoggedIn).toBe(false)
    expect(localStorage.getItem('blinkstream_twitch_username')).toBeNull()
    expect(localStorage.getItem('bs.twitch.viewer_userid')).toBeNull()
    expect(invokeMock).not.toHaveBeenCalledWith('store_secret', expect.anything())
  })

  it('logout espera a una escritura nativa pendiente y después elimina el token', async () => {
    let resolveStore
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse({
      ok: true, json: async () => ({ data: [{ login: 'alice', id: 'alice-id' }] }),
    }))
    invokeMock.mockImplementation(cmd => cmd === 'store_secret'
      ? new Promise(resolve => { resolveStore = resolve }) : Promise.resolve(null))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    let loginPromise
    act(() => { loginPromise = result.current.loginWithToken('token') })
    await waitFor(() => expect(resolveStore).toBeTypeOf('function'))
    let logoutPromise
    act(() => { logoutPromise = result.current.logout() })
    expect(invokeMock).not.toHaveBeenCalledWith('delete_secret', { key: 'twitch_token' })
    await act(async () => { resolveStore(); await loginPromise; await logoutPromise })
    expect(invokeMock).toHaveBeenCalledWith('delete_secret', { key: 'twitch_token' })
    expect(result.current.isLoggedIn).toBe(false)
  })

  it('loginWithToken con token invalido: marca error, no loguea', async () => {

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ ok: false, status: 401 })
    )

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.loginWithToken('bad_token')
    })

    expect(result.current.user).toBeNull()
    expect(result.current.isLoggedIn).toBe(false)
    expect(result.current.error).toBeTruthy()
  })

  it('loginWithToken con token valido: guarda y autentica', async () => {

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{
            login: 'bob',
            display_name: 'BobTheBuilder',
            profile_image_url: 'https://example.com/bob.png',
          }],
        }),
      })
    )

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.loginWithToken('oauth:good_token_123')
    })

    expect(result.current.getTwitchToken()).toBe('good_token_123')
    expect(result.current.isLoggedIn).toBe(true)
    expect(result.current.user.username).toBe('bob')
    expect(result.current.error).toBeNull()
  })
})
