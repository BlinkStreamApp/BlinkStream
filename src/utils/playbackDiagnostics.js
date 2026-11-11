import Hls from 'hls.js'
import { createRenderTiming } from './renderTiming'

let nextProbeId = 0
const activeProbes = new Set()
const finiteNumber = value => typeof value === 'number' && Number.isFinite(value) ? value : null

function bufferedRanges(buffer) {
  try {
    if (!buffer) return null
    return Array.from({ length: Math.min(buffer.length, 8) }, (_, index) => [buffer.start(index), buffer.end(index)])
  } catch { return null }
}

function readAudioClock(read) {
  try {
    const value = read?.()
    if (!value) return null
    return {
      state: ['running', 'suspended', 'closed', 'interrupted'].includes(value.state) ? value.state : 'unknown',
      currentTime: finiteNumber(value.currentTime),
      baseLatency: finiteNumber(value.baseLatency), outputLatency: finiteNumber(value.outputLatency),
    }
  } catch { return null }
}

function readTrackBuffer(buffer) {
  try {
    return {
      ranges: bufferedRanges(buffer.buffered), updating: Boolean(buffer.updating),
      timestampOffset: finiteNumber(buffer.timestampOffset),
    }
  } catch { return { ranges: null, updating: null, timestampOffset: null } }
}

function classifyPlaylistError(reason) {
  if (typeof reason !== 'string') return 'unknown'
  if (/Missing format identifier|no EXTM3U delimiter/.test(reason)) return 'missing-header'
  if (/Missing Target Duration/.test(reason)) return 'missing-target-duration'
  if (/No Segments found in Playlist/.test(reason)) return 'empty-playlist'
  if (/^media sequence mismatch \d+:/.test(reason)) return 'media-sequence-mismatch'
  if (/^discontinuity sequence mismatch \(/.test(reason)) return 'discontinuity-sequence-mismatch'
  const tag = /^#EXT-X-(MEDIA-SEQUENCE|DISCONTINUITY-SEQUENCE|TARGETDURATION|VERSION|PLAYLIST-TYPE|ENDLIST|SERVER-CONTROL|PART-INF|SKIP) must (not appear more than once|appear before the first Media Segment)/.exec(reason)
  return tag ? `${tag[2].startsWith('not') ? 'duplicate' : 'late'}-${tag[1].toLowerCase()}` : 'unknown'
}

export function createPlaybackProbe(video, hls, clock = () => performance.now(), wallClock = () => Date.now(), readAudioDiagnostics) {
  const probeId = ++nextProbeId
  const startedAt = clock()
  activeProbes.add(probeId)
  let bufferTracks = {}
  const events = { waiting: 0, stalled: 0, seeking: 0, seeked: 0, ratechange: 0 }
  const listeners = Object.keys(events).map(name => {
    const handler = () => { events[name] += 1 }
    video.addEventListener(name, handler)
    return [name, handler]
  })
  let codec = null
  let lastError = null
  let lastPlaylistError = null
  const errorCounts = Object.create(null)
  let previous = null
  let stopped = false
  let prefetchCount = 0
  let playlistLoads = 0
  const samples = []
  let renderTiming = null
  const onCodecs = (_event, tracks) => {
    const value = tracks.video?.codec || tracks.video?.levelCodec || tracks.audiovideo?.codec
    codec = typeof value === 'string' && /^[a-z0-9., _-]{1,120}$/i.test(value) ? value : null
  }
  const onError = (_event, data) => {
    lastError = typeof data.details === 'string' && /^[a-zA-Z0-9_]{1,80}$/.test(data.details) ? data.details : 'unknown'
    if (lastError in errorCounts || Object.keys(errorCounts).length < 32) errorCounts[lastError] = (errorCounts[lastError] || 0) + 1
    if (lastError === 'levelParsingError' || lastError === 'manifestParsingError' || lastError === 'levelEmptyError') {
      lastPlaylistError = classifyPlaylistError(data.reason || data.error?.message)
    }
  }
  const onPlaylist = (_event, data) => {
    playlistLoads++
    const count = data.networkDetails?.blinkstreamPlaylist?.prefetchCount
    prefetchCount = Number.isInteger(count) && count >= 0 && count <= 2 ? count : 0
  }
  const onBuffers = (_event, data) => { bufferTracks = data.tracks || {} }
  hls.on(Hls.Events.BUFFER_CODECS, onCodecs)
  hls.on(Hls.Events.ERROR, onError)
  hls.on(Hls.Events.LEVEL_LOADED, onPlaylist)
  hls.on(Hls.Events.BUFFER_CREATED, onBuffers)
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
      const playingDate = hls.playingDate?.getTime()
      const sourceLatency = Number.isFinite(playingDate) ? (wallClock() - playingDate) / 1000 : null
      const surface = video.closest?.('[data-playback-surface]')?.dataset.playbackSurface
      const tracks = {}
      for (const type of ['audio', 'video', 'audiovideo']) {
        const buffer = bufferTracks[type]?.buffer
        if (!buffer) continue
        tracks[type] = readTrackBuffer(buffer)
      }
      const sample = {
        elapsedMs: Math.round(now), codec, width: video.videoWidth, height: video.videoHeight,
        pipeline: {
          id: probeId, ageMs: Math.max(0, Math.round(now - startedAt)), activePlayers: activeProbes.size,
          surface: ['modview-native', 'modview-hybrid'].includes(surface) ? surface : 'normal',
          fullscreen: Boolean(video.ownerDocument?.fullscreenElement?.contains(video)),
          audioClock: readAudioClock(readAudioDiagnostics), tracks,
        },
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
        sourceLatency: sourceLatency !== null && sourceLatency >= 0 && sourceLatency <= 3600 ? sourceLatency : null,
        prefetchCount, playlistLoads, progressive: Boolean(hls.config?.progressive),
        liveSyncPosition: Number.isFinite(hls.liveSyncPosition) ? hls.liveSyncPosition : null,
        lastError, lastPlaylistError, errorCounts: { ...errorCounts },
        transportProfile: typeof hls.config?.progressive === 'boolean' ? (hls.config.progressive ? 'streaming' : 'completed') : null,
        events: { ...events }, renderTiming: renderTiming?.sample() ?? null,
      }
      previous = { now, total, dropped, currentTime: video.currentTime }
      samples.push(sample)
      if (samples.length > 30) samples.shift()
      return sample
    },
    setRenderTimingEnabled(enabled) {
      if (stopped) return
      if (enabled && !renderTiming) renderTiming = createRenderTiming(video)
      if (!enabled) { renderTiming?.stop(); renderTiming = null }
    },
    export() { return JSON.stringify({ schema: 1, hlsVersion: Hls.version, samples }) },
    stop() {
      if (stopped) return
      stopped = true
      activeProbes.delete(probeId)
      bufferTracks = {}
      renderTiming?.stop()
      listeners.forEach(([name, handler]) => video.removeEventListener(name, handler))
      hls.off(Hls.Events.BUFFER_CODECS, onCodecs)
      hls.off(Hls.Events.ERROR, onError)
      hls.off(Hls.Events.LEVEL_LOADED, onPlaylist)
      hls.off(Hls.Events.BUFFER_CREATED, onBuffers)
    },
  }
}
