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
    console.log(`[TauriHLS] Fetching ${context.type}: ${context.url.substring(0, 100)}...`)
    invoke('fetch_m3u8_content', { url: context.url })
      .then(text => {
        const tload = performance.now()
        console.log(`[TauriHLS] OK ${context.type} (${text.length} bytes, ${Math.round(tload - trequest)}ms)`)
        callbacks.onSuccess(
          { url: context.url, data: absolutizePlaylist(text, context.url) },
          { trequest, tfirst: tload, tload, loaded: text.length, total: text.length },
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
