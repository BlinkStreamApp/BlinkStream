/**
 * @file VideoPlayer (M-7 / Auditoria WT-20260628-01).
 * Reproductor HLS con auto-fallback de calidad, grabacion local via
 * backend Rust, y estadisticas en vivo. Conexion hls.js se recrea al
 * cambiar de canal/calidad y se destruye en cleanup.
 *
 * @typedef {object} VideoPlayerProps
 * @property {string}      channel
 * @property {string}      quality
 * @property {(q: string) => void}   onQualityChange
 * @property {number}      volume
 * @property {(v: number) => void}   onVolumeChange
 * @property {boolean}     theatreMode
 * @property {() => void}  onToggleTheatre
 * @property {boolean}     compact
 * @property {() => void}  onToggleCompact
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { measureInvoke } from '../utils/perf'
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
// FASE 4 / WT-20260628-45: Lordicon animado para el boton REC. Solo
// se monta cuando `recording` es true; el resto del tiempo seguimos
// con Phosphor (mas liviano, sin fetch de CDN).
import AnimatedIcon from './icons/AnimatedIcon'

function PlayIcon() { return <PhosphorIcon name="Play" size={24} weight="fill" /> }
function PauseIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="2"/><rect x="14" y="4" width="5" height="16" rx="2"/></svg> }
function VolumeHigh() { return <PhosphorIcon name="SpeakerHigh" size={22} weight="regular" /> }
function VolumeMute() { return <PhosphorIcon name="SpeakerSlash" size={22} weight="regular" /> }
function FullscreenIcon() { return <PhosphorIcon name="CornersOut" size={20} weight="regular" /> }
function TheatreIcon() { return <PhosphorIcon name="MonitorPlay" size={20} weight="regular" /> }
function ClipIcon() { return <PhosphorIcon name="PlayCircle" size={19} weight="regular" /> }
function VodIcon() { return <PhosphorIcon name="FilmStrip" size={19} weight="regular" /> }
function SettingsIcon() { return <PhosphorIcon name="Gear" size={20} weight="regular" /> }

// FALLBACK_QUALITIES a nivel modulo: si lo declaramos dentro del
// componente, se recrea en cada render y dispara el warning de
// `react-hooks/exhaustive-deps` en `fetchQualities` (su dep changea
// constantemente). Como es un array inmutable de strings, sacarlo
// del cuerpo del componente es seguro.
const FALLBACK_QUALITIES = ['audio_only', '160p', '360p', '480p', '720p', '720p60', '936p60', '963p60', '1080p60', '1440p60']

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

      {/* Fila compacta de Calidad de Stream */}
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
        {/* Modo Solo Audio */}
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

        {/* Estadísticas de Vídeo */}
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

        {/* Chat en Pantalla */}
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

        {/* Lluvia de Emotes */}
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

        {/* Modo Compacto */}
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

/**
 * Reproductor principal. Maneja HLS, fallback de calidad, grabacion
 * via backend, y estadisticas en vivo.
 *
 * @param {VideoPlayerProps} props
 */
