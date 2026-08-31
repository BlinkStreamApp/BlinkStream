

import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { measureInvoke } from '../utils/perf'
import { TauriPlaylistLoader } from '../utils/tauriHls'
import { validateProps, isString, isNumber, isBoolean, optional } from '../utils/validateProps'
import { useRecording } from '../hooks/useRecording'
import { safeOpenUrl } from '../utils/tauriEnv'
import { useT } from '../utils/i18n'
import QualitySelector from './QualitySelector'
import ClipPlayer from './ClipPlayer'
import VodPlayer from './VodPlayer'
import LiveBadge from './LiveBadge'
import ToggleSwitch from './ToggleSwitch'
import PhosphorIcon from './icons/PhosphorIcon'
import Chat from './Chat'
import EmoteRainOverlay from './EmoteRainOverlay'
import { getItem, setItem, STORAGE_KEYS } from '../utils/storage'
import { useAudioCompressor } from '../hooks/useAudioCompressor'
import { useLiveDVR } from '../hooks/useLiveDVR'
import DropsModal from './drops/DropsModal'
import { startDropsWatcher, stopDropsWatcher } from '../utils/dropsWatcher'

function PlayIcon() { return <PhosphorIcon name="Play" size={24} weight="fill" /> }
function PauseIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="2"/><rect x="14" y="4" width="5" height="16" rx="2"/></svg> }
function VolumeHigh() { return <PhosphorIcon name="SpeakerHigh" size={22} weight="regular" /> }
function VolumeMute() { return <PhosphorIcon name="SpeakerSlash" size={22} weight="regular" /> }
function FullscreenIcon() { return <PhosphorIcon name="CornersOut" size={20} weight="regular" /> }
function TheatreIcon() { return <PhosphorIcon name="MonitorPlay" size={20} weight="regular" /> }
function ClipIcon() { return <PhosphorIcon name="PlayCircle" size={19} weight="regular" /> }
function VodIcon() { return <PhosphorIcon name="FilmStrip" size={19} weight="regular" /> }
function SettingsIcon() { return <PhosphorIcon name="Gear" size={20} weight="regular" /> }

const FALLBACK_QUALITIES = ['audio_only', '160p', '360p', '480p', '720p', '720p60', '936p60', '963p60', '1080p60', '1440p60']

function formatPlayerError(rawError, channelName, t) {
  if (!rawError) return null
  const str = String(rawError)
  const lower = str.toLowerCase()
  if (
    lower.includes('no playable streams found') ||
    lower.includes('offline') ||
    lower.includes('no streams found') ||
    lower.includes('stream is offline') ||
    lower.includes('is not live')
  ) {
    const rawTitle = t ? t('player.offlineTitle', '{channel} está Offline') : '{channel} está Offline'
    const title = rawTitle.replace('{channel}', channelName || (t ? t('player.channelDefault', 'El canal') : 'El canal'))
    return {
      isOffline: true,
      title,
      desc: t ? t('player.offlineDesc', 'Este canal no está transmitiendo en directo en este momento.') : 'Este canal no está transmitiendo en directo en este momento.',
    }
  }
  return {
    isOffline: false,
    title: t ? t('player.recordingError', 'Error de reproducción') : 'Error de reproducción',
    desc: str.replace(/^No se pudo cargar [^:]+:\s*/i, '').replace(/Streamlink fallo:\s*error:\s*/i, ''),
  }
}

