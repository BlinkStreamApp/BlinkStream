import { describe, expect, it } from 'vitest'
import Hls from 'hls.js'
import { LIVE_PLAYBACK_CONFIG, stabilizeHighResolutionPlayback } from './livePlayback'

describe('live playback latency policy', () => {
  it('keeps 1440p at normal speed with a bounded stability margin', () => {
    const hls = new Hls(LIVE_PLAYBACK_CONFIG)
    const video = { videoHeight: 1440, playbackRate: 1.1 }
    expect(stabilizeHighResolutionPlayback(hls, video)).toBe(true)
    expect(video.playbackRate).toBe(1)
    expect(hls.config.maxLiveSyncPlaybackRate).toBe(1)
    expect(hls.config.liveSyncDuration).toBe(3)
    expect(hls.config.liveMaxLatencyDuration).toBe(8)
    expect(LIVE_PLAYBACK_CONFIG.liveSyncDuration).toBe(2)
    hls.destroy()
  })
  it('does not change lower-resolution playback or force playback after a pause', () => {
    const hls = new Hls(LIVE_PLAYBACK_CONFIG)
    expect(stabilizeHighResolutionPlayback(hls, { videoHeight: 1080, playbackRate: 1.1 })).toBe(false)
    expect(hls.config.maxLiveSyncPlaybackRate).toBe(1.1)
    const paused = { videoHeight: 2160, playbackRate: 0 }
    stabilizeHighResolutionPlayback(hls, paused)
    expect(paused.playbackRate).toBe(0)
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
})
