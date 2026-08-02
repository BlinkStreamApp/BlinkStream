import { useState, useEffect } from 'react'
import { useT } from '../../utils/i18n'
import { HSL_PRESETS, DEFAULT_HSL, applyStoredHslTheme, saveAndApplyHslTheme } from '../../utils/hslTheme'
import PhosphorIcon from '../icons/PhosphorIcon'

export default function HslThemeStudio() {
  const t = useT()
  const [current, setCurrent] = useState(() => applyStoredHslTheme())

  const handlePresetSelect = (preset) => {
    const next = { h: preset.h, s: preset.s, l: preset.l, id: preset.id }
    setCurrent(next)
    saveAndApplyHslTheme(next)
  }

  const handleSliderChange = (field, value) => {
    const next = { ...current, [field]: Number(value), id: 'custom' }
    setCurrent(next)
    saveAndApplyHslTheme(next)
  }

  return (
    <div className="space-y-6 text-text-primary animate-fade-in pb-2">
      {/* Cabecera del Estudio HSL */}
      <div className="flex items-start gap-3.5 bg-bg-tertiary/50 p-4 rounded-xl border border-white/[0.06] backdrop-blur-md">
        <div className="w-10 h-10 rounded-xl bg-twitch/20 border border-twitch/40 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(145,70,255,0.25)] text-twitch-light">
          <PhosphorIcon name="Palette" size={22} weight="duotone" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-bold text-text-primary tracking-tight">{t('hsl.title', 'Estudio de Temas HSL')}</h3>
          <p className="text-[12px] text-text-muted mt-0.5 leading-relaxed">{t('hsl.desc', 'Personaliza en caliente los tonos de neón, saturación y brillo de tu aplicación en tiempo real.')}</p>
        </div>
      </div>

      {/* Paletas Curadas Premium */}
      <div>
        <h4 className="text-[13px] font-semibold text-text-primary mb-3 flex items-center gap-2">
          <PhosphorIcon name="Sparkle" size={16} weight="duotone" className="text-amber-400" />
          {t('hsl.presets', 'Paletas Curadas de Alta Gama')}
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {HSL_PRESETS.map((preset) => {
            const isActive = current.id === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetSelect(preset)}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                  isActive
                    ? 'bg-white/[0.08] border-white/40 shadow-lg scale-[1.02] ring-1 ring-white/20'
                    : 'bg-bg-tertiary/30 border-white/[0.05] hover:bg-bg-tertiary hover:border-white/15'
                }`}
              >
                <div
                  className="w-5 h-5 rounded-full shrink-0 shadow-sm border border-white/20"
                  style={{ backgroundColor: `hsl(${preset.h}, ${preset.s}%, ${preset.l}%)`, boxShadow: isActive ? `0 0 12px hsl(${preset.h}, ${preset.s}%, ${preset.l}%)` : 'none' }}
                />
                <span className="text-[12px] font-medium truncate text-left flex-1 text-white/90">{preset.name}</span>
                {isActive && <span className="text-[10px] font-bold text-green-400 shrink-0">✓</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Controles HSL Manuales */}
      <div className="bg-bg-secondary/70 border border-white/[0.06] rounded-2xl p-5 space-y-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-semibold text-text-primary flex items-center gap-2">
            <PhosphorIcon name="Sliders" size={16} weight="duotone" className="text-twitch" />
            {t('hsl.custom', 'Ajuste HSL Manual en Tiempo Real')}
          </h4>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/40 text-twitch-light border border-white/10">
            hsl({current.h}, {current.s}%, {current.l}%)
          </span>
        </div>

        {/* Slider 1: Matiz / Hue */}
        <div className="space-y-2">
          <div className="flex justify-between text-[12px] text-text-secondary font-medium">
            <span>{t('hsl.hue', 'Matiz (Color)')}</span>
            <span className="font-mono text-white/80">{current.h} deg</span>
          </div>
          <input
            type="range"
            min="0"
            max="360"
            value={current.h}
            onChange={(e) => handleSliderChange('h', e.target.value)}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer border border-white/10"
            style={{
              background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
            }}
          />
        </div>

        {/* Slider 2: Saturación / Saturation */}
        <div className="space-y-2">
          <div className="flex justify-between text-[12px] text-text-secondary font-medium">
            <span>{t('hsl.saturation', 'Saturación')}</span>
            <span className="font-mono text-white/80">{current.s}%</span>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            value={current.s}
            onChange={(e) => handleSliderChange('s', e.target.value)}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer border border-white/10 accent-twitch"
            style={{
              background: `linear-gradient(to right, hsl(${current.h}, 10%, ${current.l}%), hsl(${current.h}, 100%, ${current.l}%))`
            }}
          />
        </div>

        {/* Slider 3: Luminosidad / Lightness */}
        <div className="space-y-2">
          <div className="flex justify-between text-[12px] text-text-secondary font-medium">
            <span>{t('hsl.lightness', 'Luminosidad')}</span>
            <span className="font-mono text-white/80">{current.l}%</span>
          </div>
          <input
            type="range"
            min="35"
            max="75"
            value={current.l}
            onChange={(e) => handleSliderChange('l', e.target.value)}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer border border-white/10 accent-twitch"
            style={{
              background: `linear-gradient(to right, hsl(${current.h}, ${current.s}%, 25%), hsl(${current.h}, ${current.s}%, 75%))`
            }}
          />
        </div>

        {/* Muestra en vivo */}
        <div className="pt-2">
          <div className="p-3 rounded-xl bg-gradient-to-r from-twitch/20 to-bg-tertiary border border-twitch/40 flex items-center justify-between shadow-[0_4px_25px_rgba(0,0,0,0.4)]">
            <span className="text-[12px] font-semibold text-text-primary flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-twitch animate-pulse shadow-[0_0_8px_var(--color-twitch)]" />
              {t('hsl.apply', 'Tema activo aplicado')}
            </span>
            <span className="px-3 py-1 rounded-lg bg-twitch text-white font-bold text-[11px] shadow-md shadow-twitch/30 tracking-wide">
              BlinkStream Premium
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
