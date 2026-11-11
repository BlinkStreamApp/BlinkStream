import Hls from 'hls.js'
import { invoke } from '@tauri-apps/api/core'
import hlsWorkerUrl from 'hls.js/dist/hls.worker.js?url'

export const HLS_WORKER_CONFIG = Object.freeze({ enableWorker: true, workerPath: hlsWorkerUrl })

export function prepareLivePlaylist(text, baseUrl, prefetchEnabled = false) {
  const base = new URL(baseUrl)
  const twitch = base.protocol === 'https:' && (base.hostname.endsWith('.ttvnw.net') || base.hostname.endsWith('.twitch.tv'))
  const lines = text.split(/\r?\n/)
  const durations = lines.filter(line => line.startsWith('#EXTINF:')).map(line => Number.parseFloat(line.slice(8))).filter(value => value > 0 && Number.isFinite(value))
  const duration = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0
  const canPrefetch = prefetchEnabled && twitch && duration > 0 && duration <= 30 && !lines.some(line => line.startsWith('#EXT-X-ENDLIST') || line.startsWith('#EXT-X-PART:'))
  const mediaHosts = new Set()
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    try {
      const url = new URL(line.trim(), base)
      if (url.protocol === 'https:' && url.hostname.endsWith('.ttvnw.net')) mediaHosts.add(url.hostname)
    } catch {}
  }
  let prefetchCount = 0
  const expanded = []
  for (const line of lines) {
    const match = /^#EXT-X-TWITCH-PREFETCH:(.+)$/.exec(line.trim())
    if (canPrefetch && match && prefetchCount < 2) {
      let url
      try { url = new URL(match[1].trim(), base) } catch { expanded.push(line); continue }
      if (url.protocol === 'https:' && !url.username && !url.password && !url.port && mediaHosts.has(url.hostname)) {
        // Twitch publishes future segment URLs. Stream their body as it is produced.
        // As in Streamlink's Twitch reader, estimate duration from completed segments.
        expanded.push(`#EXTINF:${duration.toFixed(6)},`, url.href)
        prefetchCount++
        continue
      }
    }
    expanded.push(line)
  }
  const metadata = { prefetchCount, segmentDuration: duration || null }
  const rewriteUri = (uri) => {
    try { return new URL(uri, baseUrl).href } catch { return uri }
  }
  const content = expanded.map(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) return rewriteUri(trimmed)
    return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${rewriteUri(uri)}"`)
  }).join('\n')
  return { metadata, text: content }
}

export class TauriPlaylistLoader extends Hls.DefaultConfig.loader {
  constructor(config) {
    super(config)
    this.prefetchEnabled = Boolean(config?.progressive)
    this.nativeRequest = null
  }

  abort() {
    const request = this.nativeRequest
    if (request?.active) {
      request.active = false
      this.stats.aborted = true
      clearTimeout(request.timer)
      request.callbacks.onAbort?.(this.stats, request.context, null)
    }
    super.abort()
  }

  destroy() {
    if (this.nativeRequest) {
      this.nativeRequest.active = false
      clearTimeout(this.nativeRequest.timer)
    }
    super.destroy()
  }

  load(context, config, callbacks) {
    if (context.type !== 'manifest' && context.type !== 'level') {
      return super.load(context, config, callbacks)
    }

    if (this.nativeRequest) throw new Error('Loader can only be used once.')
    const trequest = performance.now()
    this.context = context
    this.stats.loading.start = trequest
    const request = this.nativeRequest = { active: true, context, callbacks, timer: null }
    const limits = [config.loadPolicy?.maxTimeToFirstByteMs, config.loadPolicy?.maxLoadTimeMs, config.timeout].filter(value => Number.isFinite(value) && value > 0)
    request.timer = setTimeout(() => {
      if (!request.active) return
      request.active = false
      this.stats.aborted = true
      callbacks.onTimeout(this.stats, context, null)
    }, limits.length ? Math.min(...limits) : 15000)

    invoke('fetch_m3u8_content', { url: context.url })
      .then(text => {
        if (!request.active) return
        const playlist = prepareLivePlaylist(text, context.url, this.prefetchEnabled)
        request.active = false
        clearTimeout(request.timer)
        const tload = performance.now()
        if (this.stats) {
          if (this.stats.loading) {
            this.stats.loading.first = Math.max(tload, this.stats.loading.start || trequest)
            this.stats.loading.end = tload
          }
          this.stats.loaded = text.length
          this.stats.total = text.length
          this.stats.bwEstimate = Math.round((text.length * 8000) / Math.max(1, (tload - trequest)))
        }

        callbacks.onSuccess(
          { url: context.url, data: playlist.text, code: 200 },
          this.stats,
          context,
          { blinkstreamPlaylist: playlist.metadata },
        )
      })
      .catch(() => {
        if (!request.active) return
        request.active = false
        clearTimeout(request.timer)
        callbacks.onError(
          { code: 0, text: 'No se pudo cargar el manifiesto', type: 'networkError', details: 'manifestLoadError' },
          context,
          null,
        )
      })
  }
}

