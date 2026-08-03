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
import HslThemeStudio from './settings/HslThemeStudio'
import PhosphorIcon from './icons/PhosphorIcon'

function CloseIcon() { return <PhosphorIcon name="X" size={18} weight="bold" /> }

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'hsl', label: 'Personalización' },
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
    <div className="flex border-b border-white/[0.08] bg-[#14141d]/70 backdrop-blur-md px-6 shrink-0 overflow-x-auto no-scrollbar gap-2">
      {tabs.map(tab => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative px-4 py-3 text-[13px] font-semibold cursor-pointer transition-all duration-200 flex items-center gap-2 whitespace-nowrap rounded-t-xl ${
              isActive
                ? 'text-white font-extrabold bg-white/[0.04]'
                : 'text-text-muted hover:text-white/80 hover:bg-white/[0.02]'
            }`}
          >
            {tab.icon && (
              <PhosphorIcon
                name={tab.icon}
                size={16}
                className={`transition-transform duration-200 ${isActive ? 'text-twitch scale-110 drop-shadow-[0_0_8px_var(--color-twitch)]' : 'opacity-70'}`}
              />
            )}
            <span>{tab.label}</span>
            {isActive && (
              <span className="absolute left-3 right-3 bottom-0 h-0.5 bg-twitch shadow-[0_0_10px_var(--color-twitch)] rounded-full" />
            )}
          </button>
        )
      })}
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
  const currentTabs = [
    { id: 'general', label: t('tab.general', 'General'), icon: 'Gear' },
    { id: 'hsl', label: t('hsl.tab', 'Personalización & Temas'), icon: 'Palette' },
    { id: 'account', label: t('tab.account', 'Cuenta'), icon: 'UserCircle' },
    { id: 'moderation', label: t('tab.moderation', 'Moderación'), icon: 'ShieldCheck' },
    { id: 'recording', label: t('tab.recording', 'Grabación'), icon: 'VideoCamera' },
    { id: 'advanced', label: t('tab.advanced', 'Avanzado'), icon: 'Sliders' },
  ]
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
    const handleKey = (e) => { if (e.code === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/65 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div className="bg-[#12121a]/95 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.85)] w-full max-w-[880px] max-h-[88vh] flex flex-col overflow-hidden shrink-0" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-2">
            <BlinkStreamLogo size={20} />
            <h2 className="text-sm font-bold text-text-primary">{t('settings')}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer transition-colors">
            <CloseIcon />
          </button>
        </div>

        <Tabs tabs={currentTabs} active={activeTab} onChange={setActiveTab} />

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === 'general' && (
            <div className="space-y-5">
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">{t('set.streamQuality', 'Calidad de stream')}</label>
                <select value={prefQuality} onChange={e => setPrefQuality(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm border border-bg-tertiary focus:border-twitch focus:outline-none transition-colors">
                  <option value="1080p60">1080p60</option>
                  <option value="720p60">720p60</option>
                  <option value="480p30">480p30</option>
                  <option value="360p30">360p30</option>
                  <option value="160p30">160p30</option>
                  <option value="audio_only">{t('set.audioOnly', 'Solo audio')}</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-primary">{t('set.defaultVolume', 'Volumen por defecto')}</span>
                <span className="text-xs text-text-secondary font-mono">{defaultVol}%</span>
              </div>
              <input type="range" min="0" max="100" value={defaultVol} onChange={e => setDefaultVol(Number(e.target.value))}
                className="w-full h-1.5 rounded-lg appearance-none bg-bg-tertiary cursor-pointer accent-twitch" />

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-primary">{t('set.autoTheatre', 'Modo teatro automático')}</span>
                <ToggleSwitch active={autoTheatre} onClick={() => setAutoTheatre(p => !p)} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-primary">{t('set.chatRight', 'Chat a la derecha')}</span>
                <ToggleSwitch active={chatOnRight} onClick={() => setChatOnRight(p => !p)} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-primary">{t('set.compactMode', 'Modo compacto')}</span>
                <ToggleSwitch active={compactMode} onClick={() => setCompactMode(p => !p)} />
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#181824] via-[#101018] to-[#161622] border border-white/[0.08] shadow-lg relative overflow-hidden">
                <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-twitch/20 rounded-full blur-2xl pointer-events-none" />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>✨ {t('set.appearanceTitle', 'Personalización y Apariencia Avanzada')}</span>
                    </h4>
                    <p className="text-[12px] text-text-muted mt-1 leading-relaxed">
                      {t('set.appearanceDesc', 'Explora las 12 paletas HSL de alta gama, motores de tipografía y personalización de color en tiempo real sin reiniciar la aplicación.')}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('hsl')}
                    className="shrink-0 py-2.5 px-4 rounded-xl bg-gradient-to-r from-twitch to-fuchsia-600 hover:from-twitch-dark hover:to-fuchsia-700 text-white text-[12px] font-bold shadow-md shadow-twitch/30 flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.03] cursor-pointer"
                  >
                    <span>🎨 Abrir Estudio</span>
                    <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded uppercase tracking-wider font-extrabold text-white/90">v2.2</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-text-secondary mb-2 block">{t('set.language', 'Idioma')}</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'es', label: '🇪🇸 Español' },
                    { id: 'en', label: '🇬🇧 English' },
                    { id: 'fr', label: '🇫🇷 Français' },
                    { id: 'de', label: '🇩🇪 Deutsch' },
                    { id: 'pt', label: '🇵🇹 Português' },
                    { id: 'ja', label: '🇯🇵 日本語' },
                    { id: 'ko', label: '🇰🇷 한국어' },
                    { id: 'ru', label: '🇷🇺 Русский' },
                  ].map(({ id, label }) => (
                    <button key={id} onClick={() => { setLang(id); setLanguage(id) }}
                      className={`text-[12px] px-3 py-2 rounded-xl border text-center font-medium cursor-pointer transition-all ${
                        lang === id
                          ? 'bg-twitch/20 text-white border-twitch shadow-sm shadow-twitch/10 font-bold'
                          : 'bg-bg-tertiary/60 text-text-muted border-white/5 hover:bg-hover hover:border-white/10 hover:text-text-primary'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-bg-tertiary/50 pt-4">
                <p className="text-[11px] text-text-muted/50 leading-relaxed">
                  {t('set.footer', 'Los cambios se guardan automáticamente. Algunas opciones requieren reiniciar el stream.')}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'hsl' && <HslThemeStudio />}

          {activeTab === 'account' && <SettingsAccountTab />}

          {activeTab === 'moderation' && <SettingsModerationTab />}

          {activeTab === 'recording' && <SettingsRecordingTab />}

          {activeTab === 'advanced' && <SettingsAdvancedTab />}
        </div>
      </div>
    </div>
  )
}
