import { describe, expect, it } from 'vitest'
import Hls from 'hls.js'
import { LIVE_PLAYBACK_CONFIG } from './livePlayback'

describe('live playback latency policy', () => {
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
