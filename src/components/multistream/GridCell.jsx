import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { LIVE_PLAYBACK_CONFIG, applyLivePlaybackPolicy } from '../../utils/livePlayback'
import { measureInvoke } from '../../utils/perf'
import { LIVE_HLS_TRANSPORT, HLS_WORKER_CONFIG } from '../../utils/tauriHls'
import { useT, t as translate } from '../../utils/i18n'
import { useStereoPanner } from '../../hooks/useStereoPanner'
import PhosphorIcon from '../icons/PhosphorIcon'
import LiveBadge from '../LiveBadge'
import { readVolume } from '../../utils/storage'

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
  const [streamSource, setStreamSource] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [isPlaying, setIsPlaying] = useState(true)
  const [quality, setQuality] = useState(gridCount >= 3 ? '720p60' : '1080p60')
  const [volume, setVolume] = useState(() => readVolume(40))
  const streamUrl = streamSource?.channel === channel && streamSource?.quality === quality ? streamSource.url : ''
  const isOffline = /no playable streams found|offline|no streams found/i.test(String(error))

  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const requestIdRef = useRef(0)
  const { pan, setPan, isSupported: isPanSupported } = useStereoPanner(videoRef, externalPan ?? 0)

  useEffect(() => {
    if (externalPan !== undefined) {
      setPan(externalPan)
    }
  }, [externalPan, setPan])

  const fetchStream = useCallback(async (ch, targetQ) => {
    if (!ch) return
    const requestId = ++requestIdRef.current
    const isCurrent = () => requestIdRef.current === requestId
    setLoading(true)
    setError('')
    setStreamSource(null)
    const q = targetQ || quality
    try {
      let url = ''
      try {
        url = await measureInvoke('get_stream_url', { channel: ch, quality: q })
      } catch {
        if (!isCurrent()) return
        url = await measureInvoke('get_stream_url', { channel: ch, quality: 'best' })
      }
      if (isCurrent()) setStreamSource({ url, channel: ch, quality: q })
    } catch (e) {
      const msg = typeof e === 'string' ? e : e?.message || 'Error de conexión al stream'
      if (isCurrent()) setError(msg)
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [quality])

  useEffect(() => {
    const loadTimer = channel
      ? window.setTimeout(() => fetchStream(channel, quality), 0)
      : null
    return () => {
      if (loadTimer !== null) window.clearTimeout(loadTimer)
      requestIdRef.current += 1
    }
  }, [channel, quality, fetchStream])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !streamUrl) return
    let hls = null
    const updatePolicy = () => applyLivePlaybackPolicy(hls, video)
    const policyEvents = ['loadedmetadata', 'resize', 'seeking', 'seeked', 'canplay', 'playing', 'pause']
    let disposed = false
    if (Hls.isSupported()) {
      hls = new Hls({
        ...HLS_WORKER_CONFIG,
        ...LIVE_HLS_TRANSPORT,
        ...LIVE_PLAYBACK_CONFIG,
        backBufferLength: 15,
        maxBufferLength: 10,
        maxMaxBufferLength: 20,
        capLevelToPlayerSize: true,
      })
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!disposed) video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!disposed && data.fatal) {
          setError(translate('player.error', 'Error al cargar el stream'))
          hls.stopLoad()
        }
      })
      hlsRef.current = hls
      hls.on(Hls.Events.LEVEL_UPDATED, updatePolicy)
      policyEvents.forEach(event => video.addEventListener(event, updatePolicy))
      updatePolicy()
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
    }
    return () => {
      disposed = true
      policyEvents.forEach(event => video.removeEventListener(event, updatePolicy))
      hls?.off(Hls.Events.LEVEL_UPDATED, updatePolicy)
      hls?.destroy()
      if (hlsRef.current === hls) hlsRef.current = null
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [streamUrl])

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = (!isAudioFocused && !isBinaural) || volume === 0
      videoRef.current.volume = Math.min(1.0, Math.max(0, volume / 100))
    }
  }, [isAudioFocused, isBinaural, volume, channel, streamUrl])

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
      video.play().catch(() => {})
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

        <form onSubmit={handleFormSubmit} className="flex flex-wrap justify-center gap-2 w-full max-w-[280px]">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={t('nav.searchPlaceholder', 'Buscar canal…')}
            aria-label={`${t('nav.searchPlaceholder', 'Buscar canal…')} ${index + 1}`}
            className="flex-1 min-w-[120px] px-3 py-1.5 rounded-xl bg-bg-tertiary border border-white/10 text-[12px] text-text-primary placeholder-text-muted/60 focus:outline-none focus:border-twitch"
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
    <div className="@container relative w-full h-full bg-black rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl group flex flex-col justify-between">
      {}
      <div className="relative flex-1 min-h-0 z-0 bg-bg-primary overflow-hidden">
        {loading && (
          <div role="status" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-4 text-center bg-bg-primary/80 pointer-events-none">
            <span aria-hidden="true" className="w-8 h-8 shrink-0 border-3 border-twitch border-t-transparent rounded-full motion-safe:animate-spin" />
            <span className="text-[12px] font-medium text-text-secondary">{t('player.connecting', 'Conectando…')}</span>
          </div>
        )}
        {error && !loading && (
          <div role="alert" className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 text-center bg-bg-primary/95 select-none animate-fade-in">
            <div className="flex max-h-full w-full flex-col items-center gap-1.5 overflow-y-auto">
              <div className="w-10 h-10 shrink-0 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-text-muted mb-0.5 shadow-lg">
                <PhosphorIcon name="Television" size={22} className="text-white/40" weight="duotone" />
              </div>
              <p className="shrink-0 max-w-full break-words text-xs font-bold text-white">
                {isOffline ? `${channel} está Offline` : 'Error al cargar'}
              </p>
              <p className="shrink-0 text-[12px] text-text-secondary max-w-[280px] w-full break-words [overflow-wrap:anywhere] leading-relaxed">
                {isOffline ? 'El canal no está transmitiendo en directo.' : error}
              </p>
              <button
                onClick={() => fetchStream(channel, quality)}
                className="shrink-0 px-3 py-1 mt-1 rounded-lg bg-twitch hover:bg-twitch-dark text-[11px] text-white font-bold cursor-pointer transition-colors flex items-center gap-1 shadow-md"
              >
                <PhosphorIcon name="ArrowsClockwise" size={12} weight="bold" />
                <span>{t('player.retry', 'Reintentar')}</span>
              </button>
            </div>
          </div>
        )}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain cursor-pointer"
          onClick={togglePlayPause}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          autoPlay
          playsInline
          muted={(!isAudioFocused && !isBinaural) || volume === 0}
          onError={() => { if (streamUrl) setError(t('player.error', 'Error al cargar el stream')) }}
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
      <div className="relative order-first shrink-0 z-20 flex flex-wrap items-center justify-between p-2.5 bg-gradient-to-b from-black/90 via-black/50 to-transparent opacity-95 group-hover:opacity-100 transition-opacity gap-2">
        <div className="flex flex-1 basis-full @[560px]:basis-auto items-center gap-2 min-w-[120px]">
          <button
            onClick={togglePlayPause}
            title={isPlaying ? t('player.pause', 'Pausar') : t('player.play', 'Reproducir')}
            className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors shrink-0"
          >
            <PhosphorIcon name={isPlaying ? "Pause" : "Play"} size={14} weight="fill" />
          </button>
          {!error && <LiveBadge />}
          <span title={channel} className="min-w-0 font-extrabold text-[13px] text-white tracking-tight truncate shadow-sm">{channel}</span>

          {}
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            className="shrink-0 bg-black/60 border border-white/20 rounded-lg px-1.5 py-0.5 text-[10px] font-mono text-twitch-light focus:outline-none focus:border-twitch cursor-pointer hover:bg-black/80 transition-colors hidden @[300px]:inline"
            title={t('set.streamQuality', 'Calidad de stream')}
          >
            {['best', '1440p60', '1080p60', '963p60', '936p60', '720p60', '480p30', '360p30', 'audio_only'].map(q => (
              <option key={q} value={q} className="bg-bg-secondary text-text-primary">{q}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
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
                className="w-12 @[420px]:w-16 h-1.5 rounded-lg appearance-none bg-white/20 cursor-pointer accent-twitch transition-all"
                title={`${t('set.defaultVolume', 'Volumen')}: ${volume}%`}
                aria-label={`${t('set.defaultVolume', 'Volumen')}: ${channel}`}
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
              className="p-1.5 rounded-lg border border-white/10 bg-black/60 text-text-muted hover:text-twitch-light hover:border-twitch/40 transition-all cursor-pointer hidden @[420px]:inline-flex"
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
