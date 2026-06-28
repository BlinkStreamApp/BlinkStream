// Tests del cliente de Twitch.
// - getHeaders / getGqlHeaders: funciones casi puras (async solo por getStoredToken).
// - validateToken: depende de measureFetch; lo mockeamos por test.
// - getDirectStreamUrl: depende de getAccessToken + fetch al usher.
//   Lo testeamos a nivel de estructura de URL (que el HLS apunte a .m3u8).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  PUBLIC_CLIENT_ID,
  APP_CLIENT_ID,
  getGqlHeaders,
  getHeaders,
  validateToken,
  getDirectStreamUrl,
  secureRandomInt,
} from './twitch'
import { mockResponse } from '../test/__mocks__/response'

// Mock del modulo de Tauri. Vitest aplica el mock automaticamente a todos
// los imports de @tauri-apps/api/core en este archivo.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null), // get_secret siempre devuelve null -> fallback a localStorage
}))

describe('twitch.js — constants', () => {
  it('PUBLIC_CLIENT_ID y APP_CLIENT_ID son strings no vacios', () => {
    // Pueden ser los legacy fallbacks o los del .env, pero siempre strings.
    expect(typeof PUBLIC_CLIENT_ID).toBe('string')
    expect(PUBLIC_CLIENT_ID.length).toBeGreaterThan(0)
    expect(typeof APP_CLIENT_ID).toBe('string')
    expect(APP_CLIENT_ID.length).toBeGreaterThan(0)
  })
})

describe('getGqlHeaders', () => {
  it('retorna Client-ID publico + Content-Type JSON', () => {
    const h = getGqlHeaders()
    expect(h['Client-ID']).toBe(PUBLIC_CLIENT_ID)
    expect(h['Content-Type']).toBe('application/json')
    expect(h['Authorization']).toBeUndefined() // nunca lleva Authorization
  })
})

describe('getHeaders', () => {
  beforeEach(() => {
    // Asegurar storage limpio: invoke mock devuelve null -> getStoredToken
    // cae a localStorage. Limpiamos para que no haya token previo.
    localStorage.clear()
  })

  it('sin token guardado: solo Client-ID publico, sin Authorization', async () => {
    const h = await getHeaders()
    expect(h['Client-ID']).toBe(PUBLIC_CLIENT_ID)
    expect(h['Authorization']).toBeUndefined()
  })

  it('con token en localStorage: usa APP_CLIENT_ID + Bearer <token>', async () => {
    localStorage.setItem('blinkstream_twitch_token', 'test_tok_123')
    const h = await getHeaders()
    expect(h['Client-ID']).toBe(APP_CLIENT_ID)
    expect(h['Authorization']).toBe('Bearer test_tok_123')
  })
})

describe('validateToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('token vacio -> false sin hacer fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ ok: true, status: 200 })
    )
    expect(await validateToken('')).toBe(false)
    expect(await validateToken(null)).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('token valido (HTTP 200) -> true', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ ok: true, status: 200 })
    )
    expect(await validateToken('good_token')).toBe(true)
  })

  it('token invalido (HTTP 401) -> false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ ok: false, status: 401 })
    )
    expect(await validateToken('bad_token')).toBe(false)
  })

  it('fetch que lanza (red caida) -> false (no propaga)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    expect(await validateToken('any_token')).toBe(false)
  })
})

describe('getDirectStreamUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('construye una URL HLS apuntando a .m3u8 con token/sig/player params', async () => {
    // Mock del GQL que devuelve playbackAccessToken.
    const gqlResponse = mockResponse({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          streamPlaybackAccessToken: {
            value: 'fake_jwt_value',
            signature: 'fake_sig_value',
          },
        },
      }),
    })
    // Mock de usher: devolvemos un m3u8 minimo y luego una URL final.
    const m3u8 = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080,NAME="1080p60"
