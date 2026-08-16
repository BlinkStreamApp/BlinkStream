import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStereoPanner } from './useStereoPanner'

class MockAudioParam {
  constructor(defaultValue = 0) {
    this.value = defaultValue
    this.setValueAtTime = vi.fn((val) => {
      this.value = val
    })
  }
}

class MockAudioNode {
  connect = vi.fn()
  disconnect = vi.fn()
}

class MockStereoPannerNode extends MockAudioNode {
  pan = new MockAudioParam(0)
}

class MockAudioContext {
  currentTime = 50
  state = 'running'
  destination = new MockAudioNode()
  createMediaElementSource = vi.fn(() => new MockAudioNode())
  createStereoPanner = vi.fn(() => new MockStereoPannerNode())
  resume = vi.fn().mockResolvedValue(undefined)
}

describe('useStereoPanner', () => {
  let mockVideo
  let origAudioContext

  beforeEach(() => {
    origAudioContext = window.AudioContext
    window.AudioContext = MockAudioContext
    mockVideo = document.createElement('video')
  })

  afterEach(() => {
    window.AudioContext = origAudioContext
    vi.restoreAllMocks()
  })

  it('initializes with default pan 0 (center)', () => {
    const videoRef = { current: mockVideo }
    const { result } = renderHook(() => useStereoPanner(videoRef))

    expect(result.current.pan).toBe(0)
  })

  it('sets pan to -1 (left ear) and clamps values', () => {
    const videoRef = { current: mockVideo }
    const { result } = renderHook(() => useStereoPanner(videoRef))

    act(() => {
      result.current.setPan(-1)
    })
    expect(result.current.pan).toBe(-1)

    // Clamps beyond limits
    act(() => {
      result.current.setPan(-2.5)
    })
    expect(result.current.pan).toBe(-1)

    act(() => {
      result.current.setPan(1.8)
    })
    expect(result.current.pan).toBe(1)
  })

  it('safely handles null video element', () => {
    const videoRef = { current: null }
    const { result } = renderHook(() => useStereoPanner(videoRef, 0.5))

    expect(result.current.pan).toBe(0.5)
  })
})
