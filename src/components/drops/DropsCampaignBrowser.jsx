import { useId, useMemo, useState } from 'react'
import { getLanguage, useT } from '../../utils/i18n'
import { filterDropCampaigns, getDropState } from '../../utils/drops'

const filters = ['all', 'available', 'progress', 'claimable', 'claimed']

export default function DropsCampaignBrowser({ campaigns, lastUpdatedAt, claimingIds, claimBlocked, claimDrop, openOfficialInventory }) {
  const t = useT()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [targetId, setTargetId] = useState(null)
  const filtered = useMemo(() => filterDropCampaigns(campaigns, query, filter), [campaigns, query, filter])
  const target = campaigns.find(campaign => campaign.id === targetId)
  const groups = new Map()
  const ordered = [...filtered].sort((a, b) => Number(b.id === targetId) - Number(a.id === targetId) || Number(b.isCurrentChannel) - Number(a.isCurrentChannel))
  for (const campaign of ordered) {
    const key = campaign.gameName || campaign.id
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(campaign)
  }
  const syncedAt = Number.isFinite(lastUpdatedAt) && lastUpdatedAt > 0 && !Number.isNaN(new Date(lastUpdatedAt).getTime())
    ? new Intl.DateTimeFormat(getLanguage(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(lastUpdatedAt) : null
  return <section className="space-y-4" aria-label={t('drops.center.title')}>
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <p className="text-xs text-text-muted">{t('drops.center.scope')}</p>
      {syncedAt && <p className="text-xs text-text-muted">{t('drops.center.updated').replace('{time}', syncedAt)}</p>}
      <label htmlFor={searchId} className="block text-xs font-semibold text-text-secondary">{t('drops.center.search')}</label>
      <input id={searchId} type="search" value={query} maxLength={200} onChange={event => setQuery(event.target.value)}
        className="w-full min-w-0 rounded-lg border border-white/10 bg-bg-secondary px-3 py-2 text-sm text-text-primary focus:outline-2 focus:outline-twitch" />
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('drops.center.filters')}>
        {filters.map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
          className={`rounded-lg px-3 py-1.5 text-xs border cursor-pointer ${filter === value ? 'bg-purple-500/20 text-purple-200 border-purple-500/40' : 'text-text-muted border-white/10 hover:bg-white/5'}`}>
          {t(`drops.filter.${value}`)}
        </button>)}
      </div>
      {target && <p className="text-xs text-purple-200">{t('drops.center.target').replace('{name}', target.name)}</p>}
    </div>
    {filtered.length === 0 && <p role="status" className="py-8 text-center text-sm text-text-muted">{t('drops.center.noMatches')}</p>}
    {[...groups.entries()].map(([game, items]) => <section key={game} className="space-y-3">
      <h4 className="text-sm font-bold text-text-primary">{items[0].gameName || t('drops.center.unknownGame')}</h4>
      {items.map(campaign => <article key={campaign.id} className={`rounded-2xl border p-4 space-y-3 ${campaign.id === targetId ? 'border-purple-500/50 bg-purple-500/5' : 'border-white/10 bg-bg-tertiary/40'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {campaign.boxArtUrl && <img src={campaign.boxArtUrl.replace('{width}', '60').replace('{height}', '80')} alt="" loading="lazy" className="w-8 h-10 rounded-lg object-cover shrink-0" />}
            <div className="min-w-0">
              <h5 className="text-sm font-bold text-white break-words">{campaign.name}</h5>
              {campaign.isCurrentChannel && <span className="text-[11px] font-semibold text-purple-300">{t('drops.center.currentChannel')}</span>}
            </div>
          </div>
          <button type="button" aria-pressed={campaign.id === targetId} onClick={() => setTargetId(campaign.id === targetId ? null : campaign.id)}
            className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-purple-200 hover:bg-white/5 cursor-pointer">
            {t(campaign.id === targetId ? 'drops.center.unpin' : 'drops.center.pin')}
          </button>
        </div>
        <div className="space-y-2">
          {campaign.drops.map(drop => {
            const state = getDropState(drop)
            const confirmed = drop.hasProgress !== false && Number.isFinite(drop.currentMinutes) && Number.isFinite(drop.requiredMinutes) && drop.requiredMinutes > 0
            const percent = confirmed ? Math.max(0, Math.min(100, drop.percent || 0)) : 0
            return <div key={drop.id} className="rounded-xl border border-white/5 bg-black/25 p-3 space-y-2">
              <div className="flex items-start gap-3">
                {drop.benefitImage && <img src={drop.benefitImage} alt="" loading="lazy" className="w-10 h-10 rounded-lg object-cover shrink-0" />}
                <div className="min-w-0 flex-1 space-y-1">
                  <h6 className="text-xs font-bold text-white break-words">{drop.benefitName}</h6>
                  <p className="text-[11px] text-text-muted">{confirmed
                    ? `${drop.currentMinutes} / ${drop.requiredMinutes} min (${percent}%)`
                    : drop.requiredMinutes > 0 ? t('drops.center.unconfirmed').replace('{minutes}', drop.requiredMinutes) : t('drops.center.unknownRequirement')}</p>
                  {confirmed && <div role="progressbar" aria-label={drop.benefitName} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
                    className="h-2 rounded-full bg-white/10 overflow-hidden"><div className={`h-full ${state === 'claimed' ? 'bg-emerald-500' : 'bg-purple-500'}`} style={{ width: `${percent}%` }} /></div>}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                {state === 'claimable' ? <button type="button" onClick={() => claimBlocked ? openOfficialInventory() : claimDrop(drop.dropInstanceId, drop.benefitName)}
                  disabled={claimingIds.size > 0} className="rounded-lg bg-purple-600 px-3 py-1.5 font-bold text-white hover:bg-purple-500 disabled:opacity-40 cursor-pointer">
                  {t(claimingIds.has(drop.dropInstanceId) ? 'drops.center.claiming' : claimBlocked ? 'drops.center.claimOfficial' : 'drops.center.claim')}
                </button> : <span className={state === 'claimed' ? 'text-emerald-400' : 'text-text-muted'}>{t(`drops.state.${state}`)}</span>}
                {state === 'progress' && <span className="text-text-muted">{t('drops.center.remaining').replace('{minutes}', Math.max(0, drop.requiredMinutes - drop.currentMinutes))}</span>}
              </div>
            </div>
          })}
        </div>
      </article>)}
    </section>)}
  </section>
}
