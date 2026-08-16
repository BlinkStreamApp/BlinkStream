import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { measureInvoke } from '../../utils/perf'
import { TauriPlaylistLoader } from '../../utils/tauriHls'
import { useT } from '../../utils/i18n'
import { useStereoPanner } from '../../hooks/useStereoPanner'
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
  onSelectSingleChannel,
  gridCount = 2,
  externalPan,
  onPanChange,
  isBinaural = false,
}) {
  const t = useT()
  const [inputVal, setInputVal] = useState('')
  const [streamUrl, setStreamUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [isPlaying, setIsPlaying] = useState(true)
  const [quality, setQuality] = useState(gridCount >= 3 ? '720p60' : '1080p60')
  const [volume, setVolume] = useState(() => {
    const v = Number(localStorage.getItem('blinkstream_volume'))
    return !isNaN(v) && v > 0 ? v : 40 
  })

  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const { pan, setPan, isSupported: isPanSupported } = useStereoPanner(videoRef, externalPan ?? 0)

  useEffect(() => {
    if (externalPan !== undefined) {
      setPan(externalPan)
    }
  }, [externalPan, setPan])

  const fetchStream = useCallback(async (ch, targetQ) => {
    if (!ch) return
    setLoading(true)
    setError('')
    setStreamUrl('')
    const q = targetQ || quality
    try {
      let url = ''
      try {
        url = await measureInvoke('get_stream_url', { channel: ch, quality: q })
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
  }, [quality])

  useEffect(() => {
    const loadTimer = channel
      ? window.setTimeout(() => fetchStream(channel, quality), 0)
      : null
    return () => {
      if (loadTimer !== null) window.clearTimeout(loadTimer)
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [channel, quality, fetchStream])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !streamUrl) return
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        loader: TauriPlaylistLoader,
        lowLatencyMode: true,
        backBufferLength: 10,
        maxBufferLength: 8,
        maxMaxBufferLength: 16,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 2.5,
        maxLiveSyncPlaybackRate: 1.15,
        capLevelToPlayerSize: true,
        enableWorker: true,
      })
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().then(() => setIsPlaying(true)).catch(() => {})
      })
      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
    }
  }, [streamUrl])

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isAudioFocused || volume === 0
      if (isAudioFocused) {
        videoRef.current.volume = Math.min(1.0, Math.max(0, volume / 100))
      }
    }
  }, [isAudioFocused, volume])

  const handleVolumeChange = (val) => {
    const v = Number(val)
    setVolume(v)
    try {
      localStorage.setItem('blinkstream_volume', String(v))
    } catch {  }
  }

  const togglePlayPause = () => {
    const video = videoRef.current
    if (!video) return
    if (!video.paused) {
      video.pause()
      if (hlsRef.current) {
        try { hlsRef.current.stopLoad() } catch {  }
      }
      setIsPlaying(false)
    } else {
      if (hlsRef.current) {
        try { hlsRef.current.startLoad() } catch {  }
      }
      video.play().then(() => setIsPlaying(true)).catch(() => {})
      setIsPlaying(true)
    }
  }

  const handleFormSubmit = (e) => {
    e.preventDefault()
    const clean = inputVal.trim().toLowerCase()
    if (clean) {
      onSetChannel(index, clean)
    }
  }

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

  return (
    <div className="relative w-full h-full bg-black rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl group flex flex-col justify-between">
      {}
      <div className="absolute inset-0 z-0 flex items-center justify-center bg-bg-primary">
        {loading && (
          <div className="flex flex-col items-center gap-2 z-10">
            <span className="w-8 h-8 border-3 border-twitch border-t-transparent rounded-full animate-spin" />
            <span className="text-[12px] font-medium text-text-secondary">{t('player.connecting', 'Conectando…')}</span>
          </div>
        )}
        {error && !loading && (() => {
          const lower = String(error).toLowerCase()
          const isOffline = lower.includes('no playable streams found') || lower.includes('offline') || lower.includes('no streams found')
          return (
            <div className="flex flex-col items-center gap-1.5 p-4 text-center z-10 max-w-[85%] select-none animate-fade-in">
              <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-text-muted mb-0.5 shadow-lg">
                <PhosphorIcon name="Television" size={22} className="text-white/40" weight="duotone" />
              </div>
              <p className="text-xs font-bold text-white">
                {isOffline ? `${channel} está Offline` : 'Error al cargar'}
              </p>
              <p className="text-[11px] text-text-muted max-w-[200px] leading-tight">
                {isOffline ? 'El canal no está transmitiendo en directo.' : error}
              </p>
              <button
                onClick={() => fetchStream(channel, quality)}
                className="px-3 py-1 mt-1 rounded-lg bg-twitch hover:bg-twitch-dark text-[11px] text-white font-bold cursor-pointer transition-colors flex items-center gap-1 shadow-md"
              >
                <PhosphorIcon name="ArrowsClockwise" size={12} weight="bold" />
                <span>{t('player.retry', 'Reintentar')}</span>
              </button>
            </div>
          )
        })()}
        <video
          ref={videoRef}
          className="w-full h-full object-contain cursor-pointer"
          onClick={togglePlayPause}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          autoPlay
          playsInline
          muted={!isAudioFocused && !isBinaural}
        />
        {!isPlaying && !loading && !error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-twitch/80 border border-white/30 flex items-center justify-center text-white shadow-2xl backdrop-blur-sm">
              <PhosphorIcon name="Pause" size={36} weight="fill" />
            </div>
          </div>
        )}
      </div>

      {}
      <div className="relative z-20 flex items-center justify-between p-2.5 bg-gradient-to-b from-black/90 via-black/50 to-transparent opacity-95 group-hover:opacity-100 transition-opacity gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={togglePlayPause}
            title={isPlaying ? t('player.pause', 'Pausar') : t('player.play', 'Reproducir')}
            className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors shrink-0"
          >
            <PhosphorIcon name={isPlaying ? "Pause" : "Play"} size={14} weight="fill" />
          </button>
          <LiveBadge />
          <span className="font-extrabold text-[13px] text-white tracking-tight truncate shadow-sm">{channel}</span>

          {}
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            className="bg-black/60 border border-white/20 rounded-lg px-1.5 py-0.5 text-[10px] font-mono text-twitch-light focus:outline-none focus:border-twitch cursor-pointer hover:bg-black/80 transition-colors hidden sm:inline"
            title={t('set.streamQuality', 'Calidad de stream')}
          >
            {['best', '1440p60', '1080p60', '963p60', '936p60', '720p60', '480p30', '360p30', 'audio_only'].map(q => (
              <option key={q} value={q} className="bg-bg-secondary text-text-primary">{q}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {}
          <div className={`flex items-center gap-1.5 px-1.5 py-1 rounded-lg border transition-all ${
            isAudioFocused || isBinaural
              ? 'bg-twitch/30 border-twitch shadow-[0_0_15px_rgba(145,70,255,0.4)]'
              : 'bg-black/60 border-white/10'
          }`}>
            <button
              onClick={() => onFocusAudio(index)}
              title={t('grid.audioTip', 'Clic para enfocar audio de este stream')}
              className={`flex items-center justify-center transition-transform cursor-pointer ${
                isAudioFocused || isBinaural ? 'text-green-400 scale-110 font-bold' : 'text-text-muted hover:text-white'
              }`}
            >
              <PhosphorIcon name={(isAudioFocused || isBinaural) && volume > 0 ? "SpeakerHigh" : "SpeakerSlash"} size={17} weight={isAudioFocused || isBinaural ? "fill" : "regular"} />
            </button>

            {(isAudioFocused || isBinaural) && (
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => handleVolumeChange(e.target.value)}
                className="w-14 sm:w-16 h-1.5 rounded-lg appearance-none bg-white/20 cursor-pointer accent-twitch transition-all"
                title={`${t('set.defaultVolume', 'Volumen')}: ${volume}%`}
              />
            )}

            {(isAudioFocused || isBinaural) && isPanSupported && (
              <div className="flex items-center bg-black/50 rounded p-0.5 border border-white/10 text-[9px] font-mono font-bold ml-0.5">
                <button
                  type="button"
                  onClick={() => { setPan(-1); onPanChange?.(index, -1); }}
                  title={t('grid.panLeft', 'Oído Izquierdo (L)')}
                  className={`px-1 py-0.5 rounded cursor-pointer transition-colors ${pan <= -0.5 ? 'bg-cyan-500 text-black font-extrabold' : 'text-text-muted hover:text-white'}`}
                >
                  L
                </button>
                <button
                  type="button"
                  onClick={() => { setPan(0); onPanChange?.(index, 0); }}
                  title={t('grid.panCenter', 'Centro (Estéreo)')}
                  className={`px-1 py-0.5 rounded cursor-pointer transition-colors ${pan > -0.5 && pan < 0.5 ? 'bg-twitch text-white' : 'text-text-muted hover:text-white'}`}
                >
                  C
                </button>
                <button
                  type="button"
                  onClick={() => { setPan(1); onPanChange?.(index, 1); }}
                  title={t('grid.panRight', 'Oído Derecho (R)')}
                  className={`px-1 py-0.5 rounded cursor-pointer transition-colors ${pan >= 0.5 ? 'bg-cyan-500 text-black font-extrabold' : 'text-text-muted hover:text-white'}`}
                >
                  R
                </button>
              </div>
            )}
          </div>

          {}
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

          {}
          {onSelectSingleChannel && (
            <button
              onClick={() => onSelectSingleChannel(channel)}
              title={t('grid.jumpSingle', 'Ver en reproductor principal individual (pantalla completa / teatro)')}
              className="p-1.5 rounded-lg border border-white/10 bg-black/60 text-text-muted hover:text-twitch-light hover:border-twitch/40 transition-all cursor-pointer hidden md:inline-flex"
            >
              <PhosphorIcon name="CornersOut" size={17} weight="regular" />
            </button>
          )}

          {}
          <button
            onClick={() => onRemove(index)}
            title={t('grid.remove', 'Quitar stream de la celda')}
            className="p-1.5 rounded-lg border border-white/10 bg-black/60 text-text-muted hover:text-red-400 hover:border-red-500/40 transition-all cursor-pointer"
          >
            <PhosphorIcon name="X" size={17} weight="bold" />
          </button>
        </div>
      </div>

      {}
      {isAudioFocused && (
        <div className="absolute inset-0 z-10 pointer-events-none border-2 border-twitch/80 rounded-2xl shadow-[inset_0_0_20px_rgba(145,70,255,0.3)]" />
      )}
    </div>
  )
}
