import { useId } from 'react'
import PhosphorIcon from '../icons/PhosphorIcon'
import { useT } from '../../utils/i18n'

export default function ChatSearchPanel({ search, channels, count, onChange, onClose }) {
  const t = useT()
  const hintId = useId()
  const inputClass = 'min-h-9 w-full min-w-0 rounded-lg border border-white/10 bg-bg-primary px-2.5 py-2 text-xs text-text-primary placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-twitch'
  const active = Boolean(search.text || search.user || search.channel || search.linksOnly)
  // Keep results and the composer reachable when the app window is short.
  return <section aria-label={t('chat.search.title', 'Buscar en el chat')} style={{ maxHeight: 'max(5rem, calc(100% - 20rem))' }} className="min-h-0 shrink-0 space-y-2.5 overflow-y-auto border-b border-twitch/20 bg-twitch/5 px-3 py-3" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); onClose() }
  }}>
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-text-primary"><PhosphorIcon name="MagnifyingGlass" size={15} className="shrink-0 text-twitch-light" />{t('chat.search.title', 'Buscar en el chat')}</span>
      <button type="button" onClick={onClose} aria-label={t('chat.search.close', 'Cerrar búsqueda')} className="shrink-0 rounded-lg p-1.5 text-text-secondary hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-twitch"><PhosphorIcon name="X" size={15} /></button>
    </div>
    <label className="block space-y-1 text-[11px] font-medium text-text-secondary">
      <span>{t('chat.search.text', 'Texto del mensaje')}</span>
      <input type="search" value={search.text} maxLength={200} autoFocus aria-describedby={hintId} onChange={event => onChange({ text: event.target.value })} placeholder={t('chat.search.placeholder', 'Buscar palabras o enlaces…')} className={inputClass} />
    </label>
    <div className={`grid min-w-0 gap-2 ${channels.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      <label className="block min-w-0 space-y-1 text-[11px] font-medium text-text-secondary">
        <span>{t('chat.search.user', 'Usuario')}</span>
        <input type="search" value={search.user} maxLength={40} onChange={event => onChange({ user: event.target.value })} placeholder={t('chat.search.userPlaceholder', '@usuario')} className={inputClass} />
      </label>
      {channels.length > 1 && <label className="block min-w-0 space-y-1 text-[11px] font-medium text-text-secondary">
        <span>{t('chat.search.channel', 'Canal de origen')}</span>
        <select value={search.channel} onChange={event => onChange({ channel: event.target.value })} className={inputClass}>
          <option value="">{t('chat.search.allChannels', 'Todos los canales')}</option>
          {channels.map(channel => <option key={channel} value={channel}>{channel}</option>)}
        </select>
      </label>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
      <label className="flex cursor-pointer items-center gap-2 font-medium text-text-secondary"><input type="checkbox" checked={search.linksOnly} onChange={event => onChange({ linksOnly: event.target.checked })} className="h-3.5 w-3.5 accent-twitch" />{t('chat.search.linksOnly', 'Solo con enlaces')}</label>
      {active && <button type="button" onClick={() => onChange({ text: '', user: '', channel: '', linksOnly: false })} className="rounded-md px-2 py-1 font-semibold text-twitch-light hover:bg-twitch/15 focus-visible:outline-2 focus-visible:outline-twitch">{t('chat.search.clear', 'Limpiar filtros')}</button>}
    </div>
    <div className="flex flex-wrap items-start justify-between gap-2 border-t border-white/5 pt-2">
      <p id={hintId} className="min-w-0 flex-1 text-[11px] leading-relaxed text-text-secondary">{t('chat.search.scope', 'Solo mensajes conservados de esta sesión. Se aplican las pestañas y filtros del chat.')}</p>
      <span className="shrink-0 rounded-md bg-twitch/15 px-2 py-1 text-[11px] font-semibold tabular-nums text-twitch-light" role="status">{t('chat.search.results', 'Resultados')}: {count}</span>
    </div>
  </section>
}
