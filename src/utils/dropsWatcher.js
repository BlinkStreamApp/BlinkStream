import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './tauriEnv'

// Serializes teardown before a new channel/quality starts sampling in the same webview.
let nativeWatchQueue = Promise.resolve()
function enqueueWatchSample(channel, sample) {
  const request = nativeWatchQueue.then(() => invoke('sample_native_drops_watch', { channel, sample }))
  nativeWatchQueue = request.catch(() => {})
  return request
}

export function watchNativeDropsPlayback(video, channel, onStatus) {
  const cleanChannel = String(channel || '').trim().toLowerCase()
  if (!video || !isTauri() || !/^[a-z0-9_]{3,25}$/.test(cleanChannel)) return () => {}
  let disposed = false
  let inFlight = false
  let pending = false
  let acceptedReports = 0

  const sample = () => {
    const position = Number.isFinite(video.currentTime) ? video.currentTime : 0
    const quality = video.getVideoPlaybackQuality?.()
    const frames = Number.isFinite(quality?.totalVideoFrames) ? quality.totalVideoFrames : null
    return {
      enabled: true,
      active: !video.paused && !video.ended && !video.seeking && video.readyState >= 2
        && document.visibilityState !== 'hidden' && position >= 0,
      position,
      playbackRate: Number.isFinite(video.playbackRate) ? video.playbackRate : 1,
      muted: Boolean(video.muted || video.volume === 0),
      frames,
    }
  }
  const tick = async () => {
    if (disposed) return
    pending = true
    if (inFlight) return
    inFlight = true
    while (pending && !disposed) {
      pending = false
      try {
        const status = await enqueueWatchSample(cleanChannel, sample())
        if (disposed) break
        onStatus(status)
        if (status?.acceptedReports > acceptedReports) {
          acceptedReports = status.acceptedReports
          console.info(`[DropsWatch] Reportes aceptados: ${acceptedReports}; progreso remoto pendiente (${cleanChannel})`)
        }
      } catch (error) {
        if (!disposed) onStatus({ state: 'error', error: String(error?.message || error) })
      }
    }
    inFlight = false
  }
  const events = ['playing', 'pause', 'ended', 'waiting', 'seeking', 'emptied', 'ratechange']
  for (const event of events) video.addEventListener(event, tick)
  document.addEventListener('visibilitychange', tick)
  const timer = setInterval(tick, 5000)
  tick()
  return () => {
    disposed = true
    pending = false
    clearInterval(timer)
    for (const event of events) video.removeEventListener(event, tick)
    document.removeEventListener('visibilitychange', tick)
    enqueueWatchSample(cleanChannel, { ...sample(), enabled: false, active: false }).catch(error => {
      console.warn('[DropsWatch] No se pudo cerrar la sesión nativa:', String(error?.message || error))
    })
  }
}

export async function startDropsWatcher(channel) {
  if (!channel || !isTauri()) return
  try {
    const clean = String(channel).trim().toLowerCase()
    await invoke('start_drops_watcher', { channel: clean })
  } catch (err) {
    console.warn('[DropsWatcher] start_drops_watcher failed:', err)
  }
}

export async function stopDropsWatcher() {
  if (!isTauri()) return
  try {
    await invoke('stop_drops_watcher')
  } catch (err) {
    console.warn('[DropsWatcher] stop_drops_watcher failed:', err)
  }
}
