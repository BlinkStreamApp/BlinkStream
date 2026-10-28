import { describe, expect, it } from 'vitest'
import Hls from 'hls.js'
import { LIVE_PLAYBACK_CONFIG, applyLivePlaybackPolicy } from './livePlayback'

describe('live playback latency policy', () => {
  it.each([1080, 1440, 2160])('keeps %sp at normal speed with a bounded stability margin', height => {
    const hls = new Hls(LIVE_PLAYBACK_CONFIG)
    const video = { videoHeight: height, playbackRate: 1.1, readyState: 3, paused: false, seeking: false }
    applyLivePlaybackPolicy(hls, video)
    expect(video.playbackRate).toBe(1)
    expect(hls.config.maxLiveSyncPlaybackRate).toBe(1)
    expect(hls.config.liveSyncDuration).toBe(3)
    expect(hls.config.liveMaxLatencyDuration).toBe(8)
    expect(LIVE_PLAYBACK_CONFIG.liveSyncDuration).toBe(2)
    hls.destroy()
  })
  it('does not change lower-resolution playback or force playback after a pause', () => {
    const hls = new Hls(LIVE_PLAYBACK_CONFIG)
    const lower = { videoHeight: 720, playbackRate: 1.1, readyState: 3, paused: false, seeking: false }
    applyLivePlaybackPolicy(hls, lower)
    expect(lower.playbackRate).toBe(1.1)
    expect(hls.config.maxLiveSyncPlaybackRate).toBe(1.1)
    const paused = { videoHeight: 2160, playbackRate: 0, paused: true, readyState: 3 }
    applyLivePlaybackPolicy(hls, paused)
    expect(paused.playbackRate).toBe(0)
    expect(hls.config.liveMaxLatencyDuration).toBe(Infinity)
    hls.destroy()
  })
  it('uses seconds rather than multiplying latency by segment duration', () => {
    expect(LIVE_PLAYBACK_CONFIG.liveSyncDuration).toBe(2)
    expect(LIVE_PLAYBACK_CONFIG.liveMaxLatencyDuration).toBe(6)
    expect(LIVE_PLAYBACK_CONFIG).not.toHaveProperty('liveSyncDurationCount')
    expect(LIVE_PLAYBACK_CONFIG).not.toHaveProperty('liveMaxLatencyDurationCount')
  })

  it('is accepted by the installed HLS engine', () => {
    const hls = new Hls(LIVE_PLAYBACK_CONFIG)
    expect(hls.config.liveSyncDuration).toBe(2)
    expect(hls.config.lowLatencyMode).toBe(true)
    hls.destroy()
  })

  it('keeps recovery bounded and leaves buffer/DVR storage independent', () => {
    expect(LIVE_PLAYBACK_CONFIG.maxLiveSyncPlaybackRate).toBe(1.1)
    expect(LIVE_PLAYBACK_CONFIG.liveSyncOnStallIncrease).toBe(0.5)
    expect(LIVE_PLAYBACK_CONFIG).not.toHaveProperty('backBufferLength')
    expect(LIVE_PLAYBACK_CONFIG).not.toHaveProperty('maxBufferLength')
  })

  it('adapts the cap to an increased HLS target and preserves a larger finite lag recovery', () => {
    const hls = { config: {}, latestLevelDetails: { targetduration: 6 }, targetLatency: 6.5 }
    const video = { videoHeight: 1080, playbackRate: 1, readyState: 3, paused: false, seeking: false }
    applyLivePlaybackPolicy(hls, video)
    expect(hls.config.liveMaxLatencyDuration).toBe(12.5)
    video.readyState = 1
    applyLivePlaybackPolicy(hls, video)
    expect(hls.config.liveMaxLatencyDuration).toBe(Infinity)
    video.readyState = 3
    applyLivePlaybackPolicy(hls, video)
    expect(hls.config.liveMaxLatencyDuration).toBe(12.5)
  })
})
