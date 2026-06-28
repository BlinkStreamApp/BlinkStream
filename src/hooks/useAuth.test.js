// Tests del hook useAuth.
// El hook hace imports dinamicos de Tauri, asi que mockeamos @tauri-apps/api/core
// para que `invoke` no toque el bridge IPC.
// Tambien mockeamos @tauri-apps/plugin-opener porque openSystemBrowser lo usa.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { mockResponse } from '../test/__mocks__/response'

// Mock del bridge Tauri: invoke es un mock que podemos reconfigurar por test.
const invokeMock = vi.fn(async () => null)
vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

// Mock del plugin opener: openUrl simplemente resuelve.
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(async () => undefined),
}))

// Importamos DESPUES de los mocks.
const { useAuth } = await import('./useAuth')

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(null) // default: keychain vacio
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('estado inicial: isLoggedIn false, sin user, loading true al montar', async () => {
    const { result } = renderHook(() => useAuth())

    // loading arranca true y pasa a false tras el init.
    expect(result.current.loading).toBe(true)
    expect(result.current.isLoggedIn).toBe(false)
    expect(result.current.user).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.authing).toBe(false)

    // Esperamos a que termine el init (loading -> false).
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Tras init sin token: sigue logged out.
    expect(result.current.isLoggedIn).toBe(false)
    expect(result.current.user).toBeNull()
  })

  it('con token en keychain al montar: isLoggedIn pasa a true', async () => {
    // Simulamos que el keychain tiene un token.
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
    expect(result.current.user.username).toBe('twitch_user') // fallback sin username guardado
    expect(result.current.getTwitchToken()).toBe('keychain_tok_abc')
  })

  it('logout limpia tokens, user y avatar', async () => {
    // Montar con sesion activa.
    invokeMock.mockImplementation(async (cmd, args) => {
      if (cmd === 'get_secret' && args?.key === 'twitch_token') return 'tok_xyz'
      return null
    })
    localStorage.setItem('blinkstream_twitch_username', 'alice')
    localStorage.setItem('blinkstream_twitch_avatar', 'https://example.com/avatar.png')

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.isLoggedIn).toBe(true)
    })

    // Ejecutamos logout.
    await act(async () => {
      await result.current.logout()
    })

    // Tras logout: sin user, sin token cacheado, storage limpio.
    expect(result.current.user).toBeNull()
    expect(result.current.isLoggedIn).toBe(false)
    expect(result.current.getTwitchToken()).toBeNull()
    expect(result.current.avatar).toBeNull()
    expect(localStorage.getItem('blinkstream_twitch_username')).toBeNull()
    expect(localStorage.getItem('blinkstream_twitch_avatar')).toBeNull()
  })

  it('loginWithToken con token invalido: marca error, no loguea', async () => {
    // fetchUserInfo hace fetch a api.twitch.tv/helix/users.
    // Mockeamos fetch para que responda 401.
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
    // fetch a helix/users devuelve un usuario.
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

    // El token guardado debe estar limpio (sin prefijo "oauth:").
    expect(result.current.getTwitchToken()).toBe('good_token_123')
    expect(result.current.isLoggedIn).toBe(true)
    expect(result.current.user.username).toBe('bob')
    expect(result.current.error).toBeNull()
  })
})
