import { useState, useEffect, useRef, useCallback } from 'react'

const STORAGE_KEY = 'blinkstream_audio_night_mode'
const elementAudioMap = new WeakMap()

export function useAudioCompressor(videoRef) {
  const [isNightMode, setIsNightMode] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const audioCtxRef = useRef(null)
  const compressorRef = useRef(null)
  const gainRef = useRef(null)

  const setupAudioNodes = useCallback(() => {
    const video = videoRef?.current
    if (!video) return

    try {
      let bundle = elementAudioMap.get(video)
      if (!bundle) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        if (!AudioContextClass) return

        const ctx = new AudioContextClass()
        const source = ctx.createMediaElementSource(video)
        const compressor = ctx.createDynamicsCompressor()
        const gain = ctx.createGain()

        // Configure default night mode compression parameters
        compressor.threshold.setValueAtTime(-24, ctx.currentTime)
        compressor.knee.setValueAtTime(30, ctx.currentTime)
        compressor.ratio.setValueAtTime(12, ctx.currentTime)
        compressor.attack.setValueAtTime(0.003, ctx.currentTime)
        compressor.release.setValueAtTime(0.25, ctx.currentTime)
        gain.gain.setValueAtTime(1.0, ctx.currentTime)

        // Chain: Source -> Compressor -> Gain -> Destination
        source.connect(compressor)
        compressor.connect(gain)
        gain.connect(ctx.destination)

        bundle = { ctx, source, compressor, gain }
        elementAudioMap.set(video, bundle)
      }

      audioCtxRef.current = bundle.ctx
      compressorRef.current = bundle.compressor
      gainRef.current = bundle.gain

      // Resume context if suspended
      if (bundle.ctx.state === 'suspended') {
        const handleUserGesture = () => {
          bundle.ctx.resume().catch(() => {})
          window.removeEventListener('click', handleUserGesture)
          window.removeEventListener('keydown', handleUserGesture)
        }
        window.addEventListener('click', handleUserGesture, { once: true })
        window.addEventListener('keydown', handleUserGesture, { once: true })
      }
    } catch (e) {
      console.warn('[useAudioCompressor] Failed to initialize Web Audio graph:', e)
    }
  }, [videoRef])

  // Apply compression parameters whenever isNightMode changes
  useEffect(() => {
    setupAudioNodes()
    const ctx = audioCtxRef.current
    const compressor = compressorRef.current
    const gain = gainRef.current

    if (!ctx || !compressor || !gain) return

    const now = ctx.currentTime
    if (isNightMode) {
      compressor.threshold.setValueAtTime(-24, now)
      compressor.knee.setValueAtTime(30, now)
      compressor.ratio.setValueAtTime(12, now)
      compressor.attack.setValueAtTime(0.003, now)
      compressor.release.setValueAtTime(0.25, now)
      gain.gain.setValueAtTime(1.25, now)
    } else {
      compressor.threshold.setValueAtTime(0, now)
      compressor.knee.setValueAtTime(1, now)
      compressor.ratio.setValueAtTime(1, now)
      compressor.attack.setValueAtTime(0.003, now)
      compressor.release.setValueAtTime(0.25, now)
      gain.gain.setValueAtTime(1.0, now)
    }

    try {
      localStorage.setItem(STORAGE_KEY, isNightMode ? 'true' : 'false')
    } catch {
      // Ignorar fallo de almacenamiento
    }
  }, [isNightMode, setupAudioNodes])

  const toggleNightMode = useCallback(() => {
    setIsNightMode(prev => !prev)
  }, [])

  return {
    isNightMode,
    toggleNightMode,
    setNightMode: setIsNightMode,
  }
}
