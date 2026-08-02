/**
 * @file StreamPreview (M-7 / Auditoria WT-20260628-01).
 * Preview HLS silencioso para el hero carousel. Solo se monta si
 * `enabled` es true. Reproduce muted, sin controles, con la calidad
 * mas baja posible ('worst') para minimizar bandwidth.
 *
 * Patron de "generacion" inspirado en Lecs/2026-06-23-fixes-pantalla-negra-2.md:
 * cuando cambia `stream.id` o `stream`, cualquier callback asincrono
 * pendiente se descarta comparando `gen` contra `generationRef.current`.
 *
 * Patron HLS directo inspirado en Lecs/2026-06-23-fixes-cors-quality-loop.md
 * (FIX WT-20260628-111): se pasa la URL de Twitch.tv directamente a
 * hls.js. Antes se usaba `fetch_m3u8_content` (backend Rust) + Blob URL,
 * pero ese patrón congelaba el live a los 5-6s porque el blob es un
 * snapshot estático y hls.js no podía refrescar el m3u8. La CSP del
 * Tauri permite connect-src a *.ttvnw.net, así que no hay CORS.
 *
 * @typedef {object} StreamPreviewProps
 * @property {object} stream - { id, user_login, ... }
 * @property {boolean} enabled - Si es false, el componente retorna null.
 * @property {string} [quality='worst'] - Calidad a usar. 'worst' minimiza bandwidth.
 */

import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { invoke } from '@tauri-apps/api/core'

/**
 * Preview HLS silencioso del stream. Sin UI: solo el <video> element.
 * Si `enabled` es false retorna null (cero CPU/rede).
 */
export default function StreamPreview({ stream, enabled, quality = 'best' }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  // Patron "generacional" (Lecs/2026-06-23-fixes-pantalla-negra-2.md):
  // cada vez que cambia el stream o su id, incrementamos la generacion
  // y descartamos cualquier callback asincrono de la instancia anterior.
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
      // ── FALLBACK progresivo de calidades ──
      // Priorizamos alta definición para que el carrusel se vea nítido.
      const FALLBACK_ORDER = ['best', '720p60', '720p', '480p', '360p', 'worst', 'audio_only']
      let m3u8Url = ''
      // FIX WT-20260628-108: el filtro anterior era siempre true
      // (evaluaba !FALLBACK_ORDER.includes(quality) que es false porque
      // 'worst' SI esta en el array). Resultado: 6 round-trips IPC en
      // serie al backend Rust, ~5s de "freeze" percibido.
      // Ahora: probamos 'quality' primero, y solo si falla vamos al
      // fallback. Si 'quality' esta en FALLBACK_ORDER, evitamos duplicados.
      const TRIED = new Set()
      const orderToTry = FALLBACK_ORDER.includes(quality)
        ? [quality, ...FALLBACK_ORDER.filter(q => q !== quality)]
        : [quality, ...FALLBACK_ORDER]
      for (const q of orderToTry) {
        if (TRIED.has(q)) continue
        TRIED.add(q)
        try {
          m3u8Url = await invoke('get_stream_url', { channel, quality: q })
          if (m3u8Url) break
        } catch (_e) { /* try next */ }
      }
      if (gen !== generationRef.current || cancelled) return
      if (!m3u8Url) { setError(true); return }

      // FIX WT-20260628-111: NO usar blob URL para live streams.
      // hls.js necesita refrescar el m3u8 periódicamente para obtener
      // segmentos nuevos; un blob URL es un snapshot estático, así que
      // hls.js se queda sin segmentos nuevos a los 5-6s y el video
      // se congela. Pasamos la URL directa de Twitch.tv (la CSP del
      // Tauri permite connect-src a *.ttvnw.net, así que no hay CORS).
      // El comando fetch_m3u8_content queda obsoleto para este caso.

      // ── hls.js con la URL directa ──
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = m3u8Url
        return
      }
      if (!Hls.isSupported()) {
        setError(true)
        return
      }

      hls = new Hls({
        maxBufferLength: 30,        // 30s de buffer (default hls.js, suficiente para previews)
        maxMaxBufferLength: 60,     // cap de 60s
        capLevelToPlayerSize: true, // no descargar qualities más altas que el tamaño del video
        enableWorker: true,        // procesar segmentos en Web Worker
        lowLatencyMode: false,      // NO low-latency (es preview, no live real)
        backBufferLength: 30,       // mantener 30s hacia atrás para seek
        debug: false,
      })
      hlsRef.current = hls
      hls.loadSource(m3u8Url)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (gen !== generationRef.current || cancelled) return
        video.play().catch(() => { /* autoplay bloqueado, noop */ })
      })

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (gen !== generationRef.current || cancelled) return
        if (!data.fatal) return
        // Errores fatales: el preview es best-effort, no recuperamos.
        setError(true)
      })
    }

    start()

    return () => {
      cancelled = true
      // El gen ya cambio (o va a cambiar) en el proximo effect; cualquier
      // callback async que quede debera chequear `gen !== generationRef.current`
      // y salir. Destruimos hls.js para liberar recursos del navegador.
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
