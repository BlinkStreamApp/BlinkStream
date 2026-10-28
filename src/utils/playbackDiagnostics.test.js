import { describe, it, expect, vi } from 'vitest'
import Hls from 'hls.js'
import { createPlaybackProbe } from './playbackDiagnostics'

function fixture(ranges = [[0, 2], [5, 9]]) {
  const video = new EventTarget()
  let counts = { totalVideoFrames: 100, droppedVideoFrames: 10 }
  Object.assign(video, { videoWidth: 2560, videoHeight: 1440, currentTime: 3, playbackRate: 1, paused: false, seeking: false, readyState: 3,
    buffered: { length: ranges.length, start: i => ranges[i][0], end: i => ranges[i][1] }, getVideoPlaybackQuality: () => counts })
  const handlers = new Map()
  const hls = { on: (name, handler) => handlers.set(name, handler), off: vi.fn(), streamController: { transmuxer: { workerContext: {} } } }
  let now = 0
  return { video, hls, handlers, tick: (t, total, dropped) => { now = t; counts = { totalVideoFrames: total, droppedVideoFrames: dropped } }, probe: createPlaybackProbe(video, hls, () => now) }
}

describe('bounded playback diagnostics', () => {
  it('does not count a future buffered range as playable data at a gap', () => {
    const { video, probe } = fixture()
    expect(probe.sample().bufferAhead).toBe(0)
    video.currentTime = 6
    expect(probe.sample().bufferAhead).toBe(3)
    probe.stop()
  })
  it('reports presented FPS and dropped-frame deltas, not nominal 60fps', () => {
    const { video, probe, tick } = fixture([[0, 30]])
    expect(probe.sample().presentedFps).toBeNull()
    tick(1000, 160, 30)
    video.currentTime = 4
    expect(probe.sample()).toMatchObject({ presentedFps: 40, droppedInterval: 20, mediaAdvance: 1, workerActive: true })
    tick(2000, 0, 0)
    expect(probe.sample().presentedFps).toBeNull()
    probe.stop()
  })
  it('captures codec and events without recording URLs, tokens or error payloads', () => {
    const { video, hls, probe, handlers } = fixture()
    handlers.get(Hls.Events.BUFFER_CODECS)(null, { video: { codec: 'hvc1.1.6.L150.90' } })
    handlers.get(Hls.Events.ERROR)(null, { details: 'bufferStalledError', url: 'https://secret.invalid/?token=secret' })
    video.dispatchEvent(new Event('waiting'))
    for (let i = 0; i < 40; i++) probe.sample()
    const report = JSON.parse(probe.export())
    expect(report.samples).toHaveLength(30)
    expect(report.samples.at(-1)).toMatchObject({ codec: 'hvc1.1.6.L150.90', lastError: 'bufferStalledError', events: { waiting: 1 } })
    expect(probe.export()).not.toMatch(/secret|https:|token|Authorization/)
    probe.stop()
    expect(hls.off).toHaveBeenCalledTimes(3)
    expect(probe.sample()).toBeNull()
  })

  it('captures only numeric segment and sync targets to diagnose repeated seeks', () => {
    const { hls, probe } = fixture()
    hls.latestLevelDetails = { targetduration: 6, url: 'https://secret.invalid/token' }
    hls.targetLatency = 6.5
    hls.liveSyncPosition = 64
    expect(probe.sample()).toMatchObject({ targetDuration: 6, targetLatency: 6.5, liveSyncPosition: 64 })
    expect(probe.export()).not.toMatch(/secret|https:|token/)
    probe.stop()
  })
  it('keeps raw HLS latency separate from the source timestamp measurement', () => {
    const { video, hls, handlers, probe } = fixture()
    hls.playingDate = new Date(Date.now() - 4200)
    hls.latency = 8.1
    hls.config = { progressive: true }
    handlers.get(Hls.Events.LEVEL_LOADED)(null, { networkDetails: { blinkstreamPlaylist: { prefetchCount: 2, url: 'https://secret.invalid' } } })
    expect(probe.sample()).toMatchObject({ latency: 8.1, sourceLatency: expect.closeTo(4.2, 1), prefetchCount: 2, playlistLoads: 1, progressive: true })
    hls.playingDate = new Date(Date.now() + 60000)
    expect(probe.sample().sourceLatency).toBeNull()
    hls.playingDate = new Date('invalid')
    expect(probe.sample().sourceLatency).toBeNull()
    expect(probe.export()).not.toMatch(/https:|secret/)
    probe.stop()
  })
})
