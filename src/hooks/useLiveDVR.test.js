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
