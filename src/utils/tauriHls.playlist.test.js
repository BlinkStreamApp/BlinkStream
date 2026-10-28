import { afterEach, describe, expect, it, vi } from 'vitest'
import Hls from 'hls.js'
import { invoke } from '@tauri-apps/api/core'
import { LIVE_HLS_TRANSPORT, prepareLivePlaylist, TauriPlaylistLoader } from './tauriHls'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
const base = 'https://video.example.ttvnw.net/live/index.m3u8?private=redacted'
const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:12\n#EXT-X-TWITCH-INFO:SERVER-TIME="1793200000.25"\n#EXTINF:2.000,\n12.ts\n#EXTINF:2.000,\n13.ts\n#EXT-X-TWITCH-PREFETCH:14.ts\n#EXT-X-TWITCH-PREFETCH:15.ts\n'
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

describe('Twitch progressive playlist transport', () => {
  it('leaves segment fetching to the built-in streaming loader', () => {
    const hls = new Hls(LIVE_HLS_TRANSPORT)
    try { expect(hls.config.progressive).toBe(true); expect(hls.config.loader).not.toBe(TauriPlaylistLoader); expect(hls.config.pLoader).toBe(TauriPlaylistLoader) }
    finally { hls.destroy() }
  })
  it('exposes two CDN prefetch segments with measured duration', () => {
    const result = prepareLivePlaylist(playlist, base, true)
    expect(result.metadata).toEqual({ prefetchCount: 2, segmentDuration: 2 })
    expect(result.text).toContain('#EXTINF:2.000000,\nhttps://video.example.ttvnw.net/live/14.ts')
    expect(result.text).toContain('#EXT-X-MEDIA-SEQUENCE:12')
    expect(result.text).not.toContain('#EXT-X-TWITCH-PREFETCH:')
    expect(result.text).toContain('#EXT-X-TARGETDURATION:6')
  })
  it('accepts a CDN used by completed segments even when the playlist has a separate host', () => {
    const text = playlist.replaceAll(/(?<!\w)(1[2-5]\.ts)/g, 'https://cdn.example.ttvnw.net/$1')
    expect(prepareLivePlaylist(text, base, true).metadata.prefetchCount).toBe(2)
  })
  it('bounds prefetch to two segments and preserves unsupported references as tags', () => {
    const input = playlist + '#EXT-X-TWITCH-PREFETCH:16.ts\n'
    const result = prepareLivePlaylist(input, base, true)
    expect(result.metadata.prefetchCount).toBe(2)
    expect(result.text).toContain('#EXT-X-TWITCH-PREFETCH:16.ts')
  })
  it.each([
    [playlist, base, false],
    [playlist, 'https://example.com/live/index.m3u8', true],
    [playlist + '#EXT-X-ENDLIST', base, true],
    [playlist + '#EXT-X-PART:DURATION=0.2,URI="part.ts"', base, true],
    [playlist.replaceAll('#EXTINF:2.000,', '#EXTINF:invalid,'), base, true],
  ])('preserves normal playback when prefetch is unsupported (%#)', (text, url, enabled) => {
    expect(prepareLivePlaylist(text, url, enabled).metadata.prefetchCount).toBe(0)
  })
  it('does not promote cross-host, insecure or malformed prefetch references', () => {
    const input = playlist.replace('14.ts', 'https://other.example/14.ts').replace('15.ts', 'http://video.example.ttvnw.net/15.ts') + '#EXT-X-TWITCH-PREFETCH:https://[\n'
    expect(prepareLivePlaylist(input, base, true).metadata.prefetchCount).toBe(0)
  })
  it.each(['https://video.example.ttvnw.net:8443/14.ts', 'https://user:pass@video.example.ttvnw.net/14.ts'])('rejects nonstandard authority in prefetch', url => {
    const text = playlist.replace('14.ts', url).replace('#EXT-X-TWITCH-PREFETCH:15.ts', '')
    expect(prepareLivePlaylist(text, base, true).metadata.prefetchCount).toBe(0)
  })
  it('preserves discontinuities, keys and relative segment paths', () => {
    const result = prepareLivePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXT-X-DISCONTINUITY\n#EXTINF:2,\n../a.ts', base)
    expect(result.text).toContain('URI="https://video.example.ttvnw.net/live/key"')
    expect(result.text).toContain('#EXT-X-DISCONTINUITY\n#EXTINF:2,\nhttps://video.example.ttvnw.net/a.ts')
  })
})

describe('native playlist lifecycle', () => {
  const context = { type: 'level', url: base }
  function start() {
    const callbacks = { onSuccess: vi.fn(), onError: vi.fn(), onTimeout: vi.fn(), onAbort: vi.fn() }
    const loader = new TauriPlaylistLoader({ progressive: true })
    loader.load(context, { timeout: 500 }, callbacks)
    return { loader, callbacks }
  }
  it('delivers converted content and only bounded public metadata', async () => {
    vi.mocked(invoke).mockResolvedValue(playlist)
    const { loader, callbacks } = start()
    await vi.waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalledOnce())
    expect(callbacks.onSuccess.mock.calls[0][3]).toEqual({ blinkstreamPlaylist: { prefetchCount: 2, segmentDuration: 2 } })
    loader.destroy()
  })
  it.each(['abort', 'destroy'])('ignores a late native response after %s', async action => {
    let finish
    vi.mocked(invoke).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { loader, callbacks } = start()
    loader[action]()
    finish(playlist)
    await Promise.resolve(); await Promise.resolve()
    expect(callbacks.onSuccess).not.toHaveBeenCalled()
    expect(callbacks.onError).not.toHaveBeenCalled()
    expect(callbacks.onAbort).toHaveBeenCalledTimes(action === 'abort' ? 1 : 0)
    loader.destroy()
  })
  it('times out once and rejects a late success', async () => {
    vi.useFakeTimers()
    let finish
    vi.mocked(invoke).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { loader, callbacks } = start()
    await vi.advanceTimersByTimeAsync(501)
    finish(playlist); await Promise.resolve()
    expect(callbacks.onTimeout).toHaveBeenCalledOnce()
    expect(callbacks.onSuccess).not.toHaveBeenCalled()
    loader.destroy()
  })
  it('reports native errors without exposing URLs or payloads', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error(base))
    const { loader, callbacks } = start()
    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalledOnce())
    expect(callbacks.onError.mock.calls[0][0].text).not.toContain('private')
    loader.destroy()
  })
})
