import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHeaders } from './twitch'
import { fetchCategories, fetchCategoryStreams } from './categories'

vi.mock('./twitch', () => ({ getHeaders: vi.fn() }))
const game = { id: '1', name: 'AION 2' }
const response = data => ({ ok: true, json: async () => ({ data, pagination: { cursor: 'next' } }) })

describe('category Helix reads', () => {
  beforeEach(() => {
    vi.mocked(getHeaders).mockResolvedValue({ Authorization: 'Bearer test' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response([game]))
  })
  afterEach(() => vi.useRealTimers())
  it('paginates popular categories using existing authentication', async () => {
    expect(await fetchCategories({ cursor: 'page+2' })).toEqual({ items: [game], cursor: 'next' })
    const [url, options] = fetch.mock.calls[0]
    expect(new URL(url).pathname).toBe('/helix/games/top')
    expect(new URL(url).searchParams.get('after')).toBe('page+2')
    expect(options.headers.Authorization).toBe('Bearer test')
  })
  it('encodes category searches rather than filtering only popular games', async () => {
    await fetchCategories({ query: '  AION & 2  ' })
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe('/helix/search/categories')
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('query')).toBe('AION & 2')
  })
  it('filters live streams by category, language and cursor at Twitch', async () => {
    fetch.mockResolvedValue(response([{ id: 's', user_login: 'channel' }]))
    await fetchCategoryStreams({ categoryId: '1', language: 'es', cursor: 'next' })
    const params = new URL(fetch.mock.calls[0][0]).searchParams
    expect(Object.fromEntries(params)).toEqual({ game_id: '1', first: '20', language: 'es', after: 'next' })
  })
  it.each([[401, 'auth'], [429, 'rate'], [503, 'network']])('keeps HTTP %s distinct from empty results', async (status, code) => {
    fetch.mockResolvedValue({ ok: false, status })
    await expect(fetchCategories()).rejects.toMatchObject({ code })
  })
  it('rejects malformed payloads', async () => {
    fetch.mockResolvedValue(response([{ id: '1' }]))
    await expect(fetchCategories()).rejects.toMatchObject({ code: 'invalid' })
  })
  it('cancels while awaiting authentication without starting a late fetch', async () => {
    let resolveHeaders
    getHeaders.mockReturnValue(new Promise(resolve => { resolveHeaders = resolve }))
    const controller = new AbortController()
    const pending = fetchCategories({ signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    resolveHeaders({})
    await Promise.resolve()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('times out even when authentication never completes', async () => {
    vi.useFakeTimers()
    getHeaders.mockReturnValue(new Promise(() => {}))
    const pending = fetchCategories()
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(8000)
    await assertion
    expect(fetch).not.toHaveBeenCalled()
  })
})
