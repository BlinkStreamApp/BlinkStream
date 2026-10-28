// One latency controller for both live players. Keep preloading/DVR buffers separate.
export const LIVE_PLAYBACK_CONFIG = Object.freeze({
  lowLatencyMode: true,
  startPosition: -1,
  liveSyncDuration: 2,
  liveMaxLatencyDuration: 6,
  liveSyncOnStallIncrease: 0.5,
  maxLiveSyncPlaybackRate: 1.1,
})

const HIGH_RESOLUTION_PLAYBACK_CONFIG = Object.freeze({
  liveSyncDuration: 3,
  liveMaxLatencyDuration: 8,
  maxLiveSyncPlaybackRate: 1,
})

export function getLivePlaybackPolicy(videoHeight) {
  return videoHeight >= 1080 ? HIGH_RESOLUTION_PLAYBACK_CONFIG : LIVE_PLAYBACK_CONFIG
}

export function applyLivePlaybackPolicy(hls, video, followLive = true) {
  if (!hls?.config || !video) return
  const policy = getLivePlaybackPolicy(video.videoHeight)
  hls.config.liveSyncDuration = policy.liveSyncDuration
  const duration = hls.latestLevelDetails?.targetduration
  const targetDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const target = hls.targetLatency
  const targetLatency = Number.isFinite(target) && target > 0 ? target : policy.liveSyncDuration
  // HLS clamps its sync position to at least one segment behind the edge.
  // A cap at that same distance repeatedly seeks to a moving target instead of playing.
  const cap = Math.max(policy.liveMaxLatencyDuration, targetDuration * 2, targetLatency + targetDuration)
  const canSync = followLive && !video.paused && !video.seeking && video.readyState >= 2
  const maxRate = canSync ? policy.maxLiveSyncPlaybackRate : 1
  Object.assign(hls.config, {
    liveMaxLatencyDuration: canSync ? cap : Infinity,
    maxLiveSyncPlaybackRate: maxRate,
  })
  if (video.playbackRate > maxRate) video.playbackRate = maxRate
}

export function getBufferedLivePosition(video, { currentRangeOnly = false } = {}) {
  const ranges = video?.buffered
  if (!ranges) return null
  for (let index = ranges.length - 1; index >= 0; index--) {
    const start = ranges.start(index)
    const end = ranges.end(index)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 3.5 || end <= video.currentTime) continue
    if (currentRangeOnly && start > video.currentTime) continue
    // Use actual downloaded media rather than HLS's targetduration-clamped position.
    return Math.max(video.currentTime, start + 0.1, end - 3)
  }
  return null
}
