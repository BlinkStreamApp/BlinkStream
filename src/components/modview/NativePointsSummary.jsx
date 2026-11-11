import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../utils/i18n'
import { useConnectedChannelPoints } from '../../hooks/useConnectedChannelPoints'
import DropsModal from '../drops/DropsModal'
import PhosphorIcon from '../icons/PhosphorIcon'

export function NativePointsSummary({ account, channel, messages = [], onOpenOfficial, refreshKey = 0, showObserved = true }) {
  const t = useT()
  const points = useConnectedChannelPoints(account, channel)
  const refresh = points.refresh
  const [connectOpen, setConnectOpen] = useState(false)
  useEffect(() => { if (refreshKey > 0) void refresh() }, [refreshKey, refresh])
  const seen = new Set()
  const observed = messages.filter(message => {
    if (!(message.isReward || message.custom_reward_id || message.eventType === 'reward') || !message.id || seen.has(message.id)) return false
    seen.add(message.id)
    return true
  }).slice(-20).reverse()
  return <section className="shrink-0 border-b border-white/10 bg-white/[0.02] p-3 space-y-2" aria-label={t('mod.points.summary')}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-text-muted">{t('mod.points.balance')}</span>
      <strong className="text-sm tabular-nums">{points.balance === null ? '—' : points.balance.toLocaleString()} {points.pointsName || ''}</strong>
      <button type="button" disabled={!points.connected || points.loading} onClick={points.refresh} aria-label={t('mod.points.refresh')}
        className="rounded p-2 hover:bg-white/10 cursor-pointer disabled:opacity-40"><PhosphorIcon name="ArrowsClockwise" size={16} /></button>
    </div>
    {!points.connected && <><p className="text-xs text-text-muted">{t('mod.points.connectHint')}</p>
      <button type="button" onClick={() => setConnectOpen(true)} className="rounded-lg bg-twitch/20 px-3 py-2 text-xs text-white cursor-pointer">{t('drops.session.connect')}</button></>}
    {points.error && <p role="alert" className="text-xs text-amber-300">{t('mod.points.readError')}</p>}
    {onOpenOfficial && <button type="button" onClick={onOpenOfficial} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white hover:bg-white/5 cursor-pointer">{t('mod.official.title')}</button>}
    {showObserved && <details><summary className="text-xs text-text-muted cursor-pointer">{t('mod.points.observed')} ({observed.length})</summary>
      <p className="my-2 text-xs text-text-muted">{t('mod.points.observedHint')}</p>
      <ul className="max-h-36 overflow-y-auto space-y-2 text-xs">{observed.map(item => <li key={item.id} className="rounded bg-white/5 p-2 break-words">
        <strong>{item.user || item.user_name || ''}</strong> {item.eventHeader || item.reward_title || item.message || item.text || ''}
      </li>)}</ul>
    </details>}
    {connectOpen && createPortal(<DropsModal account={account} onClose={() => setConnectOpen(false)} />, document.body)}
  </section>
}
