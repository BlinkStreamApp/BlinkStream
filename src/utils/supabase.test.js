

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  getBlinkstreamToken,
  clearBlinkstreamToken,
  LS_BLINKSTREAM_JWT,
  LS_BLINKSTREAM_REFRESH,
  LS_BLINKSTREAM_EXPIRES,
  LS_BLINKSTREAM_USER_ID,
  storeBlinkstreamRefreshToken,
  refreshBlinkstreamToken,
  getBlinkstreamRefreshTokenSync,
} from './supabase'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null),
}))

describe('refresh seguro', () => {
  beforeEach(() => {
    localStorage.clear()
    clearBlinkstreamToken()
    vi.unstubAllGlobals()
  })

  it('no escribe secretos en localStorage cuando falla el almacén nativo', async () => {
    vi.stubGlobal('isTauri', true)
    vi.mocked(invoke).mockRejectedValueOnce(new Error('keychain unavailable'))
    expect(await storeBlinkstreamRefreshToken('memory-only-refresh')).toBe(false)
    expect(getBlinkstreamRefreshTokenSync()).toBe('memory-only-refresh')
    expect(localStorage.getItem(LS_BLINKSTREAM_REFRESH)).toBeNull()
  })

  it('mantiene el fallback solo en memoria y envía POST sin credenciales en la URL', async () => {
    await storeBlinkstreamRefreshToken('private-refresh-token')
    expect(localStorage.getItem(LS_BLINKSTREAM_REFRESH)).toBeNull()
    expect(getBlinkstreamRefreshTokenSync()).toBe('private-refresh-token')
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, supabase_jwt: 'new-jwt', supabase_expires_in: 3600 }) }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await refreshBlinkstreamToken()).toBe('new-jwt')
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).not.toContain('private-refresh-token')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body).refresh_token).toBe('private-refresh-token')
    expect(localStorage.getItem(LS_BLINKSTREAM_JWT)).toBeNull()
  })

  it('descarta la respuesta de refresh si se cierra sesión mientras llega', async () => {
    await storeBlinkstreamRefreshToken('private-refresh-token')
    let resolveFetch
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { resolveFetch = resolve })))
    const pending = refreshBlinkstreamToken()
    await vi.waitFor(() => expect(resolveFetch).toBeTypeOf('function'))
    clearBlinkstreamToken()
    resolveFetch({ ok: true, json: async () => ({ ok: true, supabase_jwt: 'stale-jwt', supabase_refresh_token: 'stale-refresh' }) })
    expect(await pending).toBeNull()
    expect(getBlinkstreamToken()).toBeNull()
    expect(getBlinkstreamRefreshTokenSync()).toBeNull()
  })
})

describe('getBlinkstreamToken', () => {
  beforeEach(() => {
    localStorage.clear()
    clearBlinkstreamToken()
  })

  it('devuelve null si no hay token guardado', () => {
    expect(getBlinkstreamToken()).toBeNull()
  })

  it('devuelve el JWT si esta vigente (expira en +1h)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.fake.jwt'
    const futureMs = Date.now() + 60 * 60 * 1000 
    localStorage.setItem(LS_BLINKSTREAM_JWT, jwt)
    localStorage.setItem(LS_BLINKSTREAM_EXPIRES, String(futureMs))
    expect(getBlinkstreamToken()).toBe(jwt)
  })

  it('devuelve null si el token ya expiro (mas alla del margen de 60s)', () => {
    localStorage.setItem(LS_BLINKSTREAM_JWT, 'expired.jwt')

    localStorage.setItem(LS_BLINKSTREAM_EXPIRES, String(Date.now() - 5 * 60 * 1000))
    expect(getBlinkstreamToken()).toBeNull()
  })

  it('devuelve null si el token expira en < 60s (margen de seguridad)', () => {

    localStorage.setItem(LS_BLINKSTREAM_JWT, 'about_to_expire.jwt')
    localStorage.setItem(LS_BLINKSTREAM_EXPIRES, String(Date.now() + 30 * 1000))
    expect(getBlinkstreamToken()).toBeNull()
  })
})

describe('clearBlinkstreamToken', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('limpia los 4 keys de localStorage', () => {
    localStorage.setItem(LS_BLINKSTREAM_JWT, 'j')
    localStorage.setItem(LS_BLINKSTREAM_REFRESH, 'r')
    localStorage.setItem(LS_BLINKSTREAM_EXPIRES, '0')
    localStorage.setItem(LS_BLINKSTREAM_USER_ID, 'u')

    clearBlinkstreamToken()

    expect(localStorage.getItem(LS_BLINKSTREAM_JWT)).toBeNull()
    expect(localStorage.getItem(LS_BLINKSTREAM_REFRESH)).toBeNull()
    expect(localStorage.getItem(LS_BLINKSTREAM_EXPIRES)).toBeNull()
    expect(localStorage.getItem(LS_BLINKSTREAM_USER_ID)).toBeNull()
  })

  it('dispara clear async del keychain (no espera, no rompe)', async () => {

    expect(() => clearBlinkstreamToken()).not.toThrow()

    await new Promise(r => setTimeout(r, 0))
  })
})
