

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mockResponse } from '../test/__mocks__/response'

vi.mock('./supabase', async () => {
  const actual = await vi.importActual('./supabase')
  return {
    ...actual,
    getBlinkstreamToken: vi.fn(() => 'fake.jwt.token'),
    refreshBlinkstreamToken: vi.fn(async () => null),
    clearBlinkstreamToken: vi.fn(),
  }
})

const { mergeFavorites, fetchCloudFavorites, addCloudFavorite, removeCloudFavorite, clearAuthBrokenFlag, fetchFollowedChannels } =
  await import('./favoritesSync')

beforeEach(() => {
  clearAuthBrokenFlag()
})

describe('fetchFollowedChannels', () => {
  it('recorre más de 500 follows sin truncarlos', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse({
      ok: true, json: async () => ({ data: [{ id: 'alice-id' }] }),
    }))
    for (let page = 0; page < 6; page++) {
      fetchSpy.mockResolvedValueOnce(mockResponse({ ok: true, json: async () => ({
        data: Array.from({ length: 100 }, (_, i) => ({ broadcaster_login: `channel_${page * 100 + i}` })),
        pagination: page < 5 ? { cursor: `page-${page + 1}` } : {},
      }) }))
    }
    expect(await fetchFollowedChannels('oauth:token')).toHaveLength(600)
    expect(fetchSpy.mock.calls[1][1].headers.Authorization).toBe('Bearer token')
  })

  it('no presenta errores ni páginas parciales como una lista vacía o completa', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse({ ok: true, json: async () => ({ data: [{ id: 'alice-id' }] }) }))
      .mockResolvedValueOnce(mockResponse({ ok: true, json: async () => ({ data: [{ broadcaster_login: 'a' }], pagination: { cursor: 'next' } }) }))
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 403 }))
    await expect(fetchFollowedChannels('token')).rejects.toThrow('HTTP 403')
  })

  it('aborta una consulta pendiente cuando cambia la sesión', async () => {
    const controller = new AbortController()
    let requestSignal
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      requestSignal = options.signal
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const pending = fetchFollowedChannels('token', { signal: controller.signal })
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await assertion
    expect(requestSignal.aborted).toBe(true)
  })

  it('un cursor repetido falla sin entrar en un bucle de requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse({ ok: true, json: async () => ({ data: [{ id: 'alice-id' }] }) }))
      .mockResolvedValue(mockResponse({ ok: true, json: async () => ({ data: [], pagination: { cursor: 'same' } }) }))
    await expect(fetchFollowedChannels('token')).rejects.toThrow('repitió el cursor')
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })
})

describe('fetchCloudFavorites', () => {
  beforeEach(() => {
    localStorage.clear()
    clearAuthBrokenFlag()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('devuelve [] si la respuesta no es ok (404, 500, etc)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ ok: false, status: 500 })
    )
    const result = await fetchCloudFavorites('alice')
    expect(result).toEqual([])
  })

  it('devuelve la lista de channels cuando la respuesta es ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: async () => ({ channels: ['streamer_a', 'streamer_b'] }),
      })
    )
    const result = await fetchCloudFavorites('alice')
    expect(result).toEqual(['streamer_a', 'streamer_b'])
  })

  it('devuelve [] si username es vacio (sin hacer fetch)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ ok: true })
    )
    expect(await fetchCloudFavorites('')).toEqual([])
    expect(await fetchCloudFavorites(null)).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('addCloudFavorite / removeCloudFavorite', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('addCloudFavorite hace un POST a blinkstream-data con action=fav_add', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ ok: true, status: 200 })
    )
    await addCloudFavorite('alice', 'chan1')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toContain('blinkstream-data')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body).toEqual({ action: 'fav_add', username: 'alice', channel: 'chan1' })
  })

  it('no hace nada si username es vacio (no llama fetch)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ ok: true })
    )
    await addCloudFavorite('', 'chan1')
    await addCloudFavorite(null, 'chan1')
    await removeCloudFavorite('', 'chan1')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('mergeFavorites', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()

    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('con 0 locales no llama a addCloudFavorite (no hay nada que subir)', async () => {

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: async () => ({ channels: ['cloud_a', 'cloud_b'] }),
      })
    )

    const merged = await mergeFavorites([], 'alice')

    expect(merged.sort()).toEqual(['cloud_a', 'cloud_b'])

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const call = globalThis.fetch.mock.calls[0]
    expect(call[0]).toContain('action=list')
  })

  it('con 25 locales y cloud vacio: hace 25 POSTs (uno por favorito local)', async () => {

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockResolvedValueOnce(
      mockResponse({
        ok: true,
        status: 200,
        json: async () => ({ channels: [] }),
      })
    )

    for (let i = 0; i < 25; i++) {
      fetchSpy.mockResolvedValueOnce(mockResponse({ ok: true, status: 200 }))
    }

    const local = Array.from({ length: 25 }, (_, i) => `chan_${i}`)
    const merged = await mergeFavorites(local, 'alice')

    expect(fetchSpy).toHaveBeenCalledTimes(26)

    expect(merged.length).toBe(25)
    expect(new Set(merged)).toEqual(new Set(local))

  })

  it('union correcta: cloud + local sin duplicados', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          status: 200,
          json: async () => ({ channels: ['a', 'b', 'c'] }), 
        })
      )

      .mockResolvedValue(mockResponse({ ok: true, status: 200 }))

    const merged = await mergeFavorites(['c', 'd', 'e'], 'alice')

    expect(merged.sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('no hace nada si username es vacio (degrada a local)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ ok: true })
    )
    const local = ['a', 'b']
    const result = await mergeFavorites(local, '')
    expect(result).toEqual(local)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
