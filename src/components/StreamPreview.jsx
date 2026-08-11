

import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { invoke } from '@tauri-apps/api/core'
import { TauriPlaylistLoader } from '../utils/tauriHls'

export default function StreamPreview({ stream, enabled, quality = 'best' }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)

  const generationRef = useRef(0)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!enabled) return
    if (!stream || !stream.user_login) return
    const video = videoRef.current
    if (!video) return

    const channel = stream.user_login
    const gen = ++generationRef.current
    setError(false)

    let hls = null
    let cancelled = false

    async function start() {
      console.log(`[StreamPreview] Iniciando preview para ${channel}`)

      const FALLBACK_ORDER = ['best', '720p60', '720p', '480p', '360p', 'worst', 'audio_only']
      let m3u8Url = ''

      const TRIED = new Set()
      const orderToTry = FALLBACK_ORDER.includes(quality)
        ? [quality, ...FALLBACK_ORDER.filter(q => q !== quality)]
        : [quality, ...FALLBACK_ORDER]
      for (const q of orderToTry) {
        if (TRIED.has(q)) continue
        TRIED.add(q)
        try {
          m3u8Url = await invoke('get_stream_url', { channel, quality: q })
          if (m3u8Url) {
            console.log(`[StreamPreview] URL obtenida para ${channel} (${q}):`, m3u8Url.substring(0, 80) + '...')
            break
          }
        } catch (e) {
          console.warn(`[StreamPreview] get_stream_url falló para ${channel} quality=${q}:`, e)
        }
      }
      if (gen !== generationRef.current || cancelled) return
      if (!m3u8Url) { console.warn(`[StreamPreview] No se obtuvo URL para ${channel}`); setError(true); return }

      if (!Hls.isSupported()) {
        console.warn('[StreamPreview] Hls.isSupported() = false')
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = m3u8Url
        } else {
          setError(true)
        }
        return
      }

      console.log(`[StreamPreview] Creando instancia HLS para ${channel}`)
      hls = new Hls({
        loader: TauriPlaylistLoader,
        maxBufferLength: 30,        
        maxMaxBufferLength: 60,     
        capLevelToPlayerSize: true, 
        enableWorker: true,        
        lowLatencyMode: false,      
        backBufferLength: 30,       
        debug: false,
      })
      hlsRef.current = hls
      hls.loadSource(m3u8Url)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (gen !== generationRef.current || cancelled) return
        console.log(`[StreamPreview] Manifest parsed para ${channel}, reproduciendo`)
        video.play().catch(() => {  })
      })

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (gen !== generationRef.current || cancelled) return
        console.error(`[StreamPreview] HLS error para ${channel}:`, data.type, data.details, data.fatal ? '(FATAL)' : '')
        if (!data.fatal) return

        setError(true)
      })
    }

    start()

    return () => {
      cancelled = true

      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [stream?.id, stream?.user_login, enabled, quality]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) return null

  return (
    <video
      ref={videoRef}
      className="absolute inset-0 w-full h-full object-cover z-10"
      autoPlay
      muted
      loop
      playsInline
      aria-hidden="true"
      onError={() => setError(true)}
      style={error ? { display: 'none' } : undefined}
    />
  )
}
