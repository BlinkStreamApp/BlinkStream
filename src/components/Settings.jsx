import { useState, useEffect } from 'react'
import { BlinkStreamLogo } from './BlinkStreamLogo'
import { getLanguage, setLanguage } from '../utils/i18n'
import ToggleSwitch from './ToggleSwitch'

function CloseIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg> }

export default function Settings({ onClose }) {
  const [prefQuality, setPrefQuality] = useState(() => localStorage.getItem('blinkstream_quality') || '1080p60')
  const [defaultVol, setDefaultVol] = useState(() => Number(localStorage.getItem('blinkstream_volume')) || 100)
  const [autoTheatre, setAutoTheatre] = useState(() => localStorage.getItem('blinkstream_auto_theatre') === 'true')
  const [chatOnRight, setChatOnRight] = useState(() => localStorage.getItem('blinkstream_chat_side') !== 'left')
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('blinkstream_compact') === 'true')
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('blinkstream_accent') || 'purple')
  const [lang, setLang] = useState(getLanguage)

  useEffect(() => {
    localStorage.setItem('blinkstream_quality', prefQuality)
  }, [prefQuality])

  useEffect(() => {
    localStorage.setItem('blinkstream_volume', String(defaultVol))
  }, [defaultVol])

  useEffect(() => {
    localStorage.setItem('blinkstream_auto_theatre', String(autoTheatre))
  }, [autoTheatre])

  useEffect(() => {
    localStorage.setItem('blinkstream_chat_side', chatOnRight ? 'right' : 'left')
  }, [chatOnRight])

  useEffect(() => {
    localStorage.setItem('blinkstream_compact', String(compactMode))
  }, [compactMode])

  useEffect(() => {
    localStorage.setItem('blinkstream_accent', accentColor)
    document.documentElement.setAttribute('data-accent', accentColor)
  }, [accentColor])

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accentColor)
  }, [])

  useEffect(() => {
    const handleKey = (e) => { if (e.code === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-bg-secondary/80 backdrop-blur-md border border-bg-tertiary/50 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-bg-tertiary/50">
          <div className="flex items-center gap-2">
            <BlinkStreamLogo size={20} />
            <h2 className="text-sm font-bold text-text-primary">Configuración</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer transition-colors">
            <CloseIcon />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Calidad de stream</label>
            <select value={prefQuality} onChange={e => setPrefQuality(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm border border-bg-tertiary focus:border-twitch focus:outline-none transition-colors">
              <option value="1080p60">1080p60</option>
              <option value="720p60">720p60</option>
              <option value="480p30">480p30</option>
              <option value="360p30">360p30</option>
              <option value="160p30">160p30</option>
              <option value="audio_only">Solo audio</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Volumen predeterminado: {defaultVol}%</label>
            <input type="range" min="0" max="100" value={defaultVol} onChange={e => setDefaultVol(Number(e.target.value))}
              className="w-full accent-twitch" />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-primary">Modo teatro automático</span>
            <ToggleSwitch active={autoTheatre} onClick={() => setAutoTheatre(p => !p)} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-primary">Chat a la derecha</span>
            <ToggleSwitch active={chatOnRight} onClick={() => setChatOnRight(p => !p)} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-primary">Modo compacto</span>
            <ToggleSwitch active={compactMode} onClick={() => setCompactMode(p => !p)} />
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">Color de acento</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { id: 'purple', color: '#9146ff', label: 'Púrpura' },
                { id: 'blue', color: '#3b82f6', label: 'Azul' },
                { id: 'green', color: '#22c55e', label: 'Verde' },
                { id: 'orange', color: '#f97316', label: 'Naranja' },
                { id: 'pink', color: '#ec4899', label: 'Rosa' },
                { id: 'red', color: '#ef4444', label: 'Rojo' },
              ].map(({ id, color, label }) => (
                <button key={id} onClick={() => setAccentColor(id)}
                  className="flex flex-col items-center gap-1 cursor-pointer"
                  title={label}>
                  <span className={`w-6 h-6 rounded-full transition-all ${accentColor === id ? 'ring-2 ring-white scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: color }} />
                  <span className={`text-[9px] ${accentColor === id ? 'text-text-primary' : 'text-text-muted'}`}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">Idioma</label>
            <div className="flex gap-2">
              {[
                { id: 'es', label: '🇪🇸 Español' },
                { id: 'en', label: '🇬🇧 English' },
              ].map(({ id, label }) => (
                <button key={id} onClick={() => { setLang(id); setLanguage(id) }}
                  className={`text-[12px] px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${lang === id ? 'bg-twitch/20 text-twitch' : 'bg-bg-tertiary text-text-muted hover:bg-hover'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-bg-tertiary/50 pt-4">
            <p className="text-[11px] text-text-muted/50 leading-relaxed">
              Los cambios se guardan automáticamente. Algunas opciones requieren reiniciar el stream.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
