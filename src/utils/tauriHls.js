import Hls from 'hls.js'
import { invoke } from '@tauri-apps/api/core'

function absolutizePlaylist(text, baseUrl) {
  return text.split(/\r?\n/).map(line => {
    const rewriteUri = (uri) => {
      try { return new URL(uri, baseUrl).href } catch { return uri }
    }

    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) return rewriteUri(trimmed)
    return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${rewriteUri(uri)}"`)
  }).join('\n')
}

export class TauriPlaylistLoader extends Hls.DefaultConfig.loader {
  load(context, config, callbacks) {
    if (context.type !== 'manifest' && context.type !== 'level') {
      return super.load(context, config, callbacks)
    }

    const trequest = performance.now()
    if (this.stats && this.stats.loading) {
      this.stats.loading.start = trequest
    }

    invoke('fetch_m3u8_content', { url: context.url })
      .then(text => {
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
          { url: context.url, data: absolutizePlaylist(text, context.url), code: 200 },
          this.stats,
          context,
          null,
        )
      })
      .catch(error => {
        console.error(`[TauriHLS] FAILED ${context.type}:`, context.url, error)
        callbacks.onError(
          { code: 0, text: error?.message || String(error), type: 'networkError', details: 'manifestLoadError' },
          context,
          null,
        )
      })
  }
}
