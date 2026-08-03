import { useState, useEffect } from 'react'
import { useT } from '../../utils/i18n'
import { HSL_PRESETS, FONT_PRESETS, ICON_STYLES, applyStoredHslTheme, saveAndApplyHslTheme, applyStoredCustomFont, saveAndApplyCustomFont, applyStoredCustomIconStyle, saveAndApplyCustomIconStyle } from '../../utils/hslTheme'
import PhosphorIcon from '../icons/PhosphorIcon'

export default function HslThemeStudio() {
  const t = useT()
  const [current, setCurrent] = useState(() => applyStoredHslTheme())
  const [currentFont, setCurrentFont] = useState(() => applyStoredCustomFont())
  const [currentIconStyle, setCurrentIconStyle] = useState(() => applyStoredCustomIconStyle())
  const [sampleLikes, setSampleLikes] = useState(128)

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

  const handleFontSelect = (fontId) => {
    setCurrentFont(fontId)
    saveAndApplyCustomFont(fontId)
  }

  const handleIconStyleSelect = (styleId) => {
    setCurrentIconStyle(styleId)
    saveAndApplyCustomIconStyle(styleId)
  }

  const activeFontObj = FONT_PRESETS.find(f => f.id === currentFont) || FONT_PRESETS[0]
  const activeIconObj = ICON_STYLES.find(s => s.id === currentIconStyle) || ICON_STYLES[0]

  return (
    <div className="space-y-7 text-text-primary animate-fade-in pb-4">
      {/* Cabecera del Estudio */}
      <div className="flex items-start gap-4 bg-[#14141d]/80 p-5 rounded-2xl border border-white/[0.08] backdrop-blur-xl shadow-lg relative overflow-hidden">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-twitch to-fuchsia-600 flex items-center justify-center shrink-0 shadow-[0_0_25px_rgba(145,70,255,0.4)] text-white">
          <PhosphorIcon name="Palette" size={26} weight="duotone" />
        </div>
        <div className="min-w-0 flex-1 z-10">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-extrabold text-white tracking-tight">{t('hsl.title', 'Estudio Completo de Personalización & Temas')}</h3>
            <span className="text-[10px] bg-twitch/30 border border-twitch px-2 py-0.5 rounded-full text-twitch-light font-bold uppercase tracking-wider">v2.2 Engine</span>
          </div>
          <p className="text-[12px] text-text-muted mt-1 leading-relaxed">
            {t('hsl.desc', 'Configura y esculpe la identidad visual de tu cliente en tiempo real. Todos los cambios de tipografía, iconografía y color de neón se aplican en vivo y se guardan al instante.')}
          </p>
        </div>
      </div>

      {/* SECCIÓN 1: Motor Tipográfico (Typography Engine) */}
      <div className="bg-[#12121a]/60 border border-white/[0.06] rounded-2xl p-5 space-y-4 backdrop-blur-md shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-bold text-text-primary flex items-center gap-2">
            <PhosphorIcon name="TextAa" size={18} weight="duotone" className="text-twitch-light" />
            {t('hsl.fonts', 'Motor Tipográfico de la Interfaz')}
          </h4>
          <span className="text-[11px] text-text-secondary font-medium">Activa: <strong className="text-white">{activeFontObj.name.split(' (')[0]}</strong></span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
          {FONT_PRESETS.map((font) => {
            const isSelected = currentFont === font.id
            return (
              <button
                key={font.id}
                type="button"
                onClick={() => handleFontSelect(font.id)}
                className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                  isSelected
                    ? 'bg-twitch/15 border-twitch shadow-[0_0_15px_rgba(145,70,255,0.2)] scale-[1.02]'
                    : 'bg-bg-tertiary/40 border-white/[0.05] hover:bg-bg-tertiary/70 hover:border-white/15'
                }`}
                style={{ fontFamily: font.family }}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="text-[13px] font-bold text-white/95">{font.name}</span>
                  {isSelected && (
                    <span className="w-5 h-5 rounded-full bg-twitch text-white text-[10px] flex items-center justify-center font-bold shadow-sm shrink-0">✓</span>
                  )}
                </div>
                <div className="text-[12px] text-text-secondary bg-black/30 px-2.5 py-2 rounded-lg border border-white/5">
                  {font.preview}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* SECCIÓN 2: Motor de Iconografía & Estilo de Línea */}
      <div className="bg-[#12121a]/60 border border-white/[0.06] rounded-2xl p-5 space-y-4 backdrop-blur-md shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-bold text-text-primary flex items-center gap-2">
            <PhosphorIcon name="MagicWand" size={18} weight="duotone" className="text-pink-400" fixedWeight />
            {t('hsl.iconStyles', 'Motor de Estilo e Iluminación de Iconos')}
          </h4>
          <span className="text-[11px] text-text-secondary font-medium">Activo: <strong className="text-white">{activeIconObj.name.split(' (')[0]}</strong></span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {ICON_STYLES.map((style) => {
            const isSelected = currentIconStyle === style.id
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => handleIconStyleSelect(style.id)}
                className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-200 flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'bg-twitch/15 border-twitch shadow-[0_0_15px_rgba(145,70,255,0.25)] scale-[1.02]'
                    : 'bg-bg-tertiary/40 border-white/[0.05] hover:bg-bg-tertiary/70 hover:border-white/15'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[13px] font-bold text-white/95">{style.name.split(' (')[0]}</span>
                  {isSelected && (
                    <span className="w-4 h-4 rounded-full bg-twitch text-white text-[9px] flex items-center justify-center font-extrabold shadow-sm shrink-0">✓</span>
                  )}
                </div>
                <div className="flex items-center justify-around bg-black/40 py-2 px-3 rounded-lg border border-white/5 text-twitch">
                  <PhosphorIcon name="Sparkle" size={20} weight={style.weight} fixedWeight />
                  <PhosphorIcon name="Play" size={20} weight={style.weight} fixedWeight />
                  <PhosphorIcon name="ChatCircleDots" size={20} weight={style.weight} fixedWeight />
                  <PhosphorIcon name="Gear" size={20} weight={style.weight} fixedWeight />
                </div>
                <p className="text-[11px] text-text-muted leading-tight">{style.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* SECCIÓN 3: 12 Paletas Curadas Premium */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[13px] font-bold text-text-primary flex items-center gap-2">
            <PhosphorIcon name="Sparkle" size={18} weight="duotone" className="text-amber-400" />
            {t('hsl.presets', 'Catálogo de 12 Paletas Neón de Alta Gama')}
          </h4>
          <span className="text-[11px] font-mono text-text-muted">Selector Rápido</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {HSL_PRESETS.map((preset) => {
            const isActive = current.id === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetSelect(preset)}
                className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                  isActive
                    ? 'bg-white/[0.1] border-white/50 shadow-md scale-[1.03] ring-1 ring-white/30 font-bold'
                    : 'bg-[#14141e]/70 border-white/[0.05] hover:bg-bg-tertiary hover:border-white/20 hover:scale-[1.01]'
                }`}
              >
                <div
                  className="w-5 h-5 rounded-full shrink-0 shadow-sm border border-white/30 transition-transform duration-300"
                  style={{ backgroundColor: preset.color, boxShadow: isActive ? `0 0 14px ${preset.color}` : 'none' }}
                />
                <span className="text-[13px] text-left flex-1 text-white/90 whitespace-nowrap overflow-hidden text-ellipsis">{preset.name}</span>
                {isActive && <span className="text-[11px] font-extrabold text-green-400 shrink-0">✓</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* SECCIÓN 3: Laboratorio HSL Manual & Live Sample Box */}
      <div className="bg-[#101018]/90 border border-white/[0.08] rounded-2xl p-5 space-y-6 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <h4 className="text-[13px] font-bold text-text-primary flex items-center gap-2">
            <PhosphorIcon name="Sliders" size={18} weight="duotone" className="text-twitch" />
            {t('hsl.custom', 'Laboratorio HSL Manual (Ajuste Tonal y Luz)')}
          </h4>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-twitch animate-pulse shadow-[0_0_10px_var(--color-twitch)]" />
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-black/60 text-twitch-light border border-white/10 shadow-inner">
              hsl({current.h}, {current.s}%, {current.l}%)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Sliders manuales */}
          <div className="space-y-4">
            {/* Slider 1: Matiz / Hue */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[12px] text-text-secondary font-semibold">
                <span>{t('hsl.hue', 'Matiz (Color Neón)')}</span>
                <span className="font-mono text-white/90">{current.h}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                value={current.h}
                onChange={(e) => handleSliderChange('h', e.target.value)}
                className="w-full h-2.5 rounded-lg appearance-none cursor-pointer border border-white/15"
                style={{
                  background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
                }}
              />
            </div>

            {/* Slider 2: Saturación / Saturation */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[12px] text-text-secondary font-semibold">
                <span>{t('hsl.saturation', 'Intensidad / Saturación')}</span>
                <span className="font-mono text-white/90">{current.s}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={current.s}
                onChange={(e) => handleSliderChange('s', e.target.value)}
                className="w-full h-2.5 rounded-lg appearance-none cursor-pointer border border-white/15 accent-twitch"
                style={{
                  background: `linear-gradient(to right, hsl(${current.h}, 10%, ${current.l}%), hsl(${current.h}, 100%, ${current.l}%))`
                }}
              />
            </div>

            {/* Slider 3: Luminosidad / Lightness */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[12px] text-text-secondary font-semibold">
                <span>{t('hsl.lightness', 'Luminosidad / Brillo Neón')}</span>
                <span className="font-mono text-white/90">{current.l}%</span>
              </div>
              <input
                type="range"
                min="35"
                max="75"
                value={current.l}
                onChange={(e) => handleSliderChange('l', e.target.value)}
                className="w-full h-2.5 rounded-lg appearance-none cursor-pointer border border-white/15 accent-twitch"
                style={{
                  background: `linear-gradient(to right, hsl(${current.h}, ${current.s}%, 25%), hsl(${current.h}, ${current.s}%, 75%))`
                }}
              />
            </div>
          </div>

          {/* Caja de Muestra Interactiva (Live Preview Box) */}
          <div className="bg-[#0a0a0e] border border-white/10 rounded-2xl p-4 shadow-xl space-y-3 relative overflow-hidden">
            <div className="text-[11px] font-bold uppercase tracking-widest text-text-muted flex items-center justify-between">
              <span>Muestra en Vivo de Interfaz</span>
              <span className="text-[10px] text-twitch-light lowercase font-mono">({activeFontObj.id})</span>
            </div>
            
            {/* Simulación de Mensaje del Chat */}
            <div className="p-3 rounded-xl bg-[#13131c] border border-white/[0.06] flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full bg-twitch text-white font-extrabold flex items-center justify-center text-xs shrink-0 shadow-sm shadow-twitch/40">
                B
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-twitch font-bold text-white shadow-xs uppercase">VIP</span>
                  <span className="font-bold text-twitch hover:underline cursor-pointer">BlinkStreamer_Pro</span>
                  <span className="text-[10px] text-text-muted ml-auto">Ahora</span>
                </div>
                <p className="text-sm text-white/90 mt-1 leading-snug">
                  Un cliente impresionante: el nuevo tema y tipografía le dan una estética OLED excelente al stream. 🚀💎
                </p>
              </div>
            </div>

            {/* Controles de demostración interactiva */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setSampleLikes(p => p + 1)}
                className="px-3 py-1.5 rounded-xl bg-twitch hover:bg-twitch-dark text-white text-[12px] font-extrabold shadow-md shadow-twitch/30 flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
              >
                <span>🚀 Me encanta!</span>
                <span className="bg-black/30 px-1.5 py-0.5 rounded-lg text-[10px] font-mono">{sampleLikes}</span>
              </button>
              <span className="text-[11px] text-green-400 font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-ping inline-block mr-1" />
                Sincronizado al instante
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
