/**
 * @file Settings (M-7 / Auditoria WT-20260628-01, refactor M-1 / WT-20260628-13).
 * Modal de configuracion con 5 tabs: General / Cuenta / Moderacion / Grabacion / Avanzado.
 *
 * @typedef {object} SettingsProps
 * @property {() => void} onClose
 */

import { useState, useEffect } from 'react'
import { BlinkStreamLogo } from './BlinkStreamLogo'
import { getLanguage, setLanguage, useT } from '../utils/i18n'
import { validateProps } from '../utils/validateProps'
import ToggleSwitch from './ToggleSwitch'
import { SettingsModerationTab } from './settings/SettingsModerationTab'
import { SettingsAccountTab } from './settings/SettingsAccountTab'
import { SettingsRecordingTab } from './settings/SettingsRecordingTab'
import { SettingsAdvancedTab } from './settings/SettingsAdvancedTab'
import PhosphorIcon from './icons/PhosphorIcon'

function CloseIcon() { return <PhosphorIcon name="X" size={18} weight="bold" /> }

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'account', label: 'Cuenta' },
  { id: 'moderation', label: 'Moderación' },
  { id: 'recording', label: 'Grabación' },
  { id: 'advanced', label: 'Avanzado' },
]
const LS_TAB_KEY = 'bs.settingsTab'

/**
 * Componente Tabs interno. Sticky en el top del modal.
 * @param {object} props
 * @param {Array<{id: string, label: string}>} props.tabs
 * @param {string} props.active
 * @param {(id: string) => void} props.onChange
 */
function Tabs({ tabs, active, onChange }) {
  return (
    <div className="sticky top-0 z-10 flex border-b border-bg-tertiary/50 bg-bg-secondary/80 backdrop-blur-md -mx-5 px-5">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`relative px-3 py-2.5 text-[12px] font-medium cursor-pointer transition-colors ${
            active === tab.id
              ? 'text-twitch'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          {tab.label}
          {active === tab.id && (
            <span className="absolute left-2 right-2 bottom-0 h-0.5 bg-twitch rounded-t" />
          )}
        </button>
      ))}
    </div>
  )
}

/**
 * Modal de configuracion. Mantiene todas las opciones de v1.0.4 dentro
 * del tab General, y deja placeholders para los nuevos tabs (Cuenta,
 * Moderacion, Grabacion, Avanzado). Persiste tab activa en localStorage.
 *
 * @param {SettingsProps} props
 */
export default function Settings({ onClose }) {
  // M-7: prop validation. Solo loggea.
  validateProps(
    { onClose },
    { onClose: { name: 'function', check: (v) => typeof v === 'function' } },
    'Settings props',
  )

  const t = useT()
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const stored = localStorage.getItem(LS_TAB_KEY)
      if (stored && TABS.find(t => t.id === stored)) return stored
    } catch { /* ignore */ }
    return 'general'
  })

  // Estado del tab General (opciones legacy preservadas exactamente igual)
  const [prefQuality, setPrefQuality] = useState(() => localStorage.getItem('blinkstream_quality') || '1080p60')
  const [defaultVol, setDefaultVol] = useState(() => Number(localStorage.getItem('blinkstream_volume')) || 100)
  const [autoTheatre, setAutoTheatre] = useState(() => localStorage.getItem('blinkstream_auto_theatre') === 'true')
  const [chatOnRight, setChatOnRight] = useState(() => localStorage.getItem('blinkstream_chat_side') !== 'left')
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('blinkstream_compact') === 'true')
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('blinkstream_accent') || 'purple')
  const [lang, setLang] = useState(getLanguage)

  // Persistencia de la tab activa
  useEffect(() => {
    try { localStorage.setItem(LS_TAB_KEY, activeTab) } catch { /* ignore */ }
  }, [activeTab])

  // Persistencias legacy (sin tocar)
  useEffect(() => { localStorage.setItem('blinkstream_quality', prefQuality) }, [prefQuality])
  useEffect(() => { localStorage.setItem('blinkstream_volume', String(defaultVol)) }, [defaultVol])
  useEffect(() => { localStorage.setItem('blinkstream_auto_theatre', String(autoTheatre)) }, [autoTheatre])
  useEffect(() => { localStorage.setItem('blinkstream_chat_side', chatOnRight ? 'right' : 'left') }, [chatOnRight])
  useEffect(() => { localStorage.setItem('blinkstream_compact', String(compactMode)) }, [compactMode])
  useEffect(() => {
    localStorage.setItem('blinkstream_accent', accentColor)
    document.documentElement.setAttribute('data-accent', accentColor)
  }, [accentColor])

  useEffect(() => {
    const handleKey = (e) => { if (e.code === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-bg-secondary/80 backdrop-blur-md border border-bg-tertiary/50 rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-bg-tertiary/50 shrink-0">
          <div className="flex items-center gap-2">
            <BlinkStreamLogo size={20} />
            <h2 className="text-sm font-bold text-text-primary">{t('settings')}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer transition-colors">
            <CloseIcon />
          </button>
        </div>

        <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === 'general' && (
            <div className="space-y-5">
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
          )}

          {activeTab === 'account' && <SettingsAccountTab />}

          {activeTab === 'moderation' && <SettingsModerationTab />}

          {activeTab === 'recording' && <SettingsRecordingTab />}

          {activeTab === 'advanced' && <SettingsAdvancedTab />}
        </div>
      </div>
    </div>
  )
}
