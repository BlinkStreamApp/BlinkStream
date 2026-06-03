import { useState, useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import Hls from 'hls.js'
import { getDirectStreamUrl, getStreamInfo } from '../utils/twitch'
import { formatViewers } from '../utils/format'
import QualitySelector from './QualitySelector'
import ClipPlayer from './ClipPlayer'
import VodPlayer from './VodPlayer'
import LiveBadge from './LiveBadge'
import ToggleSwitch from './ToggleSwitch'

function PlayIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5L8 5.5z"/></svg> }
function PauseIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="2"/><rect x="14" y="4" width="5" height="16" rx="2"/></svg> }
function VolumeHigh() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M2 9.5v5h3.5l4.5 4V5.5l-4.5 4H2z"/><path d="M17 8a5.5 5.5 0 0 1 0 8"/><path d="M20 5a9 9 0 0 1 0 14"/></svg> }
function VolumeMute() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M2 9.5v5h3.5l4.5 4V5.5l-4.5 4H2z"/><path d="M22 9l-6 6M16 9l6 6"/></svg> }
function FullscreenIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/></svg> }
function TheatreIcon() { return <svg width="20" height="20" viewBox="0 0 512 512" fill="none" stroke="currentColor" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round"><path d="M97.69,293.63a8,8,0,0,0,6.55,1.74a850.73,850.73,0,0,1,303.52,0a8,8,0,0,0,9.42-7.88v-188.32a8,8,0,0,0-9.42-7.87a850.73,850.73,0,0,1-303.52,0a8,8,0,0,0-9.42,7.87v188.32A8,8,0,0,0,97.69,293.63Zm13.13-184.94a866.22,866.22,0,0,0,290.36,0v172.97a866.3,866.3,0,0,0-290.36,0Z"/><path d="M186.58,354.23a7,7,0,0,0-7-7h-4.01v-11.89a23.33,23.33,0,0,0-23.3-23.3h-30.27a23.33,23.33,0,0,0-23.3,23.3v11.89h-4.02a7,7,0,1,0,0,14h84.9A7,7,0,0,0,186.58,354.23Z"/><path d="M271.13,312.04h-30.26a23.33,23.33,0,0,0-23.31,23.3v11.89h-4.01a7,7,0,1,0,0,14h84.9a7,7,0,0,0,0-14h-4.01v-11.89A23.33,23.33,0,0,0,271.13,312.04Z"/></svg> }
function ClipIcon() { return <svg width="19" height="19" viewBox="0 0 512 512" fill="none" stroke="currentColor" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round"><path d="M401.24,215.29H152.46L385.56,129.59a8,8,0,0,0,4.75-10.27l-15.36-41.77a8,8,0,0,0-10.27-4.75L108,167.17a8,8,0,0,0-4.75,10.27l15.36,41.77a8,8,0,0,0,1.35,2.33a8,8,0,0,0-.2,1.75v193.8a22.63,22.63,0,0,0,22.61,22.6h244.27a22.63,22.63,0,0,0,22.6-22.6v-193.8A8,8,0,0,0,401.24,215.29Zm-8,44.5h-33.16v-28.5h33.16Zm-257.48,0v-28.5h33.16v28.5Zm73.67-28.5h35.35v28.5h-35.35Zm75.86,0h34.28v28.5h-34.28Zm-52.1-107.77l-33.18,12.2l-9.83-26.75l33.18-12.2Zm28.18-40.73l32.18-11.83l9.83,26.75l-32.17,11.83Zm111.16-10.5l-31.13,11.44l-9.83-26.75l31.12-11.44ZM152.15,167.99l9.84,26.75l-31.12,11.44l-9.84-26.75ZM386.63,423.69H142.36a6.61,6.61,0,0,1-6.6-6.6v-141.3h257.48v141.3A6.61,6.61,0,0,1,386.63,423.69Z"/><path d="M355.76,348.24H173.23a10.45,10.45,0,0,0-10.45,10.45v28.78a9.81,9.81,0,0,0,9.81,9.8h183.16a9.81,9.81,0,0,0,9.81-9.8v-28.78A10.45,10.45,0,0,0,355.76,348.24Z"/></svg> }
function VodIcon() { return <svg width="19" height="19" viewBox="0 0 512 512" fill="none" stroke="currentColor" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round"><path d="M449.42,108.4H62.58a8,8,0,0,0-8,8v279.2a8,8,0,0,0,8,8h386.85a8,8,0,0,0,8-8V116.4A8,8,0,0,0,449.42,108.4ZM99.64,368.82H77.13v-27.8h22.51Zm0-49.42H77.13v-27.81h22.51Zm0-49.43H77.13v-27.8h22.51Zm0-49.42H77.13v-27.81h22.51Zm0-49.43H77.13v-27.8h22.51ZM390.06,387.6H122.03V124.4h268.03Zm44.9-18.78H412.45v-27.8h22.51Zm0-49.42H412.45v-27.81h22.51Zm0-49.43H412.45v-27.8h22.51Zm0-49.42H412.45v-27.81h22.51Zm0-49.43H412.45v-27.8h22.51Z"/><path d="M286.14,214.72a8,8,0,0,0-11.15,1.91l-25.44,35.91a8,8,0,0,0,6.53,12.62h23.8v10.27a8,8,0,0,0,16,0v-10.27h6.58a8,8,0,1,0,0-16h-6.58v-9.96a7.99,7.99,0,0,0-12.7-6.46l4.86-6.87A8,8,0,0,0,286.14,214.72Zm-6.25,24.49v9.95h-8.34l8.67-12.23A8,8,0,0,0,279.88,239.21Z"/></svg> }
function SettingsIcon() { return <svg width="20" height="20" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M26.7,12.3c-2.1,0.4-4,0-4.7-1.3c-0.7-1.3-0.2-3.1,1.3-4.7c-1.3-1.3-3-2.2-4.8-2.8C17.8,5.6,16.5,7,15,7s-2.8-1.4-3.5-3.5C9.7,4.1,8.1,5,6.8,6.3c1.5,1.6,2,3.5,1.3,4.7c-0.7,1.3-2.6,1.7-4.7,1.3C3.1,13.1,3,14.1,3,15s0.1,1.9,0.3,2.7c2.1-0.4,4,0,4.7,1.3c0.7,1.3,0.2,3.1-1.3,4.7c1.3,1.3,3,2.2,4.8,2.8c0.7-2.1,2-3.5,3.5-3.5s2.8,1.4,3.5,3.5c1.8-0.5,3.4-1.5,4.8-2.8c-1.5-1.6-2-3.5-1.3-4.7c0.7-1.3,2.6-1.7,4.7-1.3c0.2-0.9,0.3-1.8,0.3-2.7S26.9,13.1,26.7,12.3z"/><circle cx="15" cy="15" r="4"/></svg> }

function PlayerSettingsPanel({ onClose, compact, onToggleCompact }) {
  const [opts, setOpts] = useState({
    compact: compact || false,
  })

  return (
    <div className="absolute bottom-20 right-4 z-40 w-64 bg-bg-secondary/80 backdrop-blur-xl border border-bg-tertiary/60 rounded-xl p-4 text-text-primary shadow-2xl animate-fade-in">
      <div className="flex items-center justify-between pb-3 border-b border-bg-tertiary/30">
        <span className="text-xs font-bold tracking-wide">Ajustes</span>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div className="mt-3 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Modo compacto</span>
          <ToggleSwitch active={opts.compact} onClick={() => { setOpts(p => ({ ...p, compact: !p.compact })); onToggleCompact?.() }} />
        </div>
      </div>
    </div>
  )
}

export default function VideoPlayer({
  channel, quality, onQualityChange, volume, onVolumeChange,
  theatreMode, onToggleTheatre,
}) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const volumeRef = useRef(volume)
  const reconnTimerRef = useRef(null)
  const isFetchingRef = useRef(false)
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(false)
  const [streamUrl, setStreamUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showControls, setShowControls] = useState(true)
  const [streamInfo, setStreamInfo] = useState(null)
  const [usingFallback, setUsingFallback] = useState(false)
  const [progress, setProgress] = useState(0)
  const [availableQualities, setAvailableQualities] = useState(null)
  const [showClips, setShowClips] = useState(false)
  const [showVods, setShowVods] = useState(false)
  const [showSettingsPanel, setShowSettingsPanel] = useState(false)
  const [isPiP, setIsPiP] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [audioOnly, setAudioOnly] = useState(false)
  const prevQualityRef = useRef('best')
  const [stats, setStats] = useState({ bitrate: null, resolution: null, dropped: 0, buffer: 0 })
  const [recording, setRecording] = useState(false)
  const [showTheatreToast, setShowTheatreToast] = useState(false)
  const [compact, setCompact] = useState(() => localStorage.getItem('blinkstream_compact') === 'true')
  const containerRef = useRef(null)
  const controlsTimerRef = useRef(null)
  const [streamStartTime] = useState(Date.now)

  useEffect(() => { volumeRef.current = volume }, [volume])

  const fetchStream = useCallback(async (ch) => {
    if (!ch) return
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    setLoading(true); setError(''); setStreamUrl('')

    try {
      const url = await invoke('get_stream_url', { channel: ch, quality: 'best' })
      setStreamUrl(url); setUsingFallback(false); setLoading(false); isFetchingRef.current = false; return
    } catch (e) { console.warn('Streamlink fallback — get_stream_url failed:', e) }

    try {
      const url = await getDirectStreamUrl(ch, 'chunked')
      setStreamUrl(url); setUsingFallback(true); setLoading(false); isFetchingRef.current = false; return
    } catch (e) { console.warn('Direct stream fallback (chunked) failed:', e) }

    try {
      const url = await getDirectStreamUrl(ch, 'audio_only')
      setStreamUrl(url); setUsingFallback(true); setLoading(false); isFetchingRef.current = false; return
    } catch (e) { console.warn('Direct stream fallback (audio_only) failed:', e) }

    setError(`No se pudo cargar ${ch}. ¿Está online?`)
    setLoading(false); isFetchingRef.current = false
  }, [])

  const fetchStreamInfo = useCallback(async (ch) => {
    const info = await getStreamInfo(ch); setStreamInfo(info)
  }, [])

  const fetchQualities = useCallback(async (ch) => {
    if (!ch) return
    try {
      const quals = await invoke('get_available_qualities', { channel: ch })
      if (Array.isArray(quals) && quals.length > 0) { setAvailableQualities(quals.filter(q => q.toLowerCase() !== 'best')); return }
    } catch {}
    setAvailableQualities([])
  }, [])

  useEffect(() => {
    Promise.all([fetchStream(channel), fetchStreamInfo(channel), fetchQualities(channel)])
    reconnTimerRef.current = setInterval(() => { fetchStream(channel) }, 25 * 60 * 1000)
    return () => { if (reconnTimerRef.current) clearInterval(reconnTimerRef.current) }
  }, [channel, fetchStream, fetchStreamInfo, fetchQualities])

  useEffect(() => { const i = setInterval(() => fetchStreamInfo(channel), 120000); return () => clearInterval(i) }, [channel, fetchStreamInfo])
  useEffect(() => { if (channel) fetchStream(channel) }, [quality])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !streamUrl) return
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = streamUrl }
    else if (Hls.isSupported()) {
      const hls = new Hls(); hlsRef.current = hls
      hls.loadSource(streamUrl); hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => setPlaying(false)) })
      hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) { setError('Error de reproducción'); fetchStream(channel) } })
      const statsInterval = setInterval(() => {
        if (!hlsRef.current) return
        const level = hls.levels[hls.currentLevel]
        setStats({
          bitrate: level ? `${Math.round(level.bitrate / 1000)} kbps` : 'N/A',
          resolution: level ? `${level.width}x${level.height}@${level.attrs?.FRAME_RATE || '?'}` : 'N/A',
          dropped: hls.stats?.droppedFrames || 0,
          buffer: video.buffered.length ? `${video.buffered.end(video.buffered.length - 1).toFixed(1)}s` : '0s',
        })
      }, 2000)
      return () => {
        clearInterval(statsInterval)
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      }
    } else { setError('HLS no soportado') }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [streamUrl, channel, fetchStream])

  useEffect(() => { const v = videoRef.current; if (v) v.volume = muted ? 0 : volume / 100 }, [volume, muted, streamUrl])

  const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) { v.play().catch(() => {}); setPlaying(true) } else { v.pause(); setPlaying(false) } }
  const toggleMute = () => { const v = videoRef.current; if (!v) return; v.muted = !muted; setMuted(!muted) }
  const toggleAudioOnly = () => {
    setAudioOnly(p => {
      if (p) { onQualityChange(prevQualityRef.current); return false }
      prevQualityRef.current = quality
      onQualityChange('audio_only')
      return true
    })
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
    const up = () => setProgress(v.currentTime)
    v.addEventListener('timeupdate', up)
    const onPlay = () => setPlaying(true); const onPause = () => setPlaying(false)
    v.addEventListener('play', onPlay); v.addEventListener('pause', onPause)
    const onPiPEnter = () => setIsPiP(true); const onPiPLeave = () => setIsPiP(false)
    v.addEventListener('enterpictureinpicture', onPiPEnter)
    v.addEventListener('leavepictureinpicture', onPiPLeave)
    return () => { v.removeEventListener('timeupdate', up); v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); v.removeEventListener('enterpictureinpicture', onPiPEnter); v.removeEventListener('leavepictureinpicture', onPiPLeave) }
  }, [streamUrl])

  useEffect(() => { if (theatreMode) { setShowTheatreToast(true); const t = setTimeout(() => setShowTheatreToast(false), 2500); return () => clearTimeout(t) } }, [theatreMode])

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
  }, [volume, muted, streamUrl, playing])

  return (
    <div ref={containerRef} className={`relative bg-black overflow-hidden group/player ${theatreMode ? 'w-full h-full' : 'w-full'}`} style={theatreMode ? {} : { aspectRatio: '16/9', maxHeight: '100%' }}
      onMouseMove={showControlsTemporarily} onMouseEnter={() => setShowControls(true)} onMouseLeave={() => setShowControls(false)}>

      {showTheatreToast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-black/60 backdrop-blur-md rounded-full px-4 py-1.5 text-[12px] text-white/70 animate-fade-in pointer-events-none">
          🎭 Modo teatro · Presiona <kbd className="px-1 py-0.5 bg-white/10 rounded text-[11px]">T</kbd> para salir
        </div>
      )}

      <video ref={videoRef} className={`w-full h-full object-contain ${audioOnly ? 'hidden' : ''}`} autoPlay playsInline />
      {audioOnly && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 select-none">
          <div className="w-16 h-16 rounded-2xl bg-twitch/20 flex items-center justify-center mb-3 animate-pulse-glow">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-twitch"><path d="M2 9.5v5h3.5l4.5 4V5.5l-4.5 4H2z"/><path d="M17 8a5.5 5.5 0 0 1 0 8"/><path d="M20 5a9 9 0 0 1 0 14"/></svg>
          </div>
          <p className="text-white/60 text-sm font-medium">Modo solo audio</p>
          <p className="text-text-muted text-[12px] mt-1">{channel}</p>
        </div>
      )}

      {showStats && (
        <div className="absolute top-3 left-3 z-20 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 text-[12px] font-mono text-white/80 space-y-0.5 select-none pointer-events-none">
          <p>⚡ {stats.bitrate}  |  📐 {stats.resolution}</p>
          <p>📉 Dropped: {stats.dropped}  |  🎞 Buffer: {stats.buffer}</p>
        </div>
      )}

      {recording && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2 bg-red-500/90 backdrop-blur-sm rounded-lg px-3 py-1.5 select-none animate-pulse-glow">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse-dot" />
          <span className="text-white text-[12px] font-bold uppercase tracking-wider">REC</span>
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

      <div className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-end px-6 py-4 bg-gradient-to-b from-black/80 to-transparent transition-all duration-300 select-none ${showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
        <div className="flex items-center gap-3">
          {streamInfo?.viewer_count != null && (
            <span className="text-[12px] text-white/70 font-medium">{formatViewers(streamInfo.viewer_count)} viewers</span>
          )}
          <LiveBadge />
        </div>
      </div>

      <div className={`absolute bottom-4 left-4 right-4 z-30 flex items-center justify-between bg-black/70 backdrop-blur-xl border border-white/[0.08] px-5 py-3 rounded-xl transition-all duration-300 shadow-2xl ${showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
        <div className="flex items-center gap-4 text-white">
          <button onClick={togglePlay} className="hover:text-twitch transition-colors cursor-pointer" aria-label={playing ? 'Pausar' : 'Reproducir'}>{playing ? <PauseIcon/> : <PlayIcon/>}</button>
          <button onClick={toggleMute} className="hover:text-twitch transition-colors cursor-pointer" aria-label={muted ? 'Activar sonido' : 'Silenciar'}>{muted ? <VolumeMute/> : <VolumeHigh/>}</button>
          <input type="range" min="0" max="100" value={muted ? 0 : volume} onChange={handleVolume} className="w-20 h-1 accent-twitch bg-white/20 rounded-lg appearance-none cursor-pointer" aria-label="Volumen" aria-valuemin="0" aria-valuemax="100" aria-valuenow={muted ? 0 : volume} />
          <button onClick={toggleAudioOnly} className={`hover:text-white transition-colors cursor-pointer ${audioOnly ? 'text-twitch' : ''}`} title={audioOnly ? 'Modo video' : 'Solo audio'} aria-label="Solo audio">
            {audioOnly ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M2 9.5v5h3.5l4.5 4V5.5l-4.5 4H2z"/></svg>
            )}
          </button>
          <LiveBadge />
        </div>

        <div className="flex items-center gap-3 text-white/60">
          <div className="flex items-center gap-3">
            {availableQualities === null ? <span className="text-[11px] px-2">...</span> : availableQualities.length > 0 && <QualitySelector current={quality} onChange={onQualityChange} qualities={availableQualities} />}
            <button onClick={() => setShowClips(true)} className="hover:text-white transition-colors cursor-pointer" title="Clips" aria-label="Abrir clips"><ClipIcon/></button>
            <button onClick={() => setShowVods(true)} className="hover:text-white transition-colors cursor-pointer" title="VODs" aria-label="Ver VODs"><VodIcon/></button>
            <button onClick={async () => {
              if (recording) {
                try { await invoke('stop_recording'); setRecording(false) } catch {}
                return
              }
              try {
                const { save } = await import('@tauri-apps/plugin-dialog')
                const path = await save({ defaultPath: `${channel}_${Date.now()}.ts`, filters: [{ name: 'Video', extensions: ['ts','mp4'] }] })
                if (path) { await invoke('start_recording', { channel, outputPath: path }); setRecording(true) }
              } catch {}
            }} className={`hover:text-white transition-colors cursor-pointer ${recording ? 'text-red-500' : ''}`} title={recording ? 'Detener grabación' : 'Grabar stream'} aria-label="Grabar stream">
              <svg width="16" height="16" viewBox="0 0 24 24" fill={recording ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r={recording ? '4' : '8'}/><circle cx="12" cy="12" r="2.5" fill={recording ? 'white' : 'currentColor'}/></svg>
            </button>
          </div>

          <div className="w-px h-5 bg-white/10 mx-1" />

          <div className="flex items-center gap-3">
            <button onClick={() => setShowSettingsPanel(p => !p)} className={`hover:text-white transition-colors cursor-pointer ${showSettingsPanel ? 'text-twitch' : ''}`} title="Ajustes" aria-label="Ajustes del reproductor"><SettingsIcon/></button>
            <button onClick={onToggleTheatre} className={`hover:text-white transition-colors cursor-pointer ${theatreMode ? 'text-twitch' : ''}`} title="Teatro (T)" aria-label="Modo teatro"><TheatreIcon/></button>
            <button onClick={async () => {
              try { await import('@tauri-apps/plugin-opener'); window.open(`https://www.twitch.tv/${channel}`, '_blank') } catch {}
            }} className="hover:text-white transition-colors cursor-pointer" title="Abrir en navegador" aria-label="Abrir en navegador">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
            </button>
            <button onClick={togglePiP} className={`hover:text-white transition-colors cursor-pointer ${isPiP ? 'text-twitch' : ''}`} title="Picture-in-Picture" aria-label="Picture-in-Picture">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="9" y="8" width="13" height="11" rx="1.5"/><path d="M20 3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/></svg>
            </button>
            <button onClick={toggleFullscreen} className="hover:text-white transition-colors cursor-pointer" title="Fullscreen (F)" aria-label="Pantalla completa"><FullscreenIcon/></button>
          </div>
        </div>

        <div className="absolute top-0 left-5 right-5 h-[2px] bg-white/10 rounded-full overflow-hidden -translate-y-1">
          <div className="bg-twitch h-full shadow-[0_0_8px_#9146FF] transition-all duration-1000" style={{
            width: `${(() => {
              const elapsed = (Date.now() - streamStartTime) / 1000
              return Math.min((elapsed / 3600) * 100, 100)
            })()}%`
          }} />
        </div>
      </div>

      {showSettingsPanel && <PlayerSettingsPanel onClose={() => setShowSettingsPanel(false)} compact={compact} onToggleCompact={() => { setCompact(p => { const next = !p; localStorage.setItem('blinkstream_compact', String(next)); return next; }) }} />}

      {showClips && <ClipPlayer channel={channel} onClose={() => setShowClips(false)} />}
      {showVods && <VodPlayer channel={channel} onClose={() => setShowVods(false)} />}
    </div>
  )
}
