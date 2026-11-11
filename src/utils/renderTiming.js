export function createRenderTiming(video, environment = globalThis) {
  const clock = () => environment.performance.now()
  let started = clock(), active = true, rafId, videoId, observer
  let lastFrame = null, frames = 0, maxGap = 0, longTasks = 0, longTaskMs = 0
  let decoded = 0, decodeMs = 0, decodeMaxMs = 0, lateMaxMs = 0
  const visible = () => environment.document?.visibilityState !== 'hidden'
  const frame = now => {
    if (!active) return
    if (visible()) {
      frames++
      if (lastFrame !== null) maxGap = Math.max(maxGap, now - lastFrame)
      lastFrame = now
    } else lastFrame = null
    rafId = environment.requestAnimationFrame(frame)
  }
  const presented = (now, metadata) => {
    if (!active) return
    if (visible()) {
      const duration = metadata.processingDuration * 1000
      if (Number.isFinite(duration) && duration >= 0 && duration <= 30000) {
        decoded++; decodeMs += duration; decodeMaxMs = Math.max(decodeMaxMs, duration)
      }
      if (Number.isFinite(metadata.expectedDisplayTime)) lateMaxMs = Math.max(lateMaxMs, now - metadata.expectedDisplayTime)
    }
    videoId = video.requestVideoFrameCallback(presented)
  }
  if (typeof environment.requestAnimationFrame === 'function') rafId = environment.requestAnimationFrame(frame)
  if (typeof video.requestVideoFrameCallback === 'function') videoId = video.requestVideoFrameCallback(presented)
  try {
    if (environment.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
      observer = new environment.PerformanceObserver(list => {
        if (!active || !visible()) return
        for (const entry of list.getEntries()) {
          if (Number.isFinite(entry.duration) && entry.duration >= 0) { longTasks++; longTaskMs += entry.duration }
        }
      })
      observer.observe({ entryTypes: ['longtask'] })
    }
  } catch { /* Optional runtime metric; absence is represented as null. */ }
  return {
    sample() {
      const now = clock(), seconds = (now - started) / 1000
      const result = {
        uiFps: visible() && seconds > 0 && frames ? frames / seconds : null,
        uiMaxGapMs: frames > 1 ? maxGap : null,
        longTasks: observer ? longTasks : null, longTaskMs: observer ? longTaskMs : null,
        decodeAvgMs: decoded ? decodeMs / decoded : null, decodeMaxMs: decoded ? decodeMaxMs : null,
        presentationLateMaxMs: videoId !== undefined ? lateMaxMs : null,
        hidden: !visible(), viewportWidth: environment.innerWidth || null, viewportHeight: environment.innerHeight || null,
      }
      started = now; frames = 0; maxGap = 0; longTasks = 0; longTaskMs = 0
      decoded = 0; decodeMs = 0; decodeMaxMs = 0; lateMaxMs = 0
      return result
    },
    stop() {
      active = false
      if (rafId !== undefined) environment.cancelAnimationFrame?.(rafId)
      if (videoId !== undefined) video.cancelVideoFrameCallback?.(videoId)
      observer?.disconnect()
    },
  }
}
