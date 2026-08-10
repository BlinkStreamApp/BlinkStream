import Hls from 'hls.js'
import { measureInvoke } from './perf'

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
    measureInvoke('fetch_m3u8_content', { url: context.url })
      .then(text => {
        const tload = performance.now()
        callbacks.onSuccess(
          { url: context.url, data: absolutizePlaylist(text, context.url) },
          { trequest, tfirst: tload, tload, loaded: text.length, total: text.length },
          context,
          null,
        )
      })
      .catch(error => {
        callbacks.onError(
          { code: 0, text: error?.message || String(error), type: 'networkError', details: 'manifestLoadError' },
          context,
          null,
        )
      })
  }
}

