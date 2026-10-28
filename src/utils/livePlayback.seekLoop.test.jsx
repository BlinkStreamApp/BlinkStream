import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import Hls from 'hls.js'
import { LIVE_PLAYBACK_CONFIG, applyLivePlaybackPolicy } from './livePlayback'
import { useLiveDVR } from '../hooks/useLiveDVR'

afterEach(() => vi.useRealTimers())

function fixture(seeking = false) {
  const hls = new Hls(LIVE_PLAYBACK_CONFIG)
  const details = { live: true, edge: 72, fragmentStart: 46, totalduration: 26, targetduration: 6, age: 0, holdBack: 0, partHoldBack: 0, partTarget: 0 }
  Object.defineProperty(hls, 'latestLevelDetails', { get: () => details })
  let current = 64
  let seeks = 0
  const video = { videoHeight: 1080, playbackRate: 1.1, paused: false, seeking, readyState: seeking ? 1 : 3, duration: Infinity,
    seekable: { length: 1, start: () => 46, end: () => details.edge }, addEventListener() {}, removeEventListener() {} }
  Object.defineProperty(video, 'currentTime', { get: () => current, set: value => { seeks++; current = value; video.seeking = true; video.readyState = 1 } })
  hls.streamController.media = video
  hls.streamController._hasEnoughToStart = true
  applyLivePlaybackPolicy(hls, video)
  return { hls, video, details, seeks: () => seeks, advance: () => { if (!video.seeking) current += 2; details.edge += 2 } }
}

describe('actual HLS live synchronization with buffered 1080p', () => {
  it('does not start a chain of seeks when minimum live position is six seconds from the edge', () => {
    vi.useFakeTimers()
    const f = fixture()
    const hook = renderHook(() => useLiveDVR({ current: f.video }, { current: f.hls }))
    try {
      for (let i = 0; i < 15; i++) {
        f.hls.streamController.synchronizeToLiveEdge(f.details)
        f.advance()
        act(() => vi.advanceTimersByTime(2000))
      }
      expect(f.seeks()).toBe(0)
      expect(f.video.playbackRate).toBe(1)
      expect(f.hls.config.liveMaxLatencyDuration).toBe(12)
    } finally { hook.unmount(); f.hls.destroy() }
  })

  it('lets an in-flight seek finish instead of overwriting it on every playlist update', () => {
    vi.useFakeTimers()
    const f = fixture(true)
    const hook = renderHook(() => useLiveDVR({ current: f.video }, { current: f.hls }))
    try {
      for (let i = 0; i < 15; i++) {
        f.hls.streamController.synchronizeToLiveEdge(f.details)
        f.advance()
        act(() => vi.advanceTimersByTime(2000))
      }
      expect(f.seeks()).toBe(0)
      expect(f.hls.config.liveMaxLatencyDuration).toBe(Infinity)
      f.video.seeking = false
      f.video.readyState = 3
      act(() => vi.advanceTimersByTime(500))
      expect(f.hls.config.liveMaxLatencyDuration).toBe(12)
    } finally { hook.unmount(); f.hls.destroy() }
  })

  it('still recovers excessive live lag once, then lets that seek finish', () => {
    vi.useFakeTimers()
    const f = fixture()
    f.video.currentTime = 46
    f.video.seeking = false
    f.video.readyState = 3
    const initialSeeks = f.seeks()
    const hook = renderHook(() => useLiveDVR({ current: f.video }, { current: f.hls }))
    try {
      f.hls.streamController.synchronizeToLiveEdge(f.details)
      expect(f.seeks() - initialSeeks).toBe(1)
      act(() => hook.result.current.updateDVRMetrics())
      for (let i = 0; i < 10; i++) {
        f.advance()
        f.hls.streamController.synchronizeToLiveEdge(f.details)
      }
      expect(f.seeks() - initialSeeks).toBe(1)
    } finally { hook.unmount(); f.hls.destroy() }
  })

  it('preserves a deliberate rewind across metadata updates and restores live only on request', () => {
    vi.useFakeTimers()
    const f = fixture()
    const hook = renderHook(() => useLiveDVR({ current: f.video }, { current: f.hls }))
    try {
      act(() => hook.result.current.seekRelative(-10))
      f.video.seeking = false
      f.video.readyState = 3
      act(() => hook.result.current.updateDVRMetrics())
      expect(f.hls.config.liveMaxLatencyDuration).toBe(Infinity)
      const count = f.seeks()
      f.hls.streamController.synchronizeToLiveEdge(f.details)
      expect(f.seeks()).toBe(count)
      act(() => hook.result.current.seekToLive())
      f.video.seeking = false
      f.video.readyState = 3
      act(() => hook.result.current.updateDVRMetrics())
      expect(f.hls.config.liveMaxLatencyDuration).toBe(12)
    } finally { hook.unmount(); f.hls.destroy() }
  })
})
