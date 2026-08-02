import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { measureInvoke } from '../../utils/perf'
import { useT } from '../../utils/i18n'
import PhosphorIcon from '../icons/PhosphorIcon'
import LiveBadge from '../LiveBadge'

export default function GridCell({
  index,
  channel,
  onSetChannel,
  onRemove,
  isAudioFocused,
  onFocusAudio,
  isChatActive,
  onSelectChat,
  gridCount = 2
}) {
  const t = useT()
  const [inputVal, setInputVal] = useState('')
  const [streamUrl, setStreamUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const videoRef = useRef(null)
  const hlsRef = useRef(null)

  // Calidad optimizada de bajo consumo si hay 3 o 4 streams a la vez
  const targetQuality = gridCount >= 3 ? '720p60' : '1080p60'

  const fetchStream = useCallback(async (ch) => {
    if (!ch) return
    setLoading(true)
    setError('')
    setStreamUrl('')
    try {
      let url = ''
      try {
        url = await measureInvoke('get_stream_url', { channel: ch, quality: targetQuality })
      } catch {
        url = await measureInvoke('get_stream_url', { channel: ch, quality: 'best' })
      }
      setStreamUrl(url)
    } catch (e) {
      const msg = typeof e === 'string' ? e : e?.message || 'Error de conexión al stream'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [targetQuality])

  useEffect(() => {
    if (channel) {
      fetchStream(channel)
    } else {
      setStreamUrl('')
      setError('')
    }
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [channel, fetchStream])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !streamUrl) return
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      return
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 120,
        capLevelToPlayerSize: true,
        enableWorker: true,
      })
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {/* ignore play policy error */})
      })
      hlsRef.current = hls
    }
  }, [streamUrl])

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isAudioFocused
      if (isAudioFocused) {
        videoRef.current.volume = 1.0
      }
    }
  }, [isAudioFocused])

  const handleFormSubmit = (e) => {
    e.preventDefault()
    const clean = inputVal.trim().toLowerCase()
    if (clean) {
      onSetChannel(index, clean)
    }
  }

  // Celda vacía para añadir nuevo canal
  if (!channel) {
    return (
      <div className="w-full h-full min-h-[200px] bg-bg-secondary/70 border border-dashed border-white/15 rounded-2xl flex flex-col items-center justify-center p-6 text-center hover:border-twitch/60 transition-all group">
        <div className="w-14 h-14 rounded-2xl bg-twitch/10 border border-twitch/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(145,70,255,0.15)] text-twitch-light">
          <PhosphorIcon name="Plus" size={32} weight="bold" />
        </div>
        <h4 className="text-[14px] font-bold text-text-primary mb-1">{t('grid.emptyCell', 'Celda de directo vacía')}</h4>
        <p className="text-[12px] text-text-muted mb-4">{t('grid.addChannel', 'Añadir canal en vivo...')}</p>
        
        <form onSubmit={handleFormSubmit} className="flex gap-2 w-full max-w-[240px]">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={t('nav.searchPlaceholder', 'Buscar canal…')}
            className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-bg-tertiary border border-white/10 text-[12px] text-text-primary placeholder-text-muted/60 focus:outline-none focus:border-twitch"
          />
          <button
            type="submit"
            className="px-4 py-1.5 rounded-xl bg-twitch hover:bg-twitch-dark text-white font-bold text-[12px] shadow-md transition-all cursor-pointer"
          >
            {t('grid.load', 'Cargar')}
          </button>
        </form>
      </div>
    )
  }

  // Celda con canal reproduciendo
  return (
    <div className="relative w-full h-full bg-black rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl group flex flex-col justify-between">
      {/* Contenedor del video */}
      <div className="absolute inset-0 z-0 flex items-center justify-center bg-bg-primary">
        {loading && (
          <div className="flex flex-col items-center gap-2 z-10">
            <span className="w-8 h-8 border-3 border-twitch border-t-transparent rounded-full animate-spin" />
            <span className="text-[12px] font-medium text-text-secondary">{t('player.connecting', 'Conectando…')}</span>
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-col items-center gap-2 p-4 text-center z-10 max-w-[80%]">
            <PhosphorIcon name="WarningCircle" size={32} className="text-red-400" weight="duotone" />
            <p className="text-[13px] font-semibold text-red-300">{error}</p>
            <button
              onClick={() => fetchStream(channel)}
              className="px-3 py-1 mt-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-[11px] text-red-200 font-bold cursor-pointer transition-colors"
            >
              {t('player.retry', 'Reintentar')}
            </button>
          </div>
        )}
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          autoPlay
          playsInline
          muted={!isAudioFocused}
        />
      </div>

      {/* Cabecera flotante de información y controles del Grid Cell */}
      <div className="relative z-20 flex items-center justify-between p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent opacity-90 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-2 min-w-0">
          <LiveBadge />
          <span className="font-bold text-[13px] text-white tracking-tight truncate shadow-sm">{channel}</span>
          {gridCount >= 3 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-text-secondary font-mono border border-white/10 hidden sm:inline" title={t('grid.maxWarning', 'Optimizado a 720p para ahorro de recursos')}>
              720p60
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Foco de Audio */}
          <button
            onClick={() => onFocusAudio(index)}
            title={t('grid.audioTip', 'Clic para enfocar audio de este stream')}
            className={`p-1.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
              isAudioFocused
                ? 'bg-twitch text-white border-twitch shadow-[0_0_15px_rgba(145,70,255,0.6)] scale-105'
                : 'bg-black/60 text-text-muted hover:text-white border-white/10 hover:border-white/30'
            }`}
          >
            <PhosphorIcon name={isAudioFocused ? "SpeakerHigh" : "SpeakerSlash"} size={17} weight={isAudioFocused ? "fill" : "regular"} />
          </button>

          {/* Seleccionar como Chat activo */}
          <button
            onClick={() => onSelectChat(index, channel)}
            title={`${t('grid.chatSelector', 'Chat Activo:')} ${channel}`}
            className={`p-1.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
              isChatActive
                ? 'bg-fuchsia-600 text-white border-fuchsia-400 shadow-[0_0_15px_rgba(192,38,211,0.5)] scale-105 font-bold'
                : 'bg-black/60 text-text-muted hover:text-white border-white/10 hover:border-white/30'
            }`}
          >
            <PhosphorIcon name="ChatCircleDots" size={17} weight={isChatActive ? "fill" : "regular"} />
          </button>

          {/* Eliminar celda */}
          <button
            onClick={() => onRemove(index)}
            title={t('grid.remove', 'Quitar stream de la celda')}
            className="p-1.5 rounded-lg border border-white/10 bg-black/60 text-text-muted hover:text-red-400 hover:border-red-500/40 transition-all cursor-pointer"
          >
            <PhosphorIcon name="X" size={17} weight="bold" />
          </button>
        </div>
      </div>

      {/* Borde interactivo si el audio está enfocado */}
      {isAudioFocused && (
        <div className="absolute inset-0 z-10 pointer-events-none border-2 border-twitch/80 rounded-2xl shadow-[inset_0_0_20px_rgba(145,70,255,0.3)]" />
      )}
    </div>
  )
}
