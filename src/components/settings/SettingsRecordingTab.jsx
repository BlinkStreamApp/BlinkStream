/**
 * @file Tab "Grabación" del modal de Settings (G1 / Release Final).
 * Dashboard interactivo para configurar ruta de almacenamiento, formato contenedor (MP4/TS),
 * calidad nativa y grabación automática al iniciar stream.
 */
import { useState, useEffect } from 'react'
import ToggleSwitch from '../ToggleSwitch'
import PhosphorIcon from '../icons/PhosphorIcon'

const LS_REC_PATH = 'blinkstream_rec_path'
const LS_REC_FORMAT = 'blinkstream_rec_format'
const LS_REC_QUALITY = 'blinkstream_rec_quality'
const LS_REC_AUTOSTART = 'blinkstream_rec_autostart'

export function SettingsRecordingTab() {
  const [recPath, setRecPath] = useState(() => {
    try { return localStorage.getItem(LS_REC_PATH) || '' } catch { return '' }
  })
  const [recFormat, setRecFormat] = useState(() => {
    try { return localStorage.getItem(LS_REC_FORMAT) || 'mp4' } catch { return 'mp4' }
  })
  const [recQuality, setRecQuality] = useState(() => {
    try { return localStorage.getItem(LS_REC_QUALITY) || 'source' } catch { return 'source' }
  })
  const [recAutoStart, setRecAutoStart] = useState(() => {
    try { return localStorage.getItem(LS_REC_AUTOSTART) === 'true' } catch { return false }
  })
  const [statusMsg, setStatusMsg] = useState('')

  useEffect(() => {
    try { localStorage.setItem(LS_REC_PATH, recPath) } catch {}
  }, [recPath])

  useEffect(() => {
    try { localStorage.setItem(LS_REC_FORMAT, recFormat) } catch {}
  }, [recFormat])

  useEffect(() => {
    try { localStorage.setItem(LS_REC_QUALITY, recQuality) } catch {}
  }, [recQuality])

  useEffect(() => {
    try { localStorage.setItem(LS_REC_AUTOSTART, recAutoStart ? 'true' : 'false') } catch {}
  }, [recAutoStart])

  const handleSelectFolder = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Seleccionar carpeta de grabaciones para BlinkStream'
      })
      if (selected) {
        setRecPath(selected)
        setStatusMsg('✅ Ruta actualizada correctamente')
        setTimeout(() => setStatusMsg(''), 3000)
      }
    } catch (err) {
      console.warn('[Settings] Modo navegador o error en diálogo de Tauri:', err)
      setStatusMsg('ℹ️ En el navegador la ruta depende de la carpeta Descargas del sistema')
      setTimeout(() => setStatusMsg(''), 4000)
    }
  }

  const getEstimatedBitrate = (quality) => {
    switch (quality) {
      case 'source': return '1080p60 (~3.6 GB/hora)'
      case '720p60': return '720p60 (~1.8 GB/hora)'
      case '480p': return '480p30 (~700 MB/hora)'
      default: return 'Nativo / Variable'
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-medium text-text-secondary mb-1 block">Ruta de almacenamiento</label>
        <p className="text-[11px] text-text-muted/70 leading-relaxed mb-3">
          Selecciona el directorio donde se guardarán los archivos de vídeo y las capturas instantáneas HD.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={recPath}
            onChange={(e) => setRecPath(e.target.value)}
            placeholder="Predeterminado (Descargas / Vídeos del sistema)"
            className="flex-1 bg-bg-tertiary/60 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:border-twitch/60 transition-all font-mono"
          />
          <button
            onClick={handleSelectFolder}
            className="px-3.5 py-2 rounded-xl bg-twitch hover:bg-twitch-dark text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 shadow-lg"
            title="Explorar carpetas"
          >
            <PhosphorIcon name="FolderOpen" size={16} weight="bold" />
            <span>Explorar...</span>
          </button>
        </div>
        {statusMsg && (
          <p className="text-[11px] text-twitch mt-1.5 font-medium animate-fade-in">{statusMsg}</p>
        )}
      </div>

      <div className="border-t border-bg-tertiary/50 pt-4">
        <label className="text-xs font-medium text-text-secondary mb-2 block">Formato contenedor del vídeo</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setRecFormat('mp4')}
            className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
              recFormat === 'mp4'
                ? 'bg-twitch/15 border-twitch text-white shadow-md shadow-twitch/10'
                : 'bg-bg-tertiary/30 border-white/5 text-text-secondary hover:border-white/15'
            }`}
          >
            <div className="flex items-center justify-between font-bold text-xs mb-1">
              <span>MP4 (MPEG-4)</span>
              {recFormat === 'mp4' && <span className="text-[10px] bg-twitch px-1.5 py-0.5 rounded text-white font-normal">Recomendado</span>}
            </div>
            <p className="text-[10px] text-text-muted leading-tight">
              Ideal para editar en Premiere o DaVinci y compartir inmediatamente en redes sociales.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setRecFormat('ts')}
            className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
              recFormat === 'ts'
                ? 'bg-twitch/15 border-twitch text-white shadow-md shadow-twitch/10'
                : 'bg-bg-tertiary/30 border-white/5 text-text-secondary hover:border-white/15'
            }`}
          >
            <div className="flex items-center justify-between font-bold text-xs mb-1">
              <span>TS (Transport Stream)</span>
              {recFormat === 'ts' && <span className="text-[10px] bg-emerald-500 px-1.5 py-0.5 rounded text-white font-normal">Blindado</span>}
            </div>
            <p className="text-[10px] text-text-muted leading-tight">
              Resistente a cortes de luz o fallos de red; si el stream cae, el archivo grabado nunca se corrompe.
            </p>
          </button>
        </div>
      </div>

      <div className="border-t border-bg-tertiary/50 pt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-text-secondary block">Calidad máxima de captura</label>
          <span className="text-[11px] font-mono text-twitch bg-twitch/10 px-2 py-0.5 rounded-md">
            Consumo estimado: {getEstimatedBitrate(recQuality)}
          </span>
        </div>
        <select
          value={recQuality}
          onChange={(e) => setRecQuality(e.target.value)}
          className="w-full bg-bg-tertiary/80 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-text-primary focus:outline-none focus:border-twitch transition-all cursor-pointer"
        >
          <option value="source">1080p60 / Source (Calidad original sin re-compresión)</option>
          <option value="720p60">720p60 High (Balance óptimo entre peso y fluidez)</option>
          <option value="480p">480p Económico (Ahorro máximo de espacio en disco)</option>
        </select>
      </div>

      <div className="border-t border-bg-tertiary/50 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm text-text-primary font-medium block">Grabación Automática en Vivo (Auto-REC)</span>
            <span className="text-[11px] text-text-muted/70 block mt-0.5">
              Si está activado, al abrir un stream en directo se iniciará la grabación en segundo plano de forma automática.
            </span>
          </div>
          <ToggleSwitch active={recAutoStart} onClick={() => setRecAutoStart(p => !p)} />
        </div>
      </div>

      <div className="p-3 rounded-xl bg-gradient-to-r from-purple-500/10 via-fuchsia-500/10 to-twitch/10 border border-purple-500/20 text-center text-[11px] text-text-secondary flex items-center justify-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse-dot" />
        <span>El motor de grabación opera en un proceso aislado en Rust sin impactar los FPS de tus videojuegos.</span>
      </div>
    </div>
  )
}