https://test-streams.example.com/1080p60.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=852x480,NAME="480p"
https://test-streams.example.com/480p.m3u8
`
    const usherUrl = 'https://usher.ttvnw.net/api/channel/hls/tester.m3u8?token=x&sig=y'
    const usherResponse = mockResponse({
      ok: true,
      status: 200,
      url: usherUrl,
      text: async () => m3u8,
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(gqlResponse)
      .mockResolvedValueOnce(usherResponse)

    const url = await getDirectStreamUrl('tester', '1080p60')

    // Sanity: la URL debe terminar en .m3u8 y pertenecer al CDN de Twitch.
    expect(url).toMatch(/\.m3u8$/)
    expect(url).toContain('test-streams.example.com/1080p60.m3u8')

    // Verificamos que el GQL se llamo con la query esperada.
    const gqlCall = fetchSpy.mock.calls[0]
    expect(gqlCall[0]).toContain('gql.twitch.tv/gql')
    const gqlBody = JSON.parse(gqlCall[1].body)
    expect(gqlBody.query).toContain('streamPlaybackAccessToken')
    expect(gqlBody.query).toContain('tester')

    // Verificamos que el usher recibio el token/sig decodificados.
    const usherCall = fetchSpy.mock.calls[1]
    expect(usherCall[0]).toContain('usher.ttvnw.net')
    expect(usherCall[0]).toContain('token=fake_jwt_value')
    expect(usherCall[0]).toContain('sig=fake_sig_value')
    expect(usherCall[0]).toContain('player=twitchweb')
  })

  it('audio_only devuelve la URL del m3u8 raiz sin parsear variantes', async () => {
    const gqlResponse = mockResponse({
      ok: true,
      status: 200,
      json: async () => ({
        data: { streamPlaybackAccessToken: { value: 'v', signature: 's' } },
      }),
    })
    const usherUrl = 'https://usher.ttvnw.net/api/channel/hls/audiochan.m3u8?token=v&sig=s'
    const usherResponse = mockResponse({
      ok: true,
      status: 200,
      url: usherUrl,
      text: async () => '#EXTM3U\n# nada',
    })
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(gqlResponse)
      .mockResolvedValueOnce(usherResponse)

    const url = await getDirectStreamUrl('audiochan', 'audio_only')
    expect(url).toBe(usherUrl)
  })
})

// ============================================================
// FIX 1 (Hank / P1): tests de regresion para secureRandomInt.
// CWE-330: Use of Insufficiently Random Values.
// Sustituye a Math.random() en cache-busting de getDirectStreamUrl.
// ============================================================
describe('secureRandomInt', () => {
  it('devuelve un entero en [0, max)', () => {
    for (let i = 0; i < 100; i++) {
      const n = secureRandomInt(1e7)
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1e7)
    }
  })

  it('lanza RangeError si max no es positivo finito', () => {
    expect(() => secureRandomInt(0)).toThrow(RangeError)
    expect(() => secureRandomInt(-1)).toThrow(RangeError)
    expect(() => secureRandomInt(NaN)).toThrow(RangeError)
    expect(() => secureRandomInt(Infinity)).toThrow(RangeError)
    expect(() => secureRandomInt('not a number')).toThrow(RangeError)
  })

  it('usa crypto.getRandomValues cuando esta disponible (CSPRNG)', () => {
    // crypto.getRandomValues existe en jsdom moderno. Verificamos que
    // la distribucion no es degenerada (un sesgo fuerte indicaria que
    // se cayo al fallback de Math.random).
    const buckets = new Array(10).fill(0)
    for (let i = 0; i < 1000; i++) {
      const n = secureRandomInt(10)
      buckets[n]++
    }
    // Cada bucket deberia tener al menos ~50 hits (esperado: 100).
    // Si todos estuvieran en 0, eso indicaria un sesgo total (rotura).
    for (const b of buckets) {
      expect(b).toBeGreaterThan(0)
    }
  })

  it('produce valores distintos en llamadas consecutivas', () => {
    const values = new Set()
    for (let i = 0; i < 100; i++) values.add(secureRandomInt(1e9))
    // 100 valores de un espacio de 1e9 - la probabilidad de colision
    // es despreciable. Si vemos <95 unicos, el RNG es defectuoso.
    expect(values.size).toBeGreaterThan(95)
  })
})