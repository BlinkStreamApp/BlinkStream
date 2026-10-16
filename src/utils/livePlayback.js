// One latency controller for both live players. Keep preloading/DVR buffers separate.
export const LIVE_PLAYBACK_CONFIG = Object.freeze({
  lowLatencyMode: true,
  startPosition: -1,
  liveSyncDuration: 2,
  liveMaxLatencyDuration: 6,
  liveSyncOnStallIncrease: 0.5,
  maxLiveSyncPlaybackRate: 1.1,
})
