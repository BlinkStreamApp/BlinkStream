import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Hls from 'hls.js'
import { attachLivePlaylistBootstrap } from './tauriHls'

function fixture() {
  const listeners = new Map()
  const hls = {
    started: true,
    on(event, handler) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(handler) },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    trigger: vi.fn((event, data) => { for (const handler of listeners.get(event) || []) handler(event, data) }),
  }
  const video = new EventTarget()
  Object.assign(video, { paused: false, seeking: false, currentTime: 26, playbackRate: 1 })
  const data = { level: 0, id: 0, levelInfo: { uri: 'https://video.example.ttvnw.net/live.m3u8' },
    details: { live: true, targetduration: 6, totalduration: 32, requestScheduled: 8000 },
    networkDetails: { blinkstreamPlaylist: { prefetchCount: 2, segmentDuration: 2 } } }
  return { hls, video, data }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('prefetch startup playlist refresh', () => {
  it('requests the second playlist at the observed segment cadence, without seeking or restarting playback', () => {
    const { hls, video, data } = fixture()
    const dispose = attachLivePlaylistBootstrap(hls, video)
    hls.trigger(Hls.Events.LEVEL_LOADED, data)
    vi.advanceTimersByTime(1999)
    expect(hls.trigger.mock.calls.filter(([event]) => event === Hls.Events.LEVEL_LOADING)).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(hls.trigger).toHaveBeenCalledWith(Hls.Events.LEVEL_LOADING, expect.objectContaining({ url: data.levelInfo.uri, level: 0, levelInfo: data.levelInfo }))
    expect(data.details.requestScheduled).toBe(performance.now())
    expect(data.details.targetduration).toBe(6)
    expect(video.currentTime).toBe(26)
    expect(video.playbackRate).toBe(1)
    hls.trigger(Hls.Events.LEVEL_LOADED, data)
    vi.advanceTimersByTime(30000)
    expect(hls.trigger.mock.calls.filter(([event]) => event === Hls.Events.LEVEL_LOADING)).toHaveLength(1)
    dispose()
  })
  it.each(['pause', 'seeking', 'normal-load', 'destroy', 'stop', 'DVR', 'dispose'])('cancels obsolete bootstrap on %s', reason => {
    const { hls, video, data } = fixture()
    let follow = true
    const dispose = attachLivePlaylistBootstrap(hls, video, () => follow)
    hls.trigger(Hls.Events.LEVEL_LOADED, data)
    if (reason === 'pause') video.dispatchEvent(new Event(reason))
    if (reason === 'seeking') video.seeking = true
    if (reason === 'normal-load') hls.trigger(Hls.Events.LEVEL_LOADING, {})
    if (reason === 'destroy') hls.trigger(Hls.Events.DESTROYING, {})
    if (reason === 'stop') hls.started = false
    if (reason === 'DVR') follow = false
    if (reason === 'dispose') dispose()
    hls.trigger.mockClear()
    vi.advanceTimersByTime(10000)
    expect(hls.trigger).not.toHaveBeenCalled()
    dispose()
  })
  it('allows the normal initial media seek to complete before refreshing', () => {
    const { hls, video, data } = fixture()
    const dispose = attachLivePlaylistBootstrap(hls, video)
    hls.trigger(Hls.Events.LEVEL_LOADED, data)
    video.seeking = true
    video.dispatchEvent(new Event('seeking'))
    vi.advanceTimersByTime(100)
    video.seeking = false
    video.dispatchEvent(new Event('seeked'))
    vi.advanceTimersByTime(1900)
    expect(hls.trigger.mock.calls.filter(([event]) => event === Hls.Events.LEVEL_LOADING)).toHaveLength(1)
    dispose()
  })
  it('leaves network failure recovery to HLS', () => {
    const { hls, video, data } = fixture()
    const dispose = attachLivePlaylistBootstrap(hls, video)
    hls.trigger(Hls.Events.LEVEL_LOADED, data)
    hls.trigger(Hls.Events.ERROR, { fatal: true })
    hls.trigger.mockClear()
    vi.advanceTimersByTime(10000)
    expect(hls.trigger).not.toHaveBeenCalled()
    dispose()
  })
  it.each(['VOD', 'no-prefetch', 'short-window', 'normal-duration', 'invalid-duration'])('preserves ordinary scheduling for %s', scenario => {
    const { hls, video, data } = fixture()
    if (scenario === 'VOD') data.details.live = false
    if (scenario === 'no-prefetch') data.networkDetails.blinkstreamPlaylist.prefetchCount = 0
    if (scenario === 'short-window') data.details.totalduration = 20
    if (scenario === 'normal-duration') data.details.targetduration = 2
    if (scenario === 'invalid-duration') data.networkDetails.blinkstreamPlaylist.segmentDuration = NaN
    const dispose = attachLivePlaylistBootstrap(hls, video)
    hls.trigger(Hls.Events.LEVEL_LOADED, data)
    hls.trigger.mockClear()
    vi.advanceTimersByTime(10000)
    expect(hls.trigger).not.toHaveBeenCalled()
    dispose()
  })
})

describe('actual HLS playlist scheduling', () => {
  it.each([false, true])('keeps subsequent refreshes at segment cadence with bootstrap=%s', async enabled => {
    const requests = []
    class PlaylistLoader extends Hls.DefaultConfig.loader {
      load(context, _config, callbacks) {
        const start = performance.now()
        requests.push({ type: context.type, start })
        const sequence = Math.floor(start / 2000)
        const text = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:' + sequence + '\n'
          + Array.from({ length: 16 }, (_, i) => '#EXTINF:2.000,\nhttps://video.example.ttvnw.net/' + (sequence + i) + '.ts\n').join('')
        this.context = context
        this.task = setTimeout(() => {
          this.stats.loading = { start, first: performance.now(), end: performance.now() }
          this.stats.loaded = this.stats.total = text.length
          callbacks.onSuccess({ url: context.url, data: text, code: 200 }, this.stats, context,
            { blinkstreamPlaylist: { prefetchCount: 2, segmentDuration: 2 } })
        }, 10)
      }
      destroy() { clearTimeout(this.task); super.destroy() }
    }
    const hls = new Hls({ loader: PlaylistLoader, autoStartLoad: true })
    const video = new EventTarget()
    Object.assign(video, { paused: false, seeking: false })
    const dispose = enabled ? attachLivePlaylistBootstrap(hls, video) : () => {}
    try {
      hls.loadSource('https://video.example.ttvnw.net/live.m3u8')
      await vi.advanceTimersByTimeAsync(12000)
      const reloads = requests.filter(item => item.type === 'level')
      expect(reloads.length).toBeGreaterThanOrEqual(enabled ? 5 : 1)
      expect(reloads[0].start).toBe(enabled ? 2010 : 8000)
      if (enabled) expect(reloads[1].start - reloads[0].start).toBe(2000)
      expect(hls.latestLevelDetails.targetduration).toBe(6)
    } finally { dispose(); hls.destroy() }
  })
})
