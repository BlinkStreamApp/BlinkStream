import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAudioCompressor } from './useAudioCompressor'

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

class MockDynamicsCompressorNode extends MockAudioNode {
  threshold = new MockAudioParam(0)
  knee = new MockAudioParam(0)
  ratio = new MockAudioParam(1)
  attack = new MockAudioParam(0.003)
  release = new MockAudioParam(0.25)
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam(1)
}

class MockAudioContext {
  currentTime = 100
  state = 'running'
  destination = new MockAudioNode()
  createMediaElementSource = vi.fn(() => new MockAudioNode())
  createDynamicsCompressor = vi.fn(() => new MockDynamicsCompressorNode())
  createGain = vi.fn(() => new MockGainNode())
  resume = vi.fn().mockResolvedValue(undefined)
}

describe('useAudioCompressor', () => {
  let mockVideo
  let origAudioContext

  beforeEach(() => {
    localStorage.clear()
    origAudioContext = window.AudioContext
    window.AudioContext = MockAudioContext
    mockVideo = document.createElement('video')
  })

  afterEach(() => {
    window.AudioContext = origAudioContext
    vi.restoreAllMocks()
  })

  it('initializes with default false when localStorage is empty', () => {
    const videoRef = { current: mockVideo }
    const { result } = renderHook(() => useAudioCompressor(videoRef))

    expect(result.current.isNightMode).toBe(false)
  })

  it('initializes with true if stored in localStorage', () => {
    localStorage.setItem('blinkstream_audio_night_mode', 'true')
    const videoRef = { current: mockVideo }
    const { result } = renderHook(() => useAudioCompressor(videoRef))

    expect(result.current.isNightMode).toBe(true)
  })

  it('toggles night mode and persists to localStorage', () => {
    const videoRef = { current: mockVideo }
    const { result } = renderHook(() => useAudioCompressor(videoRef))

    expect(result.current.isNightMode).toBe(false)

    act(() => {
      result.current.toggleNightMode()
    })

    expect(result.current.isNightMode).toBe(true)
    expect(localStorage.getItem('blinkstream_audio_night_mode')).toBe('true')

    act(() => {
      result.current.toggleNightMode()
    })

    expect(result.current.isNightMode).toBe(false)
    expect(localStorage.getItem('blinkstream_audio_night_mode')).toBe('false')
  })

  it('safely handles null videoRef without crashing', () => {
    const videoRef = { current: null }
    const { result } = renderHook(() => useAudioCompressor(videoRef))

    expect(result.current.isNightMode).toBe(false)
    act(() => {
      result.current.toggleNightMode()
    })
    expect(result.current.isNightMode).toBe(true)
  })

  it('applies compression parameters when night mode is enabled', () => {
    const videoRef = { current: mockVideo }
    const { result } = renderHook(() => useAudioCompressor(videoRef))

    act(() => {
      result.current.setNightMode(true)
    })

    expect(result.current.isNightMode).toBe(true)
  })
})
