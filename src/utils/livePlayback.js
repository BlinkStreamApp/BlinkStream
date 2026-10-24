// One latency controller for both live players. Keep preloading/DVR buffers separate.
export const LIVE_PLAYBACK_CONFIG = Object.freeze({
  lowLatencyMode: true,
  startPosition: -1,
  liveSyncDuration: 2,
  liveMaxLatencyDuration: 6,
  liveSyncOnStallIncrease: 0.5,
  maxLiveSyncPlaybackRate: 1.1,
})

// High-resolution decoders should not be asked to render 60fps video at 66fps.
export function stabilizeHighResolutionPlayback(hls, video) {
  if (!(video.videoHeight >= 1440)) return false
  hls.config.maxLiveSyncPlaybackRate = 1
  hls.config.liveSyncDuration = 6
  hls.config.liveMaxLatencyDuration = 12
  if (video.playbackRate > 1) video.playbackRate = 1
  return true
}