export default function VideoPlayer({
  channel, quality, onQualityChange, volume, onVolumeChange,
  theatreMode, onToggleTheatre, compact, onToggleCompact, onOpenAppSettings,
  isLoggedIn, twitchToken, twitchUsername, broadcasterId, onOpenCPPanel, isModerator, isBroadcaster, viewerLogin, onLoginWithToken,
}) {
  const t = useT()
  // M-7: validamos props criticas (vienen de App.jsx). Solo loggea.
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
  const volumeRef = useRef(volume)
  const isFetchingRef = useRef(false)
  const fallbackTimersRef = useRef(null)
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(false)
  const [streamUrl, setStreamUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showControls, setShowControls] = useState(true)
  const [usingFallback, setUsingFallback] = useState(false)
  const [availableQualities, setAvailableQualities] = useState(null)
  const [showClips, setShowClips] = useState(false)
  const [showVods, setShowVods] = useState(false)
  const [showSettingsPanel, setShowSettingsPanel] = useState(false)
  const [isPiP, setIsPiP] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [audioOnly, setAudioOnly] = useState(false)
  const prevQualityRef = useRef('best')
  const audioOnlyRef = useRef(false)
  useEffect(() => { audioOnlyRef.current = audioOnly }, [audioOnly])
  const [stats, setStats] = useState({ bitrate: 'Calculando...', resolution: 'Calculando...', dropped: 0, buffer: '0.0s' })
  // G1 / WT-20260628-16: estado de grabacion extraido a useRecording.
  // El hook maneja isRecording, outputPath, error y cleanup.
  // - `recording`         → render del badge REC
  // - `recordingError`    → mensaje user-friendly cerca del badge
  // - `startRecording`    → abre dialog save y arranca backend
  // - `hookStopRecording` → mata el proceso en el backend
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
  const controlsTimerRef = useRef(null)
  const [streamStartTime] = useState(Date.now)

  useEffect(() => { volumeRef.current = volume }, [volume])

  useEffect(() => {
    if (streamUrl && channel && !recording && localStorage.getItem('blinkstream_rec_autostart') === 'true') {
      const timer = setTimeout(() => {
        startRecording(channel).catch(() => {})
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [streamUrl, channel, recording, startRecording])

  // ── Sistema ORIGINAL: get_stream_url con calidad específica ──
  const fetchStream = useCallback(async (ch, q) => {
    if (!ch) return
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    setLoading(true); setError(''); setStreamUrl('')

    const targetQuality = q || quality || 'best'

    // Audio-only: streamlink directo
    if (targetQuality === 'audio_only') {
      try {
        const url = await measureInvoke('get_stream_url', { channel: ch, quality: 'audio_only' })
        setStreamUrl(url); setUsingFallback(false); setLoading(false); isFetchingRef.current = false; return
      } catch (e) { console.warn('Audio-only failed:', e) }
      setError('No se pudo obtener stream de solo audio')
      setLoading(false); isFetchingRef.current = false; return
    }

    try {
      const url = await measureInvoke('get_stream_url', { channel: ch, quality: targetQuality })
      setStreamUrl(url); setUsingFallback(false); setLoading(false); isFetchingRef.current = false; return
    } catch (e) { console.warn('Streamlink fallback — get_stream_url failed:', e) }

    // Fallback: best
    try {
      const url = await measureInvoke('get_stream_url', { channel: ch, quality: 'best' })
      setStreamUrl(url); setUsingFallback(true); setLoading(false); isFetchingRef.current = false; return
    } catch (e) {
      const msg = typeof e === 'string' ? e : e?.message || e?.toString() || 'Error desconocido'
      setError(`No se pudo cargar ${ch}: ${msg}`)
    }
    setLoading(false); isFetchingRef.current = false
  }, [quality])

  // ── fetchQualities: versión infalible (sin cambios) ──
  const fetchQualities = useCallback(async (ch) => {
    if (!ch) return
    try {
      const quals = await measureInvoke('get_available_qualities', { channel: ch })
      if (Array.isArray(quals) && quals.length > 0) {
        setAvailableQualities(quals.filter(q => q.toLowerCase() !== 'best'))
        return
      }
    } catch (e) { console.warn('Error fetching qualities:', e) }
    // Siempre mostrar calidades aunque el backend falle
    setAvailableQualities(FALLBACK_QUALITIES)
    // FALLBACK_QUALITIES es constante a nivel modulo (ver arriba); la
    // regla exhaustive-deps la pide igualmente como dep formal. La
    // omitimos: la constante nunca cambia.
     
  }, [])

  // ── handleQualityChange: recarga con nueva calidad (SIN hls level API) ──
  const handleQualityChange = useCallback((newQuality) => {
    onQualityChange(newQuality)
    fetchStream(channel, newQuality)
  }, [onQualityChange, fetchStream, channel])

  // ── Carga inicial + reconexión cada 25min ──
  // `quality` se lee dentro del setTimeout; si lo añadimos a las deps,
  // el effect se re-montaría cada vez que cambia la calidad y eso
  // reiniciaría el timer de 25min (UX: el usuario perdería la reconexión
  // cada vez que cambia calidad). Por eso la omitimos: el reconnect usa
  // siempre la ultima `quality` accesible via closure + audioOnlyRef.
   
  useEffect(() => {
    if (abortControllerRef.current) {
      try { abortControllerRef.current.abort() } catch { /* ignore */ }
    }
    const abortCtrl = new AbortController()
    abortControllerRef.current = abortCtrl
    // fetchStream*/fetchQualities disparan setState al resolver; es
    // el patron "fetch on mount/canal-change", no cascading render.
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
    return () => { cancelled = true; try { abortCtrl.abort() } catch {/* ignore */} clearTimeout(timer) }
    // `quality` se lee dentro del setTimeout (línea `fetchStream(channel, quality)`);
    // si la añadimos a deps, el effect se re-montaría cada vez que el
    // usuario cambia calidad y eso reiniciaría el reconnect de 25min.
    // Intencional: la regla exhaustive-deps no modela setTimeout largos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, fetchStream, fetchQualities])

  // ── Cleanup de grabacion ─────────────────────────────────
  // G1 / WT-20260628-16: el hook useRecording ya maneja el cleanup en
  // unmount (fire-and-forget stop_recording). Para el caso de cambio
  // de canal (B-1 original), necesitamos un efecto extra: si el canal
  // cambia mientras graba, el backend Rust seguiria grabando el canal
  // viejo. Lo paramos explicitamente al cambiar `channel`.
  useEffect(() => {
    return () => {
      // Cleanup del cambio de canal. No await: es cleanup, el usuario
      // ya esta navegando.
      if (recording) {
         
        console.info(`[VideoPlayer] Deteniendo grabacion por cambio de canal → ${channel}`)
        hookStopRecording()
      }
    }
  }, [channel, recording, hookStopRecording])

  // ── hls.js effect: SIMPLE con auto-fallback ──
  useEffect(() => {
    const video = videoRef.current
    if (!video || !streamUrl) return
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    // Safari nativo
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      return
    }

    if (!Hls.isSupported()) {
      // El browser no soporta HLS nativo ni hls.js. setError en effect
      // es legitimo: estado UI derivado de la disponibilidad del codec.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('HLS no soportado')
      return
    }

    // WT-20260628-36: config robusta de HLS.js para streams 2K/1440p.
    // - maxBufferLength/maxMaxBufferLength/maxBufferSize: buffer generoso
    //   para absorber picos de bitrate en 2K (Twitch source llega a
    //   ~6-8 Mbps y con picos de 12 Mbps).
    // - capLevelToPlayerSize: evita que HLS.js intente decodificar el
    //   level mas alto cuando el player es mas pequeno (este es el
    //   trigger #4 del spec: causa directa del 2K-black-screen).
    // - abrEwmaDefaultEstimate: arranca con 5 Mbps asumidos en vez de
    //   500 kbps; el default subestima brutalmente streams 2K y fuerza
    //   un downgrade prematuro que confunde al usuario.
    // - fragLoadingTimeOut/manifestLoadingTimeOut/levelLoadingTimeOut
    //   marcados deprecated en 1.6.16 (reemplazados por LoadPolicy) pero
    //   siguen funcionando; los conservo por estabilidad y porque la
    //   spec los pide explicitamente. Si rompen build, migrar a
    //   `fragLoadPolicy: { default: { maxLoadTimeMs: 20000, ... } }`.
    // - debug solo en dev para no spammear consola en produccion.
    const hls = new Hls({
      maxBufferLength: 60,
      maxMaxBufferLength: 600,
      maxBufferSize: 60 * 1000 * 1000,
      backBufferLength: 30,
      capLevelToPlayerSize: true,
      abrEwmaDefaultEstimate: 5_000_000,
      abrBandWidthFactor: 0.95,
      abrBandWidthUpFactor: 0.7,
      enableWorker: true,
      fragLoadingTimeOut: 20000,
      manifestLoadingTimeOut: 15000,
      levelLoadingTimeOut: 15000,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      enableSoftwareAES: true,
      debug: import.meta.env.DEV,
    })
    hlsRef.current = hls
    hls.loadSource(streamUrl)
    hls.attachMedia(video)

    // WT-20260628-36: ResizeObserver para re-evaluar capLevelToPlayerSize
    // cuando el contenedor cambia de tamano (theatre mode, fullscreen,
    // PiP). `triggerLevelSwap` NO existe en hls.js 1.6.16 — el equivalente
    // real es manipular `hls.currentLevel` o llamar `hls.startLoad()`.
    // Aqui solo queremos que hls.js re-mida el player y aplique el cap
    // automaticamente; lo hacemos con un callback defensivo que verifica
    // que la API exista antes de invocarla.
    const resizeObserver = new ResizeObserver(() => {
      if (hls && typeof hls.startLoad === 'function') {
        // startLoad re-evalua el ABR; capLevelToPlayerSize se recalcula
        // internamente cuando el video element reporta nuevas dimensiones.
        try { hls.startLoad() } catch { /* noop: no-op en re-entry */ }
      }
    })
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    // WT-20260628-36: listener de errores nativos del <video>. HLS.js NO
    // emite un ERROR event para todos los fallos del decoder (Codec no
    // soportado, decode error del browser); estos llegan via video.error.
    // Codigos: 1=ABORTED, 2=NETWORK, 3=DECODE, 4=SRC_NOT_SUPPORTED.
    // El 3 (DECODE) es el caso tipico de 2K en WebView2: el HEVC/high
    // profile falla a decodificar y se queda en pantalla negra. El 4 es
    // cuando el codec no esta soportado en absoluto.
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
      if (errCode === 3 && quality !== 'best') {
        // Decode error en una calidad especifica -> caer a 'best' que
        // suele ser la fuente mas estable.
        console.warn(`[VideoPlayer] decode error at ${quality}, falling back to best`)
        onQualityChange('best')
        fetchStream(channel, 'best')
      } else if (errCode === 4) {
        setError(`Codec no soportado: ${errMsg}`)
      }
    }
    video.addEventListener('error', handleVideoError)

    hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
      video.play().catch(() => setPlaying(false))

      // WT-20260628-36: log de diagnostico en dev. Util para confirmar
      // que el manifest tiene los levels esperados (incluido 2K/1440p).
      if (import.meta.env.DEV) {
        const levelsInfo = data.levels.map(l => `${l.height}p (${Math.round(l.bitrate / 1000)}kbps)`).join(', ')
        console.log(`[HLS] ${data.levels.length} levels: ${levelsInfo}`)
      }

      // WT-20260628-36: auto-fallback inteligente de 5s (antes 8s).
      // Tres casos:
      //   1) readyState < 2: no llegaron datos -> bajar 1 level o ir a 'best'
      //   2) videoWidth === 0 con levels disponibles: caso reportado de
      //      2K-black-screen; forzar al level mas bajo.
      //   3) ok: no hacer nada.
      const fallbackTimer = setTimeout(() => {
        if (video.readyState < 2) {
          const currentLevelIdx = hls.currentLevel
          console.warn(`[HLS] current level (${currentLevelIdx}) not playing after 5s, trying fallback`)
          if (hls.levels && hls.levels.length > 1 && currentLevelIdx >= 0 && currentLevelIdx < hls.levels.length - 1) {
            // +1 = un level mas bajo (los levels se ordenan de mayor a menor
            // bitrate en hls.js).
            hls.currentLevel = currentLevelIdx + 1
          } else {
            // No hay level mas bajo disponible -> pedir 'best' que es el
            // flujo mas estable (suele ser 1080p60 o 720p60).
            onQualityChange('best')
            fetchStream(channel, 'best')
          }
        } else if (video.videoWidth === 0 && data.levels.length > 1) {
          // Caso 2K reportado: videoWidth=0 significa que el frame no se
          // ha renderizado, aunque readyState indique datos. Bajar al
          // level mas bajo disponible.
          console.warn(`[VideoPlayer] videoWidth=0 with levels available, downgrading to lowest`)
          hls.currentLevel = data.levels.length - 1
        }
      }, 5000)
      fallbackTimersRef.current = fallbackTimer
    })

    // WT-20260628-36: handler de errores categorizado.
    // Distingue fatales vs no-fatales (los no-fatales hls.js los resuelve
    // solo; no actuamos). Para fatales, recuperacion por tipo:
    //   - NETWORK_ERROR: hls.startLoad() reintenta la carga.
    //   - MEDIA_ERROR: recoverMediaError() resetea MediaSource; si es un
    //     problema de codec especifico (bufferIncompatibleCodecsError /
    //     bufferAppendError), probamos primero un downgrade de level.
    //   - BUFFER_APPEND_ERROR / BUFFER_FULL_ERROR: recoverMediaError().
    //   - otros (KEY_SYSTEM, MUX, OTHER): no recuperables, mostrar error.
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
          if (data.details === 'manifestLoadError' || data.response?.code === 403 || data.response?.code === 404) {
            console.warn('[HLS] Error 403/404 o fallo de manifiesto. Deteniendo bucle y reintentando stream desde Streamlink...')
            hls.destroy()
            if (!isFetchingRef.current) {
              setTimeout(() => { fetchStream(channel, quality) }, 2500)
            }
          } else {
            hls.startLoad()
          }
          break

        case Hls.ErrorTypes.MEDIA_ERROR:
          console.error('[HLS] media error', data.details)
          if (data.details === 'bufferIncompatibleCodecsError' || data.details === 'bufferAppendError') {
            // Codec issue — intentar con el siguiente level mas bajo
            // antes de recover completo (mas barato que re-buffering).
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
          hls.recoverMediaError()
          break

        default:
          console.error('[HLS] fatal error', data.type, data.details)
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

          setStats({
            bitrate: bitrateStr,
            resolution: resolutionStr,
            dropped: droppedVal,
            buffer: bufferAhead,
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
      // WT-20260628-36: cleanup del ResizeObserver y del listener nativo
      // de error del <video>. Sin esto, en re-mount dejariamos observers
      // y handlers colgando que dispararian warnings en consola y
      // mantendrian referencias al video element destruido.
      resizeObserver.disconnect()
      video.removeEventListener('error', handleVideoError)
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [streamUrl, channel, fetchStream, onQualityChange, quality])

  useEffect(() => { const v = videoRef.current; if (v) v.volume = muted ? 0 : volume / 100 }, [volume, muted, streamUrl])

  const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) { v.play().catch(() => {}); setPlaying(true) } else { v.pause(); setPlaying(false) } }
  const toggleMute = () => { const v = videoRef.current; if (!v) return; v.muted = !muted; setMuted(!muted) }

  // ── toggleAudioOnly con fetchStream explícito ──
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
    } catch { /* PiP not supported or denied */ }
  }

  const showControlsTemporarily = () => {
    setShowControls(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000)
  }

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
    // Auto-hide del toast de theatre mode: estado UI derivado de
    // theatreMode. setState en effect es OK aqui.
    if (theatreMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowTheatreToast(true); const t = setTimeout(() => setShowTheatreToast(false), 2500); return () => clearTimeout(t)
    }
  }, [theatreMode])

  // Barra de progreso de sesion: tick cada 30s para refrescar el width.
  // Asi evitamos Date.now() durante render (la regla `react-hooks/purity`
  // detecta funciones impuras llamadas en el cuerpo del componente).
  const [sessionProgress, setSessionProgress] = useState(0)
  useEffect(() => {
    const update = () => {
      const elapsed = (Date.now() - streamStartTime) / 1000
      setSessionProgress(Math.min((elapsed / 3600) * 100, 100))
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

  // Mando a Distancia Wi-Fi (Fase 4): Conectar botones remotos de Play/Pausa, Silencio y Captura de Clip HD
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
  }, [playing, muted, captureSnapshot]);

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
          if (!e.ctrlKey && !e.metaKey && onToggleChat) onToggleChat(); break
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
    // toggleMute/onToggleTheatre/onVolumeChange: handlers de evento
    // provistos por el padre. Si los añadimos a deps, el listener se
    // re-montaría en cada render del padre (no estan memoizados).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, muted, streamUrl, playing, captureSnapshot])

  // ──────────────────────── RENDER ────────────────────────
  return (
    <div ref={containerRef} className={`relative bg-black overflow-hidden group/player ${theatreMode ? 'w-full h-full' : 'w-full'}`} style={theatreMode ? {} : { aspectRatio: '16/9', maxHeight: '100%' }}
      onMouseMove={showControlsTemporarily} onMouseEnter={() => setShowControls(true)} onMouseLeave={() => setShowControls(false)}>

      {showTheatreToast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-black/60 backdrop-blur-md rounded-full px-4 py-1.5 text-[12px] text-white/70 animate-fade-in pointer-events-none">
          {t('player.theatreNotice', '🎭 Modo teatro · Presiona T para salir')}
        </div>
      )}

      <video ref={videoRef} crossOrigin="anonymous" className={`w-full h-full object-contain ${audioOnly ? 'hidden' : ''}`} autoPlay playsInline aria-label={channel ? `Reproduciendo ${channel}` : 'Reproductor de video'} />
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
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <div className="truncate">⚡ <span className="text-white font-semibold ml-0.5">{stats.bitrate || 'Calculando...'}</span></div>
            <div className="truncate">📐 <span className="text-white font-semibold ml-0.5">{stats.resolution || 'Calculando...'}</span></div>
            <div className="truncate">📉 <span className="text-white font-semibold ml-0.5">{stats.dropped} drops</span></div>
            <div className="truncate">🎞️ <span className="text-white font-semibold ml-0.5">{stats.buffer} buffer</span></div>
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

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center px-6 max-w-sm">
            <p className="text-red-400 text-sm font-medium mb-1">Error</p>
            <p className="text-xs text-white/60 break-words mb-3">{error}</p>
            <button onClick={() => fetchStream(channel)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-twitch hover:bg-twitch-dark text-white text-xs cursor-pointer transition-colors">
              Reintentar
            </button>
          </div>
        </div>
      )}



      {/* Control Bar - Isla flotante premium */}
      <div className={`absolute bottom-6 left-6 right-6 z-30 flex items-center justify-between bg-[#101014]/85 backdrop-blur-2xl border border-white/15 px-6 py-3.5 rounded-2xl transition-all duration-300 shadow-[0_10px_40px_rgba(0,0,0,0.7)] ${showControls ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95 pointer-events-none'}`}>
        <div className="flex items-center gap-4 text-white">
          <button onClick={togglePlay} className="hover:text-twitch transition-colors cursor-pointer" aria-label={playing ? t('player.pause', 'Pausar') : t('player.play', 'Reproducir')}>{playing ? <PauseIcon/> : <PlayIcon/>}</button>
          <button onClick={toggleMute} className="hover:text-twitch transition-colors cursor-pointer" aria-label={muted ? t('player.unmute', 'Activar sonido') : t('player.mute', 'Silenciar')}>{muted ? <VolumeMute/> : <VolumeHigh/>}</button>
          <input type="range" min="0" max="100" value={muted ? 0 : volume} onChange={handleVolume} className="w-20 h-1 accent-twitch bg-white/20 rounded-lg appearance-none cursor-pointer" aria-label="Volumen" aria-valuemin="0" aria-valuemax="100" aria-valuenow={muted ? 0 : volume} />
          <LiveBadge />
        </div>

        <div className="flex items-center gap-3 text-white/60">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowClips(true)} className="hover:text-white transition-colors cursor-pointer" title={t('player.clips', 'Clips')} aria-label="Abrir clips"><ClipIcon/></button>
            <button onClick={() => setShowVods(true)} className="hover:text-white transition-colors cursor-pointer" title={t('player.vods', 'VODs')} aria-label="Ver VODs"><VodIcon/></button>
            <button onClick={async () => {
              // G1 / WT-20260628-16: delega al hook useRecording.
              // El hook se encarga del dialog save, errores, y eventLog.
              if (recording) {
                await hookStopRecording()
              } else {
                await startRecording(channel)
              }
            }} className={`hover:text-white transition-colors cursor-pointer ${recording ? 'text-red-500' : ''}`} title={recording ? t('player.stopRecord', 'Detener grabación') : t('player.record', 'Grabar stream')} aria-label="Grabar stream">
              {recording ? (
                // FASE 4 / WT-20260628-45: Lordicon animado. Si la red/CDN
                // falla, AnimatedIcon cae a Phosphor Record duotone.
                <AnimatedIcon
                  src="https://cdn.lordicon.com/lbjeurwh.json"
                  fallback="Record"
                  size={18}
                  color="#ef4444"
                />
              ) : (
                <PhosphorIcon name="Record" size={18} weight="duotone" />
              )}
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
              try { safeOpenUrl(`https://www.twitch.tv/${channel}`, true) } catch { /* ignore: el helper ya hace fallback */ }
            }} className="hover:text-white transition-colors cursor-pointer" title={t('player.browser', 'Abrir en navegador')} aria-label="Abrir en navegador">
              <PhosphorIcon name="ArrowSquareOut" size={16} weight="regular" />
            </button>
            <button onClick={togglePiP} className={`hover:text-white transition-colors cursor-pointer ${isPiP ? 'text-twitch' : ''}`} title={t('player.pip', 'Picture-in-Picture')} aria-label="Picture-in-Picture">
              <PhosphorIcon name="PictureInPicture" size={16} weight="regular" />
            </button>
            <button onClick={toggleFullscreen} className="hover:text-white transition-colors cursor-pointer" title={t('player.fullscreen', 'Fullscreen (F)')} aria-label="Pantalla completa"><FullscreenIcon/></button>
          </div>
        </div>

        <div className="absolute top-0 left-5 right-5 h-[2px] bg-white/10 rounded-full overflow-hidden -translate-y-1">
          <div className="bg-twitch h-full shadow-[0_0_8px_#9146FF] transition-all duration-1000" style={{
            width: `${sessionProgress}%`
          }} />
        </div>
      </div>

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
          onOpenAppSettings={onOpenAppSettings}
        />
      )}

      <EmoteRainOverlay active={showEmoteEffects} />

      {showClips && <ClipPlayer channel={channel} onClose={() => setShowClips(false)} />}
      {showVods && <VodPlayer channel={channel} onClose={() => setShowVods(false)} />}

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
