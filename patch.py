import re

with open("src/components/VideoPlayer.jsx", "r", encoding="utf-8") as f:
    code = f.read()

# 1. Add hlsDebug state
code = code.replace(
    "const [usingFallback, setUsingFallback] = useState(false)",
    "const [usingFallback, setUsingFallback] = useState(false)\n  const [hlsDebug, setHlsDebug] = useState('Iniciando...')"
)

# 2. Add hlsDebug setters in fetchStream
code = code.replace(
    "setError('No se pudo obtener stream de solo audio')",
    "setError('No se pudo obtener stream de solo audio')\n      setHlsDebug('Fallo audio-only')"
)
code = code.replace(
    "setError(`No se pudo cargar ${ch}: ${msg}`)",
    "setError(`No se pudo cargar ${ch}: ${msg}`)\n      setHlsDebug(`Fallo get_stream_url: ${msg}`)"
)

# 3. Completely replace the HLS setup block
hls_setup_old = """    // Safari nativo
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
      loader: TauriPlaylistLoader,
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
    hls.attachMedia(video)"""

hls_setup_new = """    // 1. Primero intentar hls.js (siempre preferido en Chrome/Edge/Firefox)
    if (Hls.isSupported()) {
      try {
        const hls = new Hls({
          loader: TauriPlaylistLoader,
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

        hls.on(Hls.Events.MEDIA_ATTACHING, () => window.dispatchEvent(new CustomEvent('hls-debug', { detail: 'ATTACHING' })))
        hls.on(Hls.Events.MEDIA_ATTACHED, () => window.dispatchEvent(new CustomEvent('hls-debug', { detail: 'ATTACHED' })))
        hls.on(Hls.Events.MANIFEST_LOADING, () => window.dispatchEvent(new CustomEvent('hls-debug', { detail: 'MANIFEST_LOADING' })))
        
        hls.loadSource(streamUrl)
        hls.attachMedia(video)
      } catch (err) {
        console.error('[VideoPlayer] Critical HLS setup error:', err)
        setHlsDebug(`CRITICAL ERROR: ${err.message}`)
        setError(`Fallo crítico inicializando reproductor: ${err.message}`)
        return
      }"""
code = code.replace(hls_setup_old, hls_setup_new)

# 4. Add hlsDebug to handleVideoError
code = code.replace(
    "setError(`Fallo de decodificación de vídeo (Hardware/Codec). Intenta actualizar tus drivers o instalar el Media Feature Pack si usas Windows N.`)\n        }",
    "setError(`Fallo de decodificación de vídeo (Hardware/Codec). Intenta actualizar tus drivers o instalar el Media Feature Pack si usas Windows N.`)\n          setHlsDebug('Native MEDIA_ERR_DECODE ignorado/mostrado')\n        }"
)
code = code.replace(
    "setError(`Formato de vídeo no soportado por tu sistema: ${errMsg}`)\n      }",
    "setError(`Formato de vídeo no soportado por tu sistema: ${errMsg}`)\n        setHlsDebug('Native MEDIA_ERR_SRC_NOT_SUPPORTED')\n      }"
)

# 5. Add hlsDebug to Hls.Events.MANIFEST_PARSED
manifest_parsed_old = """    hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
      video.play().catch(() => setPlaying(false))

      // WT-20260628-36: log de diagnostico en dev. Util para confirmar
      // que el manifest tiene los levels esperados (incluido 2K/1440p).
      if (import.meta.env.DEV) {
        const levelsInfo = data.levels.map(l => `${l.height}p (${Math.round(l.bitrate / 1000)}kbps)`).join(', ')
        console.log(`[HLS] ${data.levels.length} levels: ${levelsInfo}`)
      }"""
manifest_parsed_new = """    hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
      setHlsDebug(prev => prev + ` -> MANIFEST_PARSED (${data.levels.length} lvls)`)
      video.play().catch(() => setPlaying(false))

      if (import.meta.env.DEV) {
        console.info(`[VideoPlayer] HLS manifest loaded for ${channel}. Levels:`, data.levels)
      }"""
code = code.replace(manifest_parsed_old, manifest_parsed_new)

# 6. Add hlsDebug to Hls.Events.ERROR
code = code.replace(
    "console.error('[HLS] network error', data.details)",
    "console.error('[HLS] network error', data.details)\n          setHlsDebug(`NETWORK_ERROR: ${data.details}`)"
)
code = code.replace(
    "console.error('[HLS] media error', data.details)",
    "console.error('[HLS] media error', data.details)\n          setHlsDebug(`MEDIA_ERROR: ${data.details}`)"
)
code = code.replace(
    "console.error('[HLS] buffer error', data.details)",
    "console.error('[HLS] buffer error', data.details)\n          setHlsDebug(`BUFFER_ERROR: ${data.details}`)"
)
code = code.replace(
    "console.error('[HLS] fatal error', data.type, data.details)",
    "console.error('[HLS] fatal error', data.type, data.details)\n          setHlsDebug(`FATAL: ${data.type} ${data.details}`)"
)

# 7. Close the if (Hls.isSupported()) block and add Safari fallback
error_block_end_old = """        default:
          console.error('[HLS] fatal error', data.type, data.details)
          setError(`Error de reproducción: ${data.details || data.type}`)
          hls.destroy()
      }
    })"""
error_block_end_new = """        default:
          console.error('[HLS] fatal error', data.type, data.details)
          setError(`Error de reproducción: ${data.details || data.type}`)
          hls.destroy()
      }
    })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // 2. Safari nativo / Edge si devuelve "maybe"
      setHlsDebug('Native Safari Mode')
      video.src = streamUrl
    } else {
      // 3. Fallback
      setError('HLS no soportado')
    }"""
code = code.replace(error_block_end_old, error_block_end_new)

# 8. Fix showControlsTemporarily
controls_old = """  const showControlsTemporarily = () => {
    setShowControls(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000)
  }"""
controls_new = """  const handleMouseMove = useCallback(() => {
    if (!showControls) setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => { setShowControls(false) }, 3000)
  }, [showControls])

  useEffect(() => {
    const handleDebug = (e) => setHlsDebug(prev => prev + ' -> ' + e.detail)
    window.addEventListener('hls-debug', handleDebug)
    return () => window.removeEventListener('hls-debug', handleDebug)
  }, [])"""
code = code.replace(controls_old, controls_new)

code = code.replace("onMouseMove={showControlsTemporarily}", "onMouseMove={handleMouseMove}")

# 9. Add debug info overlay
overlay_old = """        </div>
      )}



      {/* Control Bar - Isla flotante premium */}"""
overlay_new = """        </div>
      )}

      {/* Debug Info Overlay */}
      <div className="absolute top-4 left-4 z-50 bg-black/70 text-green-400 font-mono text-xs p-2 rounded pointer-events-none">
        <div>DEBUG: {hlsDebug}</div>
        <div className="truncate w-64">URL: {streamUrl || 'none'}</div>
      </div>

      {/* Control Bar - Isla flotante premium */}"""
code = code.replace(overlay_old, overlay_new)

with open("src/components/VideoPlayer.jsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Patch applied!")
