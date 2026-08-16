import { useState, useEffect, useRef, useCallback } from 'react'

const elementAudioMap = new WeakMap()

function checkStereoPannerSupport() {
  if (typeof window === 'undefined') return false
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  return Boolean(AudioCtx && typeof AudioCtx.prototype?.createStereoPanner === 'function')
}

export function useStereoPanner(videoRef, initialPan = 0) {
  const [pan, setPan] = useState(initialPan)
  const isSupported = checkStereoPannerSupport()
  const audioCtxRef = useRef(null)
  const pannerRef = useRef(null)

  const setupAudioGraph = useCallback(() => {
    const video = videoRef?.current
    if (!video || !isSupported) return

    try {
      let bundle = elementAudioMap.get(video)
      if (!bundle) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        if (!AudioContextClass) return

        const ctx = new AudioContextClass()
        if (typeof ctx.createStereoPanner !== 'function') return

        const source = ctx.createMediaElementSource(video)
        const panner = ctx.createStereoPanner()
        panner.pan.setValueAtTime(pan, ctx.currentTime)

        // Chain: Source -> Panner -> Destination
        source.connect(panner)
        panner.connect(ctx.destination)

        bundle = { ctx, source, panner }
        elementAudioMap.set(video, bundle)
      }

      audioCtxRef.current = bundle.ctx
      pannerRef.current = bundle.panner

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
      console.warn('[useStereoPanner] Failed to initialize StereoPanner audio graph:', e)
    }
  }, [videoRef, pan, isSupported])

  useEffect(() => {
    setupAudioGraph()
    const ctx = audioCtxRef.current
    const panner = pannerRef.current

    if (ctx && panner) {
      const clampedPan = Math.max(-1, Math.min(1, Number(pan) || 0))
      panner.pan.setValueAtTime(clampedPan, ctx.currentTime)
    }
  }, [pan, setupAudioGraph])

  const setPanDirect = useCallback((val) => {
    const num = Math.max(-1, Math.min(1, Number(val) || 0))
    setPan(num)
  }, [])

  return {
    pan,
    setPan: setPanDirect,
    isSupported,
  }
}
