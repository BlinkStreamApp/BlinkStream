import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLiveDVR } from './useLiveDVR'

describe('useLiveDVR', () => {
  let mockVideo
  let mockHls

  beforeEach(() => {
    vi.useFakeTimers()
    mockVideo = {
      currentTime: 100,
      duration: 100,
      readyState: 3, paused: false, seeking: false, videoHeight: 720, playbackRate: 1,
      seekable: {
        length: 1,
        start: vi.fn(() => 0),
        end: vi.fn(() => 100),
      },
    }
    mockHls = {
      liveSyncPosition: 100,
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('detects live edge when current time is close to live edge', () => {
    const videoRef = { current: mockVideo }
    const hlsRef = { current: mockHls }

    const { result } = renderHook(() => useLiveDVR(videoRef, hlsRef))

    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(result.current.isAtLiveEdge).toBe(true)
    expect(result.current.delayFromLive).toBe(0)
  })

  it('disables catch-up during DVR and restores it on return to live', () => {
    mockHls.config = {}
    mockVideo.currentTime = 100
    mockVideo.playbackRate = 1.1
    const { result } = renderHook(() => useLiveDVR({ current: mockVideo }, { current: mockHls }))
    act(() => result.current.seekRelative(-40))
    expect(mockHls.config.liveMaxLatencyDuration).toBe(Infinity)
    expect(mockHls.config.maxLiveSyncPlaybackRate).toBe(1)
    expect(mockVideo.playbackRate).toBe(1)
    act(() => result.current.seekToLive())
    expect(mockHls.config.liveMaxLatencyDuration).toBe(6)
    expect(mockHls.config.maxLiveSyncPlaybackRate).toBe(1.1)
  })

  it('does not auto-seek a paused live player', () => {
    mockHls.config = {}
    mockVideo.paused = true
    renderHook(() => useLiveDVR({ current: mockVideo }, { current: mockHls }))
    expect(mockHls.config.liveMaxLatencyDuration).toBe(Infinity)
    expect(mockHls.config.maxLiveSyncPlaybackRate).toBe(1)
    expect(mockVideo.currentTime).toBe(100)
  })

  it('keeps recovery enabled for unwanted lag without a user rewind', () => {
    mockHls.config = {}
    mockVideo.currentTime = 60
    renderHook(() => useLiveDVR({ current: mockVideo }, { current: mockHls }))
    expect(mockHls.config.liveMaxLatencyDuration).toBe(6)
    expect(mockHls.config.maxLiveSyncPlaybackRate).toBe(1.1)
  })

  it('detects delay when rewound back in time', () => {
    mockVideo.currentTime = 60 // 40 seconds behind
    const videoRef = { current: mockVideo }
    const hlsRef = { current: mockHls }

    const { result } = renderHook(() => useLiveDVR(videoRef, hlsRef))

    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(result.current.isAtLiveEdge).toBe(false)
    expect(result.current.delayFromLive).toBe(40)
  })

  it('seekToLive jumps back to live edge', () => {
    mockVideo.currentTime = 50
    const videoRef = { current: mockVideo }
    const hlsRef = { current: mockHls }

    const { result } = renderHook(() => useLiveDVR(videoRef, hlsRef))

    act(() => {
      result.current.seekToLive()
    })

    expect(mockVideo.currentTime).toBe(100)
  })

  it('LIVE prefers downloaded video over the nominal segment-clamped target', () => {
    mockVideo.currentTime = 49
    mockVideo.buffered = { length: 1, start: () => 34, end: () => 56 }
    mockHls.liveSyncPosition = 50
    const { result } = renderHook(() => useLiveDVR({ current: mockVideo }, { current: mockHls }))
    act(() => result.current.seekToLive())
    expect(mockVideo.currentTime).toBe(53)
    expect(mockVideo.paused).toBe(false)
  })

  it('seekRelative seeks backward and forward within boundaries', () => {
    mockVideo.currentTime = 50
    const videoRef = { current: mockVideo }
    const hlsRef = { current: mockHls }

    const { result } = renderHook(() => useLiveDVR(videoRef, hlsRef))

    act(() => {
      result.current.seekRelative(-15)
    })
    expect(mockVideo.currentTime).toBe(35)

    act(() => {
      result.current.seekRelative(20)
    })
    expect(mockVideo.currentTime).toBe(55)
  })
})
