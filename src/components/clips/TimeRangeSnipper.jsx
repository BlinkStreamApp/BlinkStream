import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../../utils/tauriEnv'
import PhosphorIcon from '../icons/PhosphorIcon'

function formatSeconds(secs) {
  const total = Math.max(0, Math.floor(Number(secs) || 0))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function parseFormattedTime(str) {
  if (!str) return 0
  const parts = str.split(':').map(p => parseInt(p, 10))
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1]
  }
  const val = Number(str)
  return isNaN(val) ? 0 : val
}

export default function TimeRangeSnipper({
  mediaUrl,
  maxDuration = 60,
  title = 'Clip',
  onClose,
}) {
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(() => Math.min(maxDuration > 0 ? maxDuration : 60, 60))
  const [status, setStatus] = useState('idle') // 'idle' | 'snipping' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('')
  const [savedPath, setSavedPath] = useState('')

  const duration = Math.max(0, endTime - startTime)

  const handleStartChange = useCallback((val) => {
    const s = Math.max(0, Math.min(maxDuration - 1, Number(val) || 0))
    setStartTime(s)
    if (s >= endTime) {
      setEndTime(Math.min(maxDuration, s + 5))
    }
  }, [endTime, maxDuration])

  const handleEndChange = useCallback((val) => {
    const e = Math.max(1, Math.min(maxDuration, Number(val) || 1))
    setEndTime(e)
    if (e <= startTime) {
      setStartTime(Math.max(0, e - 5))
    }
  }, [startTime, maxDuration])

  const handleDownloadSnippet = async () => {
    if (!mediaUrl) {
      setErrorMsg('No hay URL de vídeo disponible para recortar')
      setStatus('error')
      return
    }

    if (endTime <= startTime) {
      setErrorMsg('El tiempo final debe ser mayor que el inicial')
      setStatus('error')
      return
    }

    setStatus('snipping')
    setErrorMsg('')

    try {
      if (!isTauri()) {
        throw new Error('La descarga de fragmentos solo está disponible en la app de escritorio')
      }

      const safeTitle = (title || 'snippet').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40)
      const outputName = `${safeTitle}_${Math.floor(startTime)}s-${Math.floor(endTime)}s`

      const result = await invoke('download_media_range', {
        url: mediaUrl,
        startTime: Number(startTime),
        endTime: Number(endTime),
        outputName,
      })

      setSavedPath(result)
      setStatus('success')
    } catch (err) {
      const msg = typeof err === 'string' ? err : err?.message || 'Error al procesar el fragmento con FFmpeg'
      setErrorMsg(msg)
      setStatus('error')
    }
  }

  return (
    <div className="p-4 bg-bg-secondary/95 border border-white/15 rounded-2xl backdrop-blur-2xl shadow-2xl space-y-4 text-text-primary">
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-twitch/20 text-twitch-light border border-twitch/30">
            <PhosphorIcon name="SlidersHorizontal" size={18} weight="duotone" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-wide">Recortar y Descargar Fragmento</h4>
            <p className="text-[11px] text-text-muted">Exporta solo el segmento deseado en MP4 ultra-rápido</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-text-muted hover:text-white p-1 cursor-pointer transition-colors" aria-label="Cerrar">
            <PhosphorIcon name="X" size={16} weight="bold" />
          </button>
        )}
      </div>

      {/* Range controls */}
      <div className="space-y-3 bg-black/40 p-3 rounded-xl border border-white/5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-text-muted font-medium">Inicio:</span>
            <input
              type="text"
              value={formatSeconds(startTime)}
              onChange={(e) => handleStartChange(parseFormattedTime(e.target.value))}
              className="w-16 px-2 py-1 bg-bg-tertiary border border-white/10 rounded-lg text-center font-mono font-bold text-white text-xs focus:border-twitch focus:outline-none"
              aria-label="Tiempo de inicio"
            />
          </div>

          <div className="px-2.5 py-1 bg-twitch/20 border border-twitch/40 rounded-full text-twitch-light font-bold text-[11px] flex items-center gap-1">
            <PhosphorIcon name="ClockCounterClockwise" size={12} weight="bold" />
            <span>Duración: {formatSeconds(duration)}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-text-muted font-medium">Fin:</span>
            <input
              type="text"
              value={formatSeconds(endTime)}
              onChange={(e) => handleEndChange(parseFormattedTime(e.target.value))}
              className="w-16 px-2 py-1 bg-bg-tertiary border border-white/10 rounded-lg text-center font-mono font-bold text-white text-xs focus:border-twitch focus:outline-none"
              aria-label="Tiempo de fin"
            />
          </div>
        </div>

        {/* Visual sliders */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted w-10">Inicio</span>
            <input
              type="range"
              min="0"
              max={maxDuration}
              step="1"
              value={startTime}
              onChange={(e) => handleStartChange(Number(e.target.value))}
              className="flex-1 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              aria-label="Deslizador de inicio"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted w-10">Fin</span>
            <input
              type="range"
              min="0"
              max={maxDuration}
              step="1"
              value={endTime}
              onChange={(e) => handleEndChange(Number(e.target.value))}
              className="flex-1 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-fuchsia-400"
              aria-label="Deslizador de fin"
            />
          </div>
        </div>
      </div>

      {/* Action / Feedback */}
      <div className="space-y-2">
        {status === 'snipping' && (
          <div className="p-3 bg-twitch/15 border border-twitch/30 rounded-xl flex items-center gap-2.5 text-xs text-twitch-light animate-pulse">
            <div className="w-4 h-4 border-2 border-twitch border-t-transparent rounded-full animate-spin shrink-0" />
            <span>Procesando y recortando fragmento con FFmpeg ultra-rápido...</span>
          </div>
        )}

        {status === 'success' && (
          <div className="p-3 bg-green-500/15 border border-green-500/30 rounded-xl flex items-center gap-2 text-xs text-green-300">
            <PhosphorIcon name="CheckCircle" size={18} weight="fill" className="shrink-0" />
            <div className="min-w-0">
              <p className="font-bold">¡Fragmento descargado con éxito!</p>
              <p className="text-[10px] text-green-200/70 truncate">{savedPath}</p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl flex items-center gap-2 text-xs text-red-300">
            <PhosphorIcon name="WarningCircle" size={18} weight="fill" className="shrink-0" />
            <span className="truncate">{errorMsg}</span>
          </div>
        )}

        <button
          type="button"
          disabled={status === 'snipping'}
          onClick={handleDownloadSnippet}
          className="w-full py-2.5 px-4 bg-gradient-to-r from-twitch to-fuchsia-600 hover:from-twitch-dark hover:to-fuchsia-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer hover:scale-[1.01] active:scale-95"
        >
          <PhosphorIcon name="DownloadSimple" size={16} weight="bold" />
          <span>{status === 'snipping' ? 'Recortando...' : 'Descargar Fragmento MP4'}</span>
        </button>
      </div>
    </div>
  )
}