function PlayerSettingsPanel({
  onClose,
  compact,
  onToggleCompact,
  audioOnly,
  onToggleAudioOnly,
  showStats,
  onToggleStats,
  showOverlayChat,
  onToggleOverlayChat,
  showEmoteEffects,
  onToggleEmoteEffects,
  isNightMode,
  onToggleNightMode,
  onOpenAppSettings,
  quality,
  onQualityChange,
  availableQualities,
}) {
  const compactValue = compact || false

  return (
    <div className="absolute bottom-14 right-3 z-50 w-64 max-h-[75vh] overflow-y-auto custom-scrollbar bg-[#0f1016]/95 backdrop-blur-2xl border border-white/15 rounded-xl p-3 text-text-primary shadow-[0_10px_35px_rgba(0,0,0,0.95)] animate-fade-in space-y-2 text-xs select-none">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
        <div className="flex items-center gap-1.5">
          <PhosphorIcon name="SlidersHorizontal" size={15} weight="duotone" className="text-twitch" />
          <span className="text-xs font-extrabold text-white tracking-wide">Ajustes de Vídeo</span>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-white cursor-pointer transition-colors p-0.5" aria-label="Cerrar ajustes">
          <PhosphorIcon name="X" size={14} weight="bold" />
        </button>
      </div>

      {}
      {availableQualities && availableQualities.length > 0 && (
        <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-twitch/15 border border-twitch/30 gap-2 mb-1 shadow-sm">
          <div className="flex items-center gap-1.5 text-twitch-light shrink-0">
            <PhosphorIcon name="MonitorPlay" size={15} weight="duotone" />
            <span className="font-bold text-[11px] text-white">Calidad</span>
          </div>
          <div className="w-36">
            <QualitySelector current={quality} onChange={onQualityChange} qualities={availableQualities} isSettings={true} />
          </div>
        </div>
      )}

      <div className="space-y-0.5 text-[11px]">
        {}
        <div 
          onClick={onToggleNightMode}
          title="Atenúa picos y ruidos fuertes repentinos y realza voces suaves"
          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer border border-transparent hover:border-white/[0.05]"
        >
          <div className="flex items-center gap-2">
            <PhosphorIcon name="Moon" size={15} weight="duotone" className={isNightMode ? "text-amber-300" : "text-text-muted"} />
            <span className="font-semibold text-white/90">Modo Nocturno (Audio)</span>
          </div>
          <ToggleSwitch active={isNightMode} onClick={onToggleNightMode} />
        </div>

        {}
        <div 
          onClick={onToggleAudioOnly}
          title="Ahorro de datos y ancho de banda"
          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer border border-transparent hover:border-white/[0.05]"
        >
          <div className="flex items-center gap-2">
            <PhosphorIcon name="Headphones" size={15} weight="duotone" className={audioOnly ? "text-twitch" : "text-text-muted"} />
            <span className="font-semibold text-white/90">Modo Solo Audio</span>
          </div>
          <ToggleSwitch active={audioOnly} onClick={onToggleAudioOnly} />
        </div>

        {}
        <div 
          onClick={onToggleStats}
          title="Bitrate, FPS, Códec y Buffer en vivo"
          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer border border-transparent hover:border-white/[0.05]"
        >
          <div className="flex items-center gap-2">
            <PhosphorIcon name="ChartBar" size={15} weight="duotone" className={showStats ? "text-twitch" : "text-text-muted"} />
            <span className="font-semibold text-white/90">Estadísticas de Vídeo</span>
          </div>
          <ToggleSwitch active={showStats} onClick={onToggleStats} />
        </div>

        {}
        <div 
          onClick={onToggleOverlayChat}
          title="Mensajes flotantes sobre el stream"
          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer border border-transparent hover:border-white/[0.05]"
        >
          <div className="flex items-center gap-2">
            <PhosphorIcon name="ChatsCircle" size={15} weight="duotone" className={showOverlayChat ? "text-twitch" : "text-text-muted"} />
            <span className="font-semibold text-white/90">Chat en Pantalla</span>
          </div>
          <ToggleSwitch active={showOverlayChat} onClick={onToggleOverlayChat} />
        </div>

        {}
        <div 
          onClick={onToggleEmoteEffects}
          title="Lluvia en pantalla y medidor de combos"
          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer border border-transparent hover:border-white/[0.05]"
        >
          <div className="flex items-center gap-2">
            <PhosphorIcon name="Sparkle" size={15} weight="duotone" className={showEmoteEffects ? "text-twitch" : "text-text-muted"} />
            <span className="font-semibold text-white/90">Lluvia de Emotes</span>
          </div>
          <ToggleSwitch active={showEmoteEffects} onClick={onToggleEmoteEffects} />
        </div>

        {}
        <div 
          onClick={onToggleCompact}
          title="Reduce márgenes de la interfaz"
          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer border border-transparent hover:border-white/[0.05]"
        >
          <div className="flex items-center gap-2">
            <PhosphorIcon name="ArrowsInSimple" size={15} weight="duotone" className={compactValue ? "text-twitch" : "text-text-muted"} />
            <span className="font-semibold text-white/90">Modo Compacto</span>
          </div>
          <ToggleSwitch active={compactValue} onClick={onToggleCompact} />
        </div>
      </div>

      {onOpenAppSettings && (
        <button
          type="button"
          onClick={() => { onClose(); onOpenAppSettings(); }}
          className="w-full mt-2 py-1.5 px-2.5 bg-gradient-to-r from-twitch/20 to-fuchsia-600/20 hover:from-twitch/35 hover:to-fuchsia-600/35 border border-twitch/40 rounded-lg text-[11px] font-extrabold text-white transition-all duration-200 flex items-center justify-center gap-1.5 shadow-md cursor-pointer hover:scale-[1.01]"
        >
          <PhosphorIcon name="Palette" size={15} weight="duotone" />
          <span>Personalizar App & Temas</span>
        </button>
      )}
    </div>
  )
}

