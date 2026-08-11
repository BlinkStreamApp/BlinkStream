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
    const isPlaylist = context.type === 'manifest' || context.type === 'level'
    const isBinary = context.type === 'frag' || context.type === 'key'
      || context.type === 'audio' || context.type === 'subtitle'

    if (!isPlaylist && !isBinary) {
      return super.load(context, config, callbacks)
    }

    const trequest = performance.now()

    if (isPlaylist) {
      invoke('fetch_m3u8_content', { url: context.url })
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
          console.error(`[TauriHLS] playlist fetch failed (${context.type}):`, context.url, error)
          callbacks.onError(
            { code: 0, text: error?.message || String(error), type: 'networkError', details: 'manifestLoadError' },
            context,
            null,
          )
        })
    } else {
      invoke('fetch_segment', { url: context.url })
        .then(bytes => {
          const tload = performance.now()
          let data
          if (bytes instanceof Uint8Array) {
            data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
          } else if (bytes instanceof ArrayBuffer) {
            data = bytes
          } else if (Array.isArray(bytes)) {
            data = new Uint8Array(bytes).buffer
          } else {
            data = bytes
          }
          callbacks.onSuccess(
            { url: context.url, data },
            { trequest, tfirst: tload, tload, loaded: data.byteLength || 0, total: data.byteLength || 0 },
            context,
            null,
          )
        })
        .catch(error => {
          console.error(`[TauriHLS] segment fetch failed (${context.type}):`, context.url, error)
          callbacks.onError(
            { code: 0, text: error?.message || String(error), type: 'networkError', details: 'fragLoadError' },
            context,
            null,
          )
        })
    }
  }
}