// A playlist-only native loader leaves hls.js free to select its streaming FetchLoader.
export const LIVE_HLS_TRANSPORT = Object.freeze({ pLoader: TauriPlaylistLoader, progressive: true })
export const COMPLETED_HLS_TRANSPORT = Object.freeze({ pLoader: TauriPlaylistLoader, progressive: false })
class PublishedPlaylistLoader extends TauriPlaylistLoader {
  constructor(config) { super(config); this.prefetchEnabled = false }
}
export const PUBLISHED_LIVE_HLS_TRANSPORT = Object.freeze({ pLoader: PublishedPlaylistLoader, progressive: false })

export function attachLiveTransportRecovery(hls, video, onRecovery, isFollowingLive = () => true, clock = () => performance.now()) {
  if (!hls.config.progressive) return () => {}
  let disposed = false, prefetchActive = false, firstErrorAt = null
  const reset = () => { firstErrorAt = null }
  const onLoaded = (_event, data) => {
    const count = data.networkDetails?.blinkstreamPlaylist?.prefetchCount
    prefetchActive = data.details?.live === true && Number.isInteger(count) && count > 0 && count <= 2
    if (!prefetchActive) reset()
  }
  const onError = (_event, data) => {
    if (disposed || data.details !== 'levelParsingError') return
    if (!prefetchActive || video.paused || !isFollowingLive()) { reset(); return }
    const reason = data.reason || data.error?.message
    const sequenceMismatch = typeof reason === 'string' && /^(media sequence mismatch \d+:|discontinuity sequence mismatch \()/.test(reason)
    if (data.fatal && !sequenceMismatch) return
    const now = clock()
    if (!sequenceMismatch && (firstErrorAt === null || now - firstErrorAt > 10000)) { firstErrorAt = now; return }
    // A sequence conflict invalidates speculative delivery even if HLS escalates it.
    dispose()
    onRecovery()
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    hls.off(Hls.Events.LEVEL_LOADED, onLoaded)
    hls.off(Hls.Events.ERROR, onError)
    hls.off(Hls.Events.DESTROYING, dispose)
    video.removeEventListener('pause', reset)
  }
  hls.on(Hls.Events.LEVEL_LOADED, onLoaded)
  hls.on(Hls.Events.ERROR, onError)
  hls.on(Hls.Events.DESTROYING, dispose)
  video.addEventListener('pause', reset)
  return dispose
}

export function attachLivePlaylistBootstrap(hls, video, isFollowingLive = () => true) {
  let firstPlaylist = true
  let disposed = false
  let timer = null
  const cancel = () => { clearTimeout(timer); timer = null }
  const onLoaded = (_event, data) => {
    cancel()
    if (!firstPlaylist || disposed) return
    firstPlaylist = false
    const metadata = data.networkDetails?.blinkstreamPlaylist
    const duration = metadata?.segmentDuration
    const details = data.details
    const count = metadata?.prefetchCount
    const supportedCount = Number.isInteger(count) && count >= 0 && count <= 2 && (count > 0 || hls.config?.progressive === false || hls.config?.pLoader === PublishedPlaylistLoader)
    if (!details?.live || !supportedCount
      || !Number.isFinite(duration) || duration < 0.25 || duration > 30
      || !Number.isFinite(details.targetduration) || duration >= details.targetduration
      || !Number.isFinite(details.totalduration) || details.totalduration < details.targetduration * 4
      || !data.levelInfo?.uri || !Number.isInteger(data.level) || data.level < 0) return
    // The first reload otherwise waits the nominal target duration while no forward buffer exists.
    // Request only the next playlist; never restart segment loading or seek the media element.
    timer = setTimeout(() => {
      timer = null
      if (disposed || !hls.started || video.paused || video.seeking || !isFollowingLive()) return
      // LevelDetails carries the scheduled time across reloads. Rebase it to this actual
      // request so the next regular reload does not inherit the original late deadline.
      details.requestScheduled = performance.now()
      hls.trigger(Hls.Events.LEVEL_LOADING, {
        url: data.levelInfo.uri, level: data.level, levelInfo: data.levelInfo,
        id: data.id ?? 0, pathwayId: data.levelInfo.attrs?.['PATHWAY-ID'], deliveryDirectives: null,
      })
    }, duration * 1000)
  }
  const onError = (_event, data) => { if (data.fatal) cancel() }
  const dispose = () => {
    if (disposed) return
    disposed = true
    cancel()
    hls.off(Hls.Events.LEVEL_LOADED, onLoaded)
    hls.off(Hls.Events.LEVEL_LOADING, cancel)
    hls.off(Hls.Events.ERROR, onError)
    hls.off(Hls.Events.DESTROYING, dispose)
    video.removeEventListener('pause', cancel)
  }
  hls.on(Hls.Events.LEVEL_LOADED, onLoaded)
  hls.on(Hls.Events.LEVEL_LOADING, cancel)
  hls.on(Hls.Events.ERROR, onError)
  hls.on(Hls.Events.DESTROYING, dispose)
  video.addEventListener('pause', cancel)
  return dispose
}