export default function VideoPlayer({
  channel, quality, onQualityChange, volume, onVolumeChange,
  theatreMode, onToggleTheatre, compact, onToggleCompact, onOpenAppSettings,
  isLoggedIn, twitchToken, twitchUsername, broadcasterId, onOpenCPPanel, isModerator, isBroadcaster, viewerLogin, onLoginWithToken,
}) {
  const t = useT()

  const isFunc = { name: 'function', check: (v) => typeof v === 'function' }
  validateProps(
    { channel, quality, onQualityChange, volume, onVolumeChange, theatreMode, onToggleTheatre, compact, onToggleCompact, onOpenAppSettings },
    {
      channel: isString,
      quality: isString,
      onQualityChange: isFunc,
      volume: isNumber,
      onVolumeChange: isFunc,
      theatreMode: isBoolean,
      onToggleTheatre: isFunc,
      compact: isBoolean,
      onToggleCompact: isFunc,
      onOpenAppSettings: optional(isFunc),
    },
    'VideoPlayer props',
  )

  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const [showVods, setShowVods] = useState(false)
  const isFetchingRef = useRef(false)
  const networkRetriesRef = useRef(0)
  const controlsTimeoutRef = useRef(null)
  const volumeRef = useRef(volume)
  const fallbackTimersRef = useRef(null)
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(false)
  const [streamUrl, setStreamUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showControls, setShowControls] = useState(true)
  const [usingFallback, setUsingFallback] = useState(false)
  const [hlsDebug, setHlsDebug] = useState('Iniciando...')
  // hlsDebug_unused workaround to make eslint happy since the overlay is currently removed
  useEffect(() => { if (hlsDebug) {} }, [hlsDebug])
  const [availableQualities, setAvailableQualities] = useState(null)
  const [showClips, setShowClips] = useState(false)
  const [showDrops, setShowDrops] = useState(false)
  const [showSettingsPanel, setShowSettingsPanel] = useState(false)
  const [isPiP, setIsPiP] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [audioOnly, setAudioOnly] = useState(false)
  const prevQualityRef = useRef('best')
  const audioOnlyRef = useRef(false)
  useEffect(() => { audioOnlyRef.current = audioOnly }, [audioOnly])
  const [stats, setStats] = useState({ bitrate: 'Calculando...', resolution: 'Calculando...', dropped: 0, buffer: '0.0s' })
  const { isNightMode, toggleNightMode } = useAudioCompressor(videoRef)
  const {
    delayFromLive,
    isAtLiveEdge,
    bufferDuration,
    bufferStart,
    currentTime: dvrCurrentTime,
    seekToLive: dvrSeekToLive,
    seekRelative,
    seekToPercent,
  } = useLiveDVR(videoRef, hlsRef)

  const {
    isRecording: recording,
    error: recordingError,
    startRecording,
    stopRecording: hookStopRecording,
  } = useRecording()
  const [showTheatreToast, setShowTheatreToast] = useState(false)
  const [showOverlayChat, setShowOverlayChat] = useState(() => getItem(STORAGE_KEYS.OVERLAY_CHAT, 'false') === 'true')
  const [showEmoteEffects, setShowEmoteEffects] = useState(() => getItem(STORAGE_KEYS.EMOTE_EFFECTS, 'true') === 'true')
  const abortControllerRef = useRef(null)
  const containerRef = useRef(null)
  const [streamStartTime] = useState(Date.now)

  useEffect(() => { volumeRef.current = volume }, [volume])

  const jumpToLive = useCallback(() => {
    dvrSeekToLive()
  }, [dvrSeekToLive])

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        seekRelative(-10)
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault()
        seekRelative(10)
      } else if (e.key === 'Home' || e.key === '0') {
        e.preventDefault()
        dvrSeekToLive()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [seekRelative, dvrSeekToLive])

  useEffect(() => {
    if (streamUrl && channel && !recording && localStorage.getItem('blinkstream_rec_autostart') === 'true') {
      const timer = setTimeout(() => {
        startRecording(channel).catch(() => {})
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [streamUrl, channel, recording, startRecording])

  useEffect(() => {
    if (channel) {
      startDropsWatcher(channel).catch(() => {})
    }
    return () => {
      stopDropsWatcher().catch(() => {})
    }
  }, [channel])

  const fetchStream = useCallback(async (ch, q) => {
    if (!ch) return
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    console.log(`[VideoPlayer] fetchStream llamado: channel=${ch}, quality=${q || quality || 'best'}`)
    setLoading(true); setError(''); setStreamUrl('')
    isFetchingRef.current = true
    networkRetriesRef.current = 0
    const targetQuality = q || quality || 'best'

    if (targetQuality === 'audio_only') {
      try {
        const url = await measureInvoke('get_stream_url', { channel: ch, quality: 'audio_only' })
        setStreamUrl(url); setUsingFallback(false); setLoading(false); isFetchingRef.current = false; return
      } catch (e) { console.warn('Audio-only failed:', e) }
      setError('No se pudo obtener stream de solo audio')
      setHlsDebug('Fallo audio-only')
      setLoading(false); isFetchingRef.current = false; return
    }

    try {
      const url = await measureInvoke('get_stream_url', { channel: ch, quality: targetQuality })
      console.log(`[VideoPlayer] streamUrl obtenida para ${ch}: ${url?.substring(0, 80)}...`)
      setStreamUrl(url); setUsingFallback(false); setLoading(false); isFetchingRef.current = false; return
    } catch (e) { console.warn('[VideoPlayer] get_stream_url failed:', e) }

    try {
      const url = await measureInvoke('get_stream_url', { channel: ch, quality: 'best' })
      setStreamUrl(url); setUsingFallback(true); setLoading(false); isFetchingRef.current = false; return
    } catch (e) {
      const msg = typeof e === 'string' ? e : e?.message || e?.toString() || 'Error desconocido'
      setError(`No se pudo cargar ${ch}: ${msg}`)
      setHlsDebug(`Fallo get_stream_url: ${msg}`)
    }
    setLoading(false); isFetchingRef.current = false
  }, [quality])

  const fetchQualities = useCallback(async (ch) => {
    if (!ch) return
    try {
      const quals = await measureInvoke('get_available_qualities', { channel: ch })
      if (Array.isArray(quals) && quals.length > 0) {
        setAvailableQualities(quals.filter(q => q.toLowerCase() !== 'best'))
        return
      }
    } catch (e) { console.warn('Error fetching qualities:', e) }

    setAvailableQualities(FALLBACK_QUALITIES)

  }, [])

  const handleQualityChange = useCallback((newQuality) => {
    onQualityChange(newQuality)
    fetchStream(channel, newQuality)
  }, [onQualityChange, fetchStream, channel])

  useEffect(() => {
    if (abortControllerRef.current) {
      try { abortControllerRef.current.abort() } catch {  }
    }
    const abortCtrl = new AbortController()
    abortControllerRef.current = abortCtrl

    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([fetchStream(channel), fetchQualities(channel)])
    let cancelled = false
    let timer
    const reconnect = () => {
      timer = setTimeout(() => {
        if (cancelled) return
        if (audioOnlyRef.current) { fetchStream(channel, 'audio_only') }
        else { fetchStream(channel, quality) }
        if (!cancelled) reconnect()
      }, 25 * 60 * 1000)
    }
    reconnect()
    return () => { cancelled = true; try { abortCtrl.abort() } catch {} clearTimeout(timer) }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, fetchStream, fetchQualities])

  useEffect(() => {
    return () => {

      if (recording) {

        console.info(`[VideoPlayer] Deteniendo grabacion por cambio de canal → ${channel}`)
        hookStopRecording()
      }
    }
  }, [channel, recording, hookStopRecording])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !streamUrl) return
    console.log(`[VideoPlayer] Inicializando HLS con streamUrl: ${streamUrl?.substring(0, 80)}...`)
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    if (!Hls.isSupported()) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl
      } else {
        setError('HLS no soportado')
      }
      return
    }

    const hls = new Hls({
      loader: TauriPlaylistLoader,
      lowLatencyMode: true,
      startPosition: -1,
      backBufferLength: 6,
      maxBufferLength: 4,
      maxMaxBufferLength: 8,
      maxBufferSize: 20 * 1000 * 1000,
      capLevelToPlayerSize: true,
      abrEwmaDefaultEstimate: 5_000_000,
      abrBandWidthFactor: 0.95,
      abrBandWidthUpFactor: 0.7,
      enableWorker: true,
      fragLoadingTimeOut: 20000,
      manifestLoadingTimeOut: 15000,
      levelLoadingTimeOut: 15000,
      liveSyncDurationCount: 0.5,
      liveMaxLatencyDurationCount: 1.5,
      liveDurationInfinity: true,
      maxLiveSyncPlaybackRate: 1.25,
      highBufferWatchdogPeriod: 1,
      enableSoftwareAES: true,
      debug: false,
    })
    hlsRef.current = hls
    hls.loadSource(streamUrl)
    hls.attachMedia(video)

    const resizeObserver = new ResizeObserver(() => {
      if (hls && typeof hls.startLoad === 'function') {

        try { hls.startLoad() } catch {  }
      }
    })
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    const handleVideoError = () => {
      if (!video.error) return
      const errCode = video.error.code
      const errMsg = {
        1: 'MEDIA_ERR_ABORTED',
        2: 'MEDIA_ERR_NETWORK',
        3: 'MEDIA_ERR_DECODE',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
      }[errCode] || `code ${errCode}`
      console.error(`[VideoPlayer] video.error: ${errMsg} (channel=${channel}, quality=${quality})`)
      if (errCode === 3) {
        if (quality !== 'best') {
          console.warn(`[VideoPlayer] decode error at ${quality}, falling back to best`)
          onQualityChange('best')
          fetchStream(channel, 'best')
        } else {
          setError(`Fallo de decodificación de vídeo (Hardware/Codec). Intenta actualizar tus drivers o instalar el Media Feature Pack si usas Windows N.`)
          setHlsDebug('Native MEDIA_ERR_DECODE ignorado/mostrado')
        }
      } else if (errCode === 4) {
        setError(`Formato de vídeo no soportado por tu sistema: ${errMsg}`)
        setHlsDebug('Native MEDIA_ERR_SRC_NOT_SUPPORTED')
      }
    }
    video.addEventListener('error', handleVideoError)

    let hasSeekedToLive = false

    hls.on(Hls.Events.FRAG_BUFFERED, () => {
      if (!hasSeekedToLive) {
        hasSeekedToLive = true
        const livePos = (typeof hls.liveSyncPosition === 'number' && hls.liveSyncPosition > 0)
          ? hls.liveSyncPosition
          : (video.seekable.length ? video.seekable.end(video.seekable.length - 1) : 0)
        if (livePos > 0) {
          try { video.currentTime = livePos } catch {}
        }
      }
    })

    hls.on(Hls.Events.LEVEL_LOADED, (_e, data) => {
      if (data?.details?.live) {
        const livePos = (typeof hls.liveSyncPosition === 'number' && hls.liveSyncPosition > 0)
          ? hls.liveSyncPosition
          : (video.seekable.length ? video.seekable.end(video.seekable.length - 1) : 0)
        if (livePos > 0) {
          const diff = livePos - video.currentTime
          if (diff > 3.0) {
            try { video.currentTime = livePos } catch {}
          } else if (diff > 2.0) {
            video.playbackRate = 1.2
          } else {
            video.playbackRate = 1.0
          }
        }
      }
    })

    hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
      const playPromise = video.play()
      if (playPromise !== undefined) {
        playPromise
          .then(() => setPlaying(true))
          .catch(err => {
            console.warn('[VideoPlayer] Autoplay bloqueado, reintentando con mute:', err)
            video.muted = true
            setMuted(true)
            video.play()
              .then(() => setPlaying(true))
              .catch(e => {
                console.warn('[VideoPlayer] Playback falló incluso en mute:', e)
                setPlaying(false)
              })
          })
      }

      if (import.meta.env.DEV) {
        const levelsInfo = data.levels.map(l => `${l.height}p (${Math.round(l.bitrate / 1000)}kbps)`).join(', ')
        console.log(`[HLS] ${data.levels.length} levels: ${levelsInfo}`)
      }

      const fallbackTimer = setTimeout(() => {
        if (video.readyState < 2) {
          const currentLevelIdx = hls.currentLevel
          console.warn(`[HLS] current level (${currentLevelIdx}) not playing after 5s, trying fallback`)
          if (hls.levels && hls.levels.length > 1 && currentLevelIdx >= 0 && currentLevelIdx < hls.levels.length - 1) {
            hls.currentLevel = currentLevelIdx + 1
          } else {
            onQualityChange('best')
            fetchStream(channel, 'best')
          }
        } else if (video.videoWidth === 0 && data.levels.length > 1) {
          console.warn(`[VideoPlayer] videoWidth=0 with levels available, downgrading to lowest`)
          hls.currentLevel = data.levels.length - 1
        }
      }, 5000)
      fallbackTimersRef.current = fallbackTimer
    })

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) {
        if (import.meta.env.DEV) {
          console.warn(`[HLS] non-fatal ${data.type}: ${data.details}`)
        }
        return
      }

      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          console.error('[HLS] network error', data.details)
          setHlsDebug(`NETWORK_ERROR: ${data.details}`)
          if (data.details === 'manifestLoadError' || data.response?.code === 403 || data.response?.code === 404) {
            console.warn('[HLS] Error 403/404 o fallo de manifiesto. Deteniendo bucle y reintentando stream desde Streamlink...')
            hls.destroy()
            if (!isFetchingRef.current) {
              setTimeout(() => { fetchStream(channel, quality) }, 2500)
            }
          } else {
            networkRetriesRef.current += 1
            if (networkRetriesRef.current > 5) {
              console.warn('[HLS] Demasiados errores de red. Reiniciando stream...')
              hls.destroy()
              if (!isFetchingRef.current) {
                setTimeout(() => { fetchStream(channel, quality) }, 2000)
              }
            } else {
              hls.startLoad()
            }
          }
          break

        case Hls.ErrorTypes.MEDIA_ERROR:
          console.error('[HLS] media error', data.details)
          setHlsDebug(`MEDIA_ERROR: ${data.details}`)
          if (data.details === 'bufferIncompatibleCodecsError' || data.details === 'bufferAppendError') {

            if (hls.levels && hls.currentLevel >= 0 && hls.currentLevel < hls.levels.length - 1) {
              console.warn(`[HLS] codec issue at level ${hls.currentLevel}, downgrading`)
              hls.currentLevel = hls.currentLevel + 1
            } else {
              hls.recoverMediaError()
            }
          } else {
            hls.recoverMediaError()
          }
          break

        case Hls.ErrorTypes.BUFFER_APPEND_ERROR:
        case Hls.ErrorTypes.BUFFER_FULL_ERROR:
          console.error('[HLS] buffer error', data.details)
          setHlsDebug(`BUFFER_ERROR: ${data.details}`)
          hls.recoverMediaError()
          break

        default:
          console.error('[HLS] fatal error', data.type, data.details)
          setHlsDebug(`FATAL: ${data.type} ${data.details}`)
          setError(`Error de reproducción: ${data.details || data.type}`)
          hls.destroy()
      }
    })

    let cancelled = false
    let statsTimer
    const updateStats = () => {
      statsTimer = setTimeout(() => {
        if (cancelled) return
        if (hlsRef.current && videoRef.current) {
          const v = videoRef.current
          const hlsInst = hlsRef.current
          const level = hlsInst.levels?.[hlsInst.currentLevel >= 0 ? hlsInst.currentLevel : 0] || hlsInst.levels?.[0]

          const bw = hlsInst.bandwidthEstimate || level?.bitrate || 0
          const bitrateStr = bw > 0 ? `${Math.round(bw / 1000)} kbps` : 'En vivo'

          const w = v.videoWidth || level?.width || 0
          const h = v.videoHeight || level?.height || 0
          const fpsVal = level?.attrs?.FRAME_RATE || level?.attrs?.['FRAME-RATE'] || level?.frameRate || (v.webkitDecodedFrameCount ? '60' : '')
          const fpsStr = fpsVal ? `@${Math.round(Number(fpsVal) || 60)}fps` : '@60fps'
          const resolutionStr = (w && h) ? `${w}x${h}${fpsStr}` : (quality && quality !== 'best' ? `${quality}` : '1920x1080@60fps')

          const pbQuality = typeof v.getVideoPlaybackQuality === 'function' ? v.getVideoPlaybackQuality() : null
          const droppedVal = pbQuality ? pbQuality.droppedVideoFrames : (hlsInst.stats?.droppedFrames || 0)

          let bufferAhead = '0.0s'
          if (v.buffered.length > 0) {
            const end = v.buffered.end(v.buffered.length - 1)
            const diff = Math.max(0, end - v.currentTime)
            bufferAhead = `${diff.toFixed(1)}s`
          }

          const latVal = typeof hlsInst.latency === 'number' && !isNaN(hlsInst.latency) && hlsInst.latency >= 0
            ? `${hlsInst.latency.toFixed(1)}s`
            : 'En vivo'

          setStats({
            bitrate: bitrateStr,
            resolution: resolutionStr,
            dropped: droppedVal,
            buffer: bufferAhead,
            latency: latVal,
          })
        }
        if (!cancelled) updateStats()
      }, 1000)
    }
    updateStats()

    return () => {
      cancelled = true
      clearTimeout(statsTimer)
      if (fallbackTimersRef.current) { clearTimeout(fallbackTimersRef.current); fallbackTimersRef.current = null }

      resizeObserver.disconnect()
      video.removeEventListener('error', handleVideoError)
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [streamUrl, channel, fetchStream, onQualityChange, quality])

  useEffect(() => { const v = videoRef.current; if (v) v.volume = muted ? 0 : volume / 100 }, [volume, muted, streamUrl])

  const togglePlay = useCallback(() => { const v = videoRef.current; if (!v) return; if (v.paused) { v.play().catch(() => {}); setPlaying(true) } else { v.pause(); setPlaying(false) } }, [])
  const toggleMute = useCallback(() => { const v = videoRef.current; if (!v) return; v.muted = !muted; setMuted(!muted) }, [muted])

  const toggleAudioOnly = () => {
    if (audioOnly) {
      onQualityChange(prevQualityRef.current)
      fetchStream(channel, prevQualityRef.current)
      setAudioOnly(false)
    } else {
      prevQualityRef.current = quality
      onQualityChange('audio_only')
      fetchStream(channel, 'audio_only')
      setAudioOnly(true)
    }
  }

  const handleVolume = (e) => { const val = Number(e.target.value); onVolumeChange(val); if (videoRef.current) videoRef.current.volume = val / 100; setMuted(false) }
  const toggleFullscreen = () => { if (document.fullscreenElement) document.exitFullscreen(); else containerRef.current?.requestFullscreen() }
  const togglePiP = async () => {
    const v = videoRef.current; if (!v) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await v.requestPictureInPicture()
      }
    } catch {  }
  }

  const handleMouseMove = useCallback(() => {
    if (!showControls) setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => { setShowControls(false) }, 3000)
  }, [showControls])

  useEffect(() => {
    const handleDebug = (e) => setHlsDebug(prev => prev + ' -> ' + e.detail)
    window.addEventListener('hls-debug', handleDebug)
    return () => window.removeEventListener('hls-debug', handleDebug)
  }, [])

  useEffect(() => {
    const v = videoRef.current; if (!v) return
    const onPlay = () => setPlaying(true); const onPause = () => setPlaying(false)
    v.addEventListener('play', onPlay); v.addEventListener('pause', onPause)
    const onPiPEnter = () => setIsPiP(true); const onPiPLeave = () => setIsPiP(false)
    v.addEventListener('enterpictureinpicture', onPiPEnter)
    v.addEventListener('leavepictureinpicture', onPiPLeave)
    return () => { v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); v.removeEventListener('enterpictureinpicture', onPiPEnter); v.removeEventListener('leavepictureinpicture', onPiPLeave) }
  }, [streamUrl])

  useEffect(() => {

    if (theatreMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowTheatreToast(true); const t = setTimeout(() => setShowTheatreToast(false), 2500); return () => clearTimeout(t)
    }
  }, [theatreMode])

  const [_sessionProgress, _setSessionProgress] = useState(0)
  useEffect(() => {
    const update = () => {
      const elapsed = (Date.now() - streamStartTime) / 1000
      _setSessionProgress(Math.min((elapsed / 3600) * 100, 100))
    }
    update()
    const id = setInterval(update, 30000)
    return () => clearInterval(id)
  }, [streamStartTime])

  const [snapshotToast, setSnapshotToast] = useState({ show: false, error: '' })

  const captureSnapshot = useCallback((e) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) {
      setSnapshotToast({ show: true, error: 'El vídeo aún no está listo para capturar.' })
      setTimeout(() => setSnapshotToast({ show: false, error: '' }), 3500)
      return
    }

    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      let dataUrl
      try {
        dataUrl = canvas.toDataURL('image/png') // ALLOWED-REGRESSION: snapshot export download blob URL
      } catch (secErr) {
        console.error('[VideoPlayer] Tainted canvas o CORS al capturar:', secErr)
        setSnapshotToast({ show: true, error: 'Restricción CORS del CDN al exportar el frame.' })
        setTimeout(() => setSnapshotToast({ show: false, error: '' }), 4500)
        return
      }

      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `BlinkStream_${channel}_${new Date().toISOString().replace(/[:.]/g, '-')}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      setSnapshotToast({ show: true, error: '' })
      setTimeout(() => setSnapshotToast({ show: false, error: '' }), 3500)
    } catch (err) {
      console.error('[VideoPlayer] Error capturando snapshot:', err)
      setSnapshotToast({ show: true, error: `Error de captura: ${err.message || err}` })
      setTimeout(() => setSnapshotToast({ show: false, error: '' }), 4000)
    }
  }, [channel])

  useEffect(() => {
    const handleRemotePause = () => togglePlay();
    const handleRemoteMute = () => toggleMute();
    const handleRemoteSnap = () => captureSnapshot();
    window.addEventListener('companion_toggle_pause', handleRemotePause);
    window.addEventListener('companion_toggle_mute', handleRemoteMute);
    window.addEventListener('companion_take_snapshot', handleRemoteSnap);
    return () => {
      window.removeEventListener('companion_toggle_pause', handleRemotePause);
      window.removeEventListener('companion_toggle_mute', handleRemoteMute);
      window.removeEventListener('companion_take_snapshot', handleRemoteSnap);
    };
  }, [togglePlay, toggleMute, captureSnapshot]);

  const errInfo = error ? formatPlayerError(error, channel, t) : null
  const handleRetry = useCallback(() => { fetchStream(channel) }, [channel, fetchStream])
  useEffect(() => {
    const handleKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return

      switch (e.code) {
        case 'Space':
          e.preventDefault(); togglePlay(); break
        case 'KeyM':
          toggleMute(); break
        case 'KeyF':
          toggleFullscreen(); break
        case 'KeyT':
          if (!e.ctrlKey && !e.metaKey) onToggleTheatre(); break
        case 'KeyC':
          if (!e.ctrlKey && !e.metaKey) setShowOverlayChat(p => !p); break
        case 'KeyS':
          if (((e.ctrlKey || e.metaKey) && e.shiftKey) || (!e.ctrlKey && !e.metaKey && !e.altKey)) {
            e.preventDefault()
            captureSnapshot()
          }
          break
        case 'KeyD':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); setShowStats(p => !p); } break
        case 'ArrowUp':
          e.preventDefault(); onVolumeChange(Math.min(volume + 5, 100)); break
        case 'ArrowDown':
          e.preventDefault(); onVolumeChange(Math.max(volume - 5, 0)); break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, muted, streamUrl, playing, captureSnapshot])

  return (
    <div ref={containerRef} className={`relative bg-black overflow-hidden group/player ${theatreMode ? 'w-full h-full' : 'w-full'}`} style={theatreMode ? {} : { aspectRatio: '16/9', maxHeight: '100%' }}
      onMouseMove={handleMouseMove} onMouseEnter={() => setShowControls(true)} onMouseLeave={() => setShowControls(false)}>

      {showTheatreToast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-black/60 backdrop-blur-md rounded-full px-4 py-1.5 text-[12px] text-white/70 animate-fade-in pointer-events-none">
          {t('player.theatreNotice', '🎭 Modo teatro · Presiona T para salir')}
        </div>
      )}

      <video ref={videoRef} className={`w-full h-full object-contain ${audioOnly ? 'hidden' : ''}`} autoPlay playsInline aria-label={channel ? `Reproduciendo ${channel}` : 'Reproductor de video'} />
      {audioOnly && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 select-none">
          <div className="w-16 h-16 rounded-2xl bg-twitch/20 flex items-center justify-center mb-3 animate-pulse-glow">
            <PhosphorIcon name="Headphones" size={32} weight="regular" />
          </div>
          <p className="text-white/60 text-sm font-medium">{t('player.audioOnly', 'Modo solo audio')}</p>
          <p className="text-text-muted text-[12px] mt-1">{channel}</p>
        </div>
      )}

      {showStats && (
        <div className="absolute top-4 left-4 z-40 bg-[#14141d]/95 backdrop-blur-md border border-white/15 rounded-xl p-3 text-[12px] font-mono text-white/90 shadow-2xl select-none space-y-1.5 min-w-[250px] animate-fade-in pointer-events-none">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-1.5 font-sans gap-3">
            <span className="text-[11px] font-extrabold text-twitch tracking-wider uppercase flex items-center gap-1.5 shrink-0">
              <PhosphorIcon name="ChartBar" size={14} weight="duotone" />
              Estadísticas
            </span>
            <span className="text-[11px] font-bold text-white/80 truncate max-w-[130px]">{channel}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
            <div className="truncate">⚡ <span className="text-white font-semibold ml-0.5">{stats.bitrate || 'Calculando...'}</span></div>
            <div className="truncate">📐 <span className="text-white font-semibold ml-0.5">{stats.resolution || 'Calculando...'}</span></div>
            <div className="truncate">⏱️ <span className="text-white font-semibold ml-0.5">{stats.latency || 'En vivo'} latencia</span></div>
            <div className="truncate">🎞️ <span className="text-white font-semibold ml-0.5">{stats.buffer} buffer</span></div>
            <div className="truncate col-span-2 text-text-muted text-[10px]">📉 <span className="text-white/80 font-medium ml-0.5">{stats.dropped} frames perdidos</span></div>
          </div>
        </div>
      )}

      {recording && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2 bg-red-500/90 backdrop-blur-sm rounded-lg px-3 py-1.5 select-none animate-pulse-glow">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse-dot" />
          <span className="text-white text-[12px] font-bold uppercase tracking-wider">REC</span>
        </div>
      )}

      {recordingError && (
        <div className="absolute top-3 right-3 z-30 max-w-xs bg-red-900/90 backdrop-blur-sm border border-red-500/40 rounded-lg px-3 py-2 text-[11px] text-white shadow-2xl animate-fade-in">
          <p className="font-semibold mb-0.5">Error de grabación</p>
          <p className="text-white/90 break-words">{recordingError}</p>
          <p className="mt-1 text-[10px] text-white/50">
            Se borrará al reintentar.
          </p>
        </div>
      )}

      {snapshotToast.show && (
        <div className={`absolute top-14 right-3 z-40 bg-[#12121a]/95 backdrop-blur-md border ${snapshotToast.error ? 'border-red-500/50' : 'border-white/15'} rounded-xl px-4 py-2.5 flex items-center gap-2.5 shadow-2xl animate-bounce-short text-white text-xs font-semibold select-none`}>
          <PhosphorIcon name="Camera" size={20} className={snapshotToast.error ? 'text-red-400' : 'text-twitch'} weight="duotone" />
          <div>
            <p className="leading-tight">{snapshotToast.error ? '⚠️ No se pudo capturar' : '📸 Fotograma HD capturado'}</p>
            <p className="text-[10px] text-text-muted font-normal mt-0.5">{snapshotToast.error || 'Guardado en alta definición sin pérdida'}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-twitch border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-white/60">{usingFallback ? 'Extrayendo stream…' : `Conectando con ${channel}…`}</span>
          </div>
        </div>
      )}

      {error && !loading && (
        errInfo?.isOffline ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
            <div className="text-center px-4 max-w-md flex flex-col items-center select-none">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-text-muted mb-2.5 shadow-2xl backdrop-blur-xl">
                <PhosphorIcon name="Television" size={28} className="text-white/40" weight="duotone" />
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                <span>{t('player.offlineBadge', 'OFFLINE')}</span>
              </div>
              <h3 className="text-sm md:text-base font-bold text-white mb-1">{errInfo.title}</h3>
              <p className="text-[11px] md:text-xs text-text-muted max-w-xs leading-relaxed mb-4">
                {errInfo.desc}
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  onClick={handleRetry}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-twitch hover:bg-twitch-dark text-white text-xs font-bold shadow-lg shadow-twitch/25 transition-all cursor-pointer hover:scale-[1.02]"
                >
                  <PhosphorIcon name="ArrowsClockwise" size={14} weight="bold" />
                  <span>{t('player.checkLive', 'Comprobar directo')}</span>
                </button>
                <button
                  onClick={() => setShowVods(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-medium transition-all cursor-pointer"
                >
                  <PhosphorIcon name="FilmStrip" size={14} />
                  <span>{t('player.watchVods', 'Ver VODs')}</span>
                </button>
                <button
                  onClick={() => setShowClips(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-medium transition-all cursor-pointer"
                >
                  <PhosphorIcon name="PlayCircle" size={14} />
                  <span>{t('player.clips', 'Clips')}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
            <div className="text-center px-6 max-w-sm flex flex-col items-center">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-3 shadow-xl">
                <PhosphorIcon name="WarningCircle" size={26} weight="duotone" />
              </div>
              <p className="text-red-300 text-sm font-bold mb-1">{errInfo?.title || t('player.error', 'Error')}</p>
              <p className="text-xs text-text-muted break-words mb-4 leading-relaxed">{errInfo?.desc || error}</p>
              <button
                onClick={handleRetry}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-twitch hover:bg-twitch-dark text-white text-xs font-bold shadow-lg shadow-twitch/25 transition-all cursor-pointer"
              >
                <PhosphorIcon name="ArrowsClockwise" size={14} weight="bold" />
                <span>{t('player.retry', 'Reintentar')}</span>
              </button>
            </div>
          </div>
        )
      )}

      {/* Controls Bar (only shown when stream is active) */}
      {!error && !loading && (
        <div className={`absolute bottom-6 left-6 right-6 z-30 flex items-center justify-between bg-[#101014]/85 backdrop-blur-2xl border border-white/15 px-6 py-3.5 rounded-2xl transition-all duration-300 shadow-[0_10px_40px_rgba(0,0,0,0.7)] ${showControls ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-4 scale-95 pointer-events-none'}`}>
        <div className="flex items-center gap-3 text-white">
          <button onClick={togglePlay} className="hover:text-twitch transition-colors cursor-pointer" aria-label={playing ? t('player.pause', 'Pausar') : t('player.play', 'Reproducir')}>{playing ? <PauseIcon/> : <PlayIcon/>}</button>
          <button onClick={toggleMute} className="hover:text-twitch transition-colors cursor-pointer" aria-label={muted ? t('player.unmute', 'Activar sonido') : t('player.mute', 'Silenciar')}>{muted ? <VolumeMute/> : <VolumeHigh/>}</button>
          <input type="range" min="0" max="100" value={muted ? 0 : volume} onChange={handleVolume} className="w-16 sm:w-20 h-1 accent-twitch bg-white/20 rounded-lg appearance-none cursor-pointer" aria-label="Volumen" aria-valuemin="0" aria-valuemax="100" aria-valuenow={muted ? 0 : volume} />
          <button
            onClick={toggleNightMode}
            className={`hover:text-white transition-colors cursor-pointer p-1 rounded-lg ${isNightMode ? 'text-amber-300 bg-amber-500/15' : 'text-white/40 hover:bg-white/5'}`}
            title={isNightMode ? `${t('player.nightMode', 'Modo Nocturno')}: ON` : `${t('player.nightMode', 'Modo Nocturno')}: OFF`}
            aria-label="Modo Nocturno (Compresor)"
          >
            <PhosphorIcon name="Moon" size={16} weight={isNightMode ? 'fill' : 'duotone'} />
          </button>
          <div className="flex items-center gap-1.5">
            <LiveBadge onClick={jumpToLive} title={t('player.jumpToLive', 'Sincronizar con el directo')} />
            {!isAtLiveEdge && delayFromLive > 0 && (
              <button
                onClick={jumpToLive}
                className="px-2 py-0.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold cursor-pointer transition-all animate-pulse"
                title="Atrasado respecto al directo. Clic para volver a EN VIVO."
              >
                -{Math.floor(delayFromLive)}s ⏩
              </button>
            )}
            <button
              onClick={() => seekRelative(-10)}
              className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 text-white/60 hover:text-white text-[10px] font-mono font-bold cursor-pointer transition-colors"
              title="Rebobinar 10 segundos (J)"
            >
              -10s
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-white/60">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowClips(true)} className="hover:text-white transition-colors cursor-pointer" title={t('player.clips', 'Clips')} aria-label="Abrir clips"><ClipIcon/></button>
            <button onClick={() => setShowVods(true)} className="hover:text-white transition-colors cursor-pointer" title={t('player.vods', 'VODs')} aria-label="Ver VODs"><VodIcon/></button>
            <button onClick={() => setShowDrops(true)} className="hover:text-purple-400 transition-colors cursor-pointer" title="Twitch Drops & Recompensas" aria-label="Abrir Twitch Drops">
              <PhosphorIcon name="Gift" size={18} weight="duotone" />
            </button>
            <button onClick={async () => {

              if (recording) {
                await hookStopRecording()
              } else {
                await startRecording(channel)
              }
            }} className={`hover:text-white transition-colors cursor-pointer ${recording ? 'text-red-500' : ''}`} title={recording ? t('player.stopRecord', 'Detener grabación') : t('player.record', 'Grabar stream')} aria-label="Grabar stream">
              <PhosphorIcon name="Record" size={18} weight={recording ? 'fill' : 'duotone'} className={recording ? 'animate-pulse' : ''} />
            </button>
            <button
              onClick={captureSnapshot}
              className="hover:text-white transition-colors cursor-pointer hover:scale-110 active:scale-95"
              title={t('player.snapshot', 'Captura de Pantalla HD (Ctrl+Shift+S)')}
              aria-label="Tomar captura de pantalla en HD"
            >
              <PhosphorIcon name="Camera" size={18} weight="duotone" />
            </button>
          </div>

          <div className="w-px h-5 bg-white/10 mx-1" />

          <div className="flex items-center gap-3">
            <button onClick={() => setShowSettingsPanel(p => !p)} className={`hover:text-white transition-colors cursor-pointer ${showSettingsPanel ? 'text-twitch animate-pulse' : ''}`} title={t('player.settings', 'Ajustes')} aria-label="Ajustes del reproductor"><SettingsIcon/></button>
            <button onClick={onToggleTheatre} className={`hover:text-white transition-colors cursor-pointer ${theatreMode ? 'text-twitch' : ''}`} title={t('player.theatre', 'Teatro (T)')} aria-label="Modo teatro"><TheatreIcon/></button>
            <button onClick={async () => {
              try { safeOpenUrl(`https://www.twitch.tv/${channel}`, true) } catch {  }
            }} className="hover:text-white transition-colors cursor-pointer" title={t('player.browser', 'Abrir en navegador')} aria-label="Abrir en navegador">
              <PhosphorIcon name="ArrowSquareOut" size={16} weight="regular" />
            </button>
            <button onClick={togglePiP} className={`hover:text-white transition-colors cursor-pointer ${isPiP ? 'text-twitch' : ''}`} title={t('player.pip', 'Picture-in-Picture')} aria-label="Picture-in-Picture">
              <PhosphorIcon name="PictureInPicture" size={16} weight="regular" />
            </button>
            <button onClick={toggleFullscreen} className="hover:text-white transition-colors cursor-pointer" title={t('player.fullscreen', 'Fullscreen (F)')} aria-label="Pantalla completa"><FullscreenIcon/></button>
          </div>
        </div>

        {/* Interactive DVR Timeline Scrubber */}
        <div 
          className="absolute top-0 left-5 right-5 h-2.5 bg-white/10 rounded-full overflow-hidden -translate-y-1 cursor-pointer group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const percent = ((e.clientX - rect.left) / rect.width) * 100
            seekToPercent(percent)
          }}
          title={isAtLiveEdge ? 'En directo (Live Edge)' : `Atrasado -${Math.floor(delayFromLive)}s (Clic para saltar)`}
        >
          <div 
            className={`h-full transition-all duration-300 ${isAtLiveEdge ? 'bg-twitch shadow-[0_0_8px_#9146FF]' : 'bg-amber-400 shadow-[0_0_8px_#F59E0B]'}`}
            style={{
              width: `${bufferDuration > 0 ? Math.min(100, Math.max(0, ((dvrCurrentTime - bufferStart) / bufferDuration) * 100)) : 100}%`
            }} 
          />
        </div>
      </div>
      )}

      {showSettingsPanel && (
        <PlayerSettingsPanel
          onClose={() => setShowSettingsPanel(false)}
          quality={quality}
          onQualityChange={handleQualityChange}
          availableQualities={availableQualities}
          compact={compact}
          onToggleCompact={onToggleCompact}
          audioOnly={audioOnly}
          onToggleAudioOnly={toggleAudioOnly}
          showStats={showStats}
          onToggleStats={() => setShowStats(p => !p)}
          showOverlayChat={showOverlayChat}
          onToggleOverlayChat={() => {
            setShowOverlayChat(p => {
              const n = !p
              setItem(STORAGE_KEYS.OVERLAY_CHAT, n)
              return n
            })
          }}
          showEmoteEffects={showEmoteEffects}
          onToggleEmoteEffects={() => {
            setShowEmoteEffects(p => {
              const n = !p
              setItem(STORAGE_KEYS.EMOTE_EFFECTS, n)
              return n
            })
          }}
          isNightMode={isNightMode}
          onToggleNightMode={toggleNightMode}
          onOpenAppSettings={onOpenAppSettings}
        />
      )}

      <EmoteRainOverlay active={showEmoteEffects} />

      {showClips && <ClipPlayer channel={channel} onClose={() => setShowClips(false)} />}
      {showVods && <VodPlayer channel={channel} onClose={() => setShowVods(false)} />}
      {showDrops && (
        <DropsModal
          token={twitchToken}
          channel={channel}
          onClose={() => setShowDrops(false)}
        />
      )}

      {showOverlayChat && (
        <div className="absolute top-6 right-6 z-40 w-[360px] h-[calc(100%-115px)] max-h-[660px] pointer-events-auto animate-fade-in shadow-2xl transition-all">
          <Chat
            channel={channel}
            isOverlay={true}
            onCloseOverlay={() => {
              setShowOverlayChat(false)
              setItem(STORAGE_KEYS.OVERLAY_CHAT, false)
            }}
            isLoggedIn={isLoggedIn}
            twitchToken={twitchToken}
            twitchUsername={twitchUsername}
            broadcasterId={broadcasterId}
            onOpenCPPanel={onOpenCPPanel}
            isModerator={isModerator}
            isBroadcaster={isBroadcaster}
            viewerLogin={viewerLogin}
            onLoginWithToken={onLoginWithToken}
          />
        </div>
      )}
    </div>
  )
}
