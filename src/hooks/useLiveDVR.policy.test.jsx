import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import Hls from 'hls.js'
import { useLiveDVR } from './useLiveDVR'
import { LIVE_PLAYBACK_CONFIG, stabilizeHighResolutionPlayback } from '../utils/livePlayback'

afterEach(() => vi.useRealTimers())

describe('DVR respects the active player latency policy', () => {
  it('does not undo the high-resolution policy on its next polling tick', () => {
    vi.useFakeTimers()
    const video = { videoHeight: 1440, currentTime: 10, duration: 30, paused: false, playbackRate: 1,
      seekable: { length: 1, start: () => 0, end: () => 30 } }
    const hls = new Hls(LIVE_PLAYBACK_CONFIG)
    stabilizeHighResolutionPlayback(hls, video)
    const videoRef = { current: video }, hlsRef = { current: hls }
    const hook = renderHook(() => useLiveDVR(videoRef, hlsRef))
    try {
      act(() => vi.advanceTimersByTime(1500))
      expect(hls.config.maxLiveSyncPlaybackRate).toBe(1)
      expect(hls.config.liveMaxLatencyDuration).toBe(8)
      expect(hls.config.liveSyncDuration).toBe(3)
      act(() => hook.result.current.seekRelative(-5))
      expect(hls.config.liveMaxLatencyDuration).toBe(Infinity)
      act(() => hook.result.current.seekToLive())
      expect(hls.config.maxLiveSyncPlaybackRate).toBe(1)
      expect(hls.config.liveMaxLatencyDuration).toBe(8)
      expect(hls.config.liveSyncDuration).toBe(3)
    } finally { hook.unmount(); hls.destroy() }
  })
})
