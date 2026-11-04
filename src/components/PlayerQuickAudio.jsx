import { useT } from '../utils/i18n'
import ToggleSwitch from './ToggleSwitch'

export default function PlayerQuickAudio({ volume, onVolumeChange, isNightMode, onToggleNightMode, onClose }) {
  const t = useT()
  const panelRef = useRef(null)
  useEffect(() => {
    const opener = document.activeElement
    panelRef.current?.querySelector('input')?.focus()
    return () => { if (opener?.isConnected) opener.focus() }
  }, [])
  return <section ref={panelRef} aria-label={t('audio.quick')} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }} className="absolute right-3 bottom-16 z-50 w-64 max-w-[calc(100%-1.5rem)] rounded-xl border border-white/15 bg-bg-secondary p-4 shadow-xl space-y-4">
    <div className="flex justify-between items-center"><h3 className="text-sm font-bold">{t('audio.quick')}</h3><button type="button" onClick={onClose} aria-label={t('close')} className="cursor-pointer">×</button></div>
    <label className="block text-xs space-y-2"><span>{t('audio.volume')} · {volume}%</span><input aria-label={t('audio.volume')} type="range" min="0" max="100" value={volume} onChange={event => onVolumeChange(Number(event.target.value))} className="w-full accent-purple-500" /></label>
    <div className="flex justify-between items-center gap-3 text-xs"><span>{t('player.nightMode')}</span><ToggleSwitch label={t('player.nightMode')} active={isNightMode} onClick={onToggleNightMode} /></div>
  </section>
}
import { useEffect, useRef } from 'react'
