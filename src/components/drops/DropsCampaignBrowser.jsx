import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { getLanguage, useT } from '../../utils/i18n'
import { filterDropCampaigns, getDropState, getDropsProgress } from '../../utils/drops'

const filters = ['all', 'available', 'progress', 'claimable', 'claimed']

export default function DropsCampaignBrowser({ campaigns, lastUpdatedAt, claimingIds = new Set(), claimBlocked, claimDrop, openOfficialInventory, readOnly = false, initialFilter = 'all', claimDisabled = false }) {
  const t = useT()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(initialFilter)
  const [targetId, setTargetId] = useState(null)
  const [selectedGame, setSelectedGame] = useState(null)
  const backRef = useRef(null)
  const gameRefs = useRef(new Map())
  useEffect(() => { if (selectedGame) backRef.current?.focus() }, [selectedGame])
  const filtered = useMemo(() => filterDropCampaigns(campaigns, query, filter), [campaigns, query, filter])
  const target = campaigns.find(campaign => campaign.id === targetId)
  const groups = new Map()
  const ordered = [...filtered].sort((a, b) => Number(b.id === targetId) - Number(a.id === targetId) || Number(b.isCurrentChannel) - Number(a.isCurrentChannel))
  for (const campaign of ordered) {
    const key = campaign.gameName || campaign.id
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(campaign)
  }
  const activeGame = groups.has(selectedGame) ? selectedGame : null
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
    {filter === 'available' && !activeGame ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7 gap-3">
      {[...groups.entries()].map(([game, items]) => {
        const progress = getDropsProgress(items)
        const cover = items[0].boxArtUrl || items[0].imageUrl
        return <button key={game} ref={element => { if (element) gameRefs.current.set(game, element); else gameRefs.current.delete(game) }} type="button" onClick={() => setSelectedGame(game)} className="flex flex-col justify-start min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-left hover:border-purple-400 focus-visible:outline-2 focus-visible:outline-purple-400 cursor-pointer">
          {cover ? <img src={cover.replace('{width}', '285').replace('{height}', '380')} alt="" loading="lazy" className="w-full aspect-[3/4] object-cover" /> : <div className="aspect-[3/4] bg-purple-500/10 flex items-center justify-center text-3xl" aria-hidden="true">🎁</div>}
          <div className="p-3 space-y-2">
            <h4 className="text-sm font-bold text-white break-words">{items[0].gameName || t('drops.center.unknownGame')}</h4>
            <p className="text-xs text-text-secondary">{t('drops.gallery.counts').replace('{campaigns}', items.length).replace('{drops}', items.reduce((total, campaign) => total + campaign.drops.length, 0))}</p>
            {progress && <div className="space-y-1 text-xs text-purple-200"><p className="truncate">{progress.drop.benefitName}</p><div className="h-1.5 rounded bg-white/10 overflow-hidden"><div className="h-full bg-purple-400" style={{ width: `${Math.max(0, Math.min(100, progress.drop.percent || 0))}%` }} /></div><span>{progress.drop.percent}% · {t('drops.center.remaining').replace('{minutes}', progress.remaining)}</span></div>}
          </div>
        </button>
      })}
    </div> : <>
    {filter === 'available' && activeGame && <button ref={backRef} type="button" onClick={() => { setSelectedGame(null); requestAnimationFrame(() => gameRefs.current.get(activeGame)?.focus()) }} className="text-sm text-purple-200 cursor-pointer">← {t('drops.gallery.back')}</button>}
    <div className="space-y-4">
    {[...groups.entries()].filter(([game]) => filter !== 'available' || !activeGame || game === activeGame).map(([game, items]) => <section key={game} className="space-y-3 min-w-0">
      <h4 className="text-sm font-bold text-text-primary">{items[0].gameName || t('drops.center.unknownGame')}</h4>
      {items.map(campaign => <article key={campaign.id} className={`rounded-2xl border p-4 space-y-3 ${campaign.id === targetId ? 'border-purple-500/50 bg-purple-500/5' : 'border-white/10 bg-bg-tertiary/40'}`}>
        {filter === 'available' && (campaign.imageUrl || campaign.boxArtUrl) && <img
          src={(campaign.imageUrl || campaign.boxArtUrl).replace('{width}', '480').replace('{height}', '640')}
          alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true }} className="w-full h-28 rounded-xl object-cover" />}
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
        {campaign.endAt && Number.isFinite(Date.parse(campaign.endAt)) && <p className="text-xs text-text-secondary">{t('drops.center.ends').replace('{date}', new Intl.DateTimeFormat(getLanguage(), { dateStyle: 'medium' }).format(new Date(campaign.endAt)))}</p>}
        {filter === 'available' && <p className="text-[11px] text-text-secondary">{t('drops.center.eligible')}</p>}
        <div className="space-y-2">
          {campaign.drops.length === 0 && <p className="text-xs text-text-secondary">{t('drops.center.noRewardDetails')}</p>}
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
                    : state === 'claimed' ? t('drops.state.claimed') : drop.requiredMinutes > 0 ? t('drops.center.unconfirmed').replace('{minutes}', drop.requiredMinutes) : t('drops.center.unknownRequirement')}</p>
                  {confirmed && <div role="progressbar" aria-label={drop.benefitName} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
                    className="h-2 rounded-full bg-white/10 overflow-hidden"><div className={`h-full ${state === 'claimed' ? 'bg-emerald-500' : 'bg-purple-500'}`} style={{ width: `${percent}%` }} /></div>}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                {state === 'claimable' && !readOnly ? <button type="button" onClick={() => claimBlocked ? openOfficialInventory() : claimDrop(drop.dropInstanceId, drop.benefitName)}
                  disabled={claimDisabled || claimingIds.size > 0} className="rounded-lg bg-purple-600 px-3 py-1.5 font-bold text-white hover:bg-purple-500 disabled:opacity-40 cursor-pointer">
                  {t(claimingIds.has(drop.dropInstanceId) ? 'drops.center.claiming' : claimBlocked ? 'drops.center.claimOfficial' : 'drops.center.claim')}
                </button> : <span className={state === 'claimed' ? 'text-emerald-400' : 'text-text-muted'}>{t(`drops.state.${state}`)}</span>}
                {state === 'progress' && <span className="text-text-muted">{t('drops.center.remaining').replace('{minutes}', Math.max(0, drop.requiredMinutes - drop.currentMinutes))}</span>}
              </div>
            </div>
          })}
        </div>
      </article>)}
    </section>)}
    </div>
    </>}
  </section>
}
