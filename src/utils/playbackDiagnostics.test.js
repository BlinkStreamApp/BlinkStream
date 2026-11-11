import { describe, it, expect, vi } from 'vitest'
import Hls from 'hls.js'
import { createPlaybackProbe } from './playbackDiagnostics'

function fixture(ranges = [[0, 2], [5, 9]], readAudioDiagnostics) {
  const video = new EventTarget()
  let counts = { totalVideoFrames: 100, droppedVideoFrames: 10 }
  Object.assign(video, { videoWidth: 2560, videoHeight: 1440, currentTime: 3, playbackRate: 1, paused: false, seeking: false, readyState: 3,
    buffered: { length: ranges.length, start: i => ranges[i][0], end: i => ranges[i][1] }, getVideoPlaybackQuality: () => counts })
  const handlers = new Map()
  const hls = { on: (name, handler) => handlers.set(name, handler), off: vi.fn(), streamController: { transmuxer: { workerContext: {} } } }
  let now = 0
  return { video, hls, handlers, tick: (t, total, dropped) => { now = t; counts = { totalVideoFrames: total, droppedVideoFrames: dropped } }, probe: createPlaybackProbe(video, hls, () => now, undefined, readAudioDiagnostics) }
}

describe('bounded playback diagnostics', () => {
  it('distinguishes a frozen audio clock and separate track gaps without exporting provider payloads', () => {
    const { probe, handlers, tick } = fixture([[0, 30]], () => ({ state: 'suspended', currentTime: 12, baseLatency: 0.02, outputLatency: Infinity, token: 'private' }))
    const range = (start, end) => ({ length: 1, start: () => start, end: () => end })
    handlers.get(Hls.Events.BUFFER_CREATED)(null, { tracks: {
      audio: { buffer: { buffered: range(0, 9), updating: false, timestampOffset: 0 }, url: 'https://private.invalid' },
      video: { buffer: { buffered: range(0, 20), updating: true, timestampOffset: 2 } },
      secret: { buffer: {} },
    } })
    tick(1000, 100, 10)
    expect(probe.sample().pipeline).toMatchObject({ ageMs: 1000, surface: 'normal', audioClock: { state: 'suspended', currentTime: 12, baseLatency: 0.02, outputLatency: null }, tracks: {
      audio: { ranges: [[0, 9]], updating: false, timestampOffset: 0 }, video: { ranges: [[0, 20]], updating: true, timestampOffset: 2 },
    } })
    expect(probe.export()).not.toMatch(/token|private|https:|secret/)
    probe.stop()
  })

  it('bounds track ranges and tolerates detached buffers or unavailable audio diagnostics', () => {
    const { probe, handlers } = fixture(undefined, () => { throw Error('private') })
    handlers.get(Hls.Events.BUFFER_CREATED)(null, { tracks: {
      audio: { buffer: { get buffered() { throw Error('detached') } } },
      video: { buffer: { buffered: { length: 100, start: i => i * 2, end: i => i * 2 + 1 } } },
    } })
    const { pipeline } = probe.sample()
    expect(pipeline.audioClock).toBeNull()
    expect(pipeline.tracks.audio.ranges).toBeNull()
    expect(pipeline.tracks.video.ranges).toHaveLength(8)
    probe.stop()
  })

  it('identifies the current surface and retires a pipeline idempotently', () => {
    const first = fixture()
    const baseline = first.probe.sample().pipeline.activePlayers
    const second = fixture()
    second.video.closest = () => ({ dataset: { playbackSurface: 'modview-native' } })
    expect(second.probe.sample().pipeline).toMatchObject({ surface: 'modview-native', activePlayers: baseline + 1 })
    first.probe.stop()
    first.probe.stop()
    expect(second.probe.sample().pipeline.activePlayers).toBe(baseline)
    second.probe.stop()
  })
  it.each([
    ['media sequence mismatch 123: https://secret.invalid/token\nPlaylist starting @120\nprivate manifest', 'media-sequence-mismatch'],
    ['discontinuity sequence mismatch (1!=2) https://secret.invalid/token\nprivate manifest', 'discontinuity-sequence-mismatch'],
  ])('classifies merge rejection without retaining the embedded manifest (%#)', (reason, category) => {
    const { probe, handlers } = fixture()
    handlers.get(Hls.Events.ERROR)(null, { details: 'levelParsingError', reason })
    expect(probe.sample().lastPlaylistError).toBe(category)
    expect(probe.export()).not.toMatch(/secret|https:|token|private manifest/)
    probe.stop()
  })
  it('keeps a bounded error history and safe playlist category after a later stall', () => {
    const { hls, probe, handlers } = fixture()
    hls.config = { progressive: false }
    const error = handlers.get(Hls.Events.ERROR)
    error(null, { details: 'levelParsingError', reason: '#EXT-X-MEDIA-SEQUENCE must appear before the first Media Segment (https://private.invalid/?token=secret)' })
    error(null, { details: 'bufferStalledError' })
    expect(probe.sample()).toMatchObject({ transportProfile: 'completed', lastError: 'bufferStalledError', lastPlaylistError: 'late-media-sequence', errorCounts: { levelParsingError: 1, bufferStalledError: 1 } })
    error(null, { details: 'levelParsingError', reason: 'unknown https://private.invalid/?token=secret' })
    expect(probe.sample().lastPlaylistError).toBe('unknown')
    expect(probe.export()).not.toMatch(/secret|private|https:/)
    for (let i = 0; i < 100; i++) error(null, { details: `error${i}` })
    expect(Object.keys(probe.sample().errorCounts).length).toBeLessThanOrEqual(32)
    probe.stop()
  })
  it('does not count a future buffered range as playable data at a gap', () => {
    const { video, probe } = fixture()
    expect(probe.sample().bufferAhead).toBe(0)
    expect(probe.sample().renderTiming).toBeNull()
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
    expect(hls.off).toHaveBeenCalledTimes(4)
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
