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
  liveSyncDuration: 6,
  liveMaxLatencyDuration: 12,
  maxLiveSyncPlaybackRate: 1,
})

export function getLivePlaybackPolicy(videoHeight) {
  return videoHeight >= 1440 ? HIGH_RESOLUTION_PLAYBACK_CONFIG : LIVE_PLAYBACK_CONFIG
}

// High-resolution decoders should not be asked to render 60fps video at 66fps.
export function stabilizeHighResolutionPlayback(hls, video) {
  if (!(video.videoHeight >= 1440)) return false
  Object.assign(hls.config, getLivePlaybackPolicy(video.videoHeight))
  if (video.playbackRate > 1) video.playbackRate = 1
  return true
}
