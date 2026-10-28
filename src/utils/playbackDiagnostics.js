import Hls from 'hls.js'

export function createPlaybackProbe(video, hls, clock = () => performance.now()) {
  const events = { waiting: 0, stalled: 0, seeking: 0, seeked: 0, ratechange: 0 }
  const listeners = Object.keys(events).map(name => {
    const handler = () => { events[name] += 1 }
    video.addEventListener(name, handler)
    return [name, handler]
  })
  let codec = null
  let lastError = null
  let previous = null
  let stopped = false
  const samples = []
  const onCodecs = (_event, tracks) => {
    const value = tracks.video?.codec || tracks.video?.levelCodec || tracks.audiovideo?.codec
    codec = typeof value === 'string' && /^[a-z0-9., _-]{1,120}$/i.test(value) ? value : null
  }
  const onError = (_event, data) => {
    lastError = typeof data.details === 'string' && /^[a-zA-Z0-9_]{1,80}$/.test(data.details) ? data.details : 'unknown'
  }
  hls.on(Hls.Events.BUFFER_CODECS, onCodecs)
  hls.on(Hls.Events.ERROR, onError)
  return {
    sample() {
      if (stopped) return null
      const now = clock()
      const quality = video.getVideoPlaybackQuality?.()
      const total = quality?.totalVideoFrames ?? video.webkitDecodedFrameCount ?? null
      const dropped = quality?.droppedVideoFrames ?? video.webkitDroppedFrameCount ?? null
      const seconds = previous ? (now - previous.now) / 1000 : 0
      const validDelta = seconds > 0 && total !== null && dropped !== null && previous?.total !== null && previous?.dropped !== null && total >= previous.total && dropped >= previous.dropped
      const ranges = Array.from({ length: Math.min(video.buffered.length, 8) }, (_, index) => [video.buffered.start(index), video.buffered.end(index)])
      const currentRange = ranges.find(([start, end]) => start <= video.currentTime && end >= video.currentTime)
      const sample = {
        elapsedMs: Math.round(now), codec, width: video.videoWidth, height: video.videoHeight,
        playbackRate: video.playbackRate, paused: video.paused, seeking: video.seeking, readyState: video.readyState,
        currentTime: video.currentTime, bufferAhead: currentRange ? Math.max(0, currentRange[1] - video.currentTime) : 0,
        ranges, totalFrames: total, droppedFrames: dropped,
        presentedFps: validDelta ? Math.max(0, (total - previous.total - (dropped - previous.dropped)) / seconds) : null,
        droppedInterval: validDelta ? dropped - previous.dropped : null,
        mediaAdvance: previous ? video.currentTime - previous.currentTime : null,
        workerActive: Boolean(hls.streamController?.transmuxer?.workerContext),
        catchUpRate: hls.config?.maxLiveSyncPlaybackRate ?? null,
        latencyCap: Number.isFinite(hls.config?.liveMaxLatencyDuration) ? hls.config.liveMaxLatencyDuration : null,
        targetDuration: Number.isFinite(hls.latestLevelDetails?.targetduration) ? hls.latestLevelDetails.targetduration : null,
        targetLatency: Number.isFinite(hls.targetLatency) ? hls.targetLatency : null,
        latency: Number.isFinite(hls.latency) ? hls.latency : null,
        liveSyncPosition: Number.isFinite(hls.liveSyncPosition) ? hls.liveSyncPosition : null,
        lastError, events: { ...events },
      }
      previous = { now, total, dropped, currentTime: video.currentTime }
      samples.push(sample)
      if (samples.length > 30) samples.shift()
      return sample
    },
    export() { return JSON.stringify({ schema: 1, hlsVersion: Hls.version, samples }) },
    stop() {
      stopped = true
      listeners.forEach(([name, handler]) => video.removeEventListener(name, handler))
      hls.off(Hls.Events.BUFFER_CODECS, onCodecs)
      hls.off(Hls.Events.ERROR, onError)
    },
  }
}
