

import { useState, useMemo } from 'react'
import { t } from '../../utils/i18n'

function fmtDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

const PAGE_SIZE = 50

export default function PendingRedemptions({
  redemptions,
  loading,
  error,
  onFulfill,
  onCancel,
  onBulkFulfill,
  onBulkCancel,
  onRefresh,
}) {
  const [selected, setSelected] = useState(new Set())
  const [rewardFilter, setRewardFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('')

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const rewardOptions = useMemo(() => {
    const set = new Map()
    redemptions.forEach(rd => {
      const id = rd.reward_id
      const title = rd.reward_title || rd.reward?.title || id
      if (id && !set.has(id)) set.set(id, title)
    })
    return [...set.entries()]
  }, [redemptions])

  const filtered = useMemo(() => {
    return redemptions.filter(rd => {
      if (rewardFilter !== 'all' && rd.reward_id !== rewardFilter) return false
      if (userFilter && !(rd.user_name || rd.user_login || '').toLowerCase().includes(userFilter.toLowerCase())) return false
      return true
    })
  }, [redemptions, rewardFilter, userFilter])

  const safeVisibleCount = Math.min(visibleCount, filtered.length)

  const visible = useMemo(
    () => filtered.slice(0, Math.max(safeVisibleCount, 0)),
    [filtered, safeVisibleCount]
  )
  const hasMore = filtered.length > safeVisibleCount

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(rd => rd.id)))
    }
  }

  const handleBulkFulfill = () => {
    if (selected.size === 0) return
    onBulkFulfill([...selected])
    setSelected(new Set())
  }
  const handleBulkCancel = () => {
    if (selected.size === 0) return
    onBulkCancel([...selected])
    setSelected(new Set())
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-twitch border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-6 text-[12px] text-red-400">
        {error}
        <button onClick={onRefresh} className="block mx-auto mt-2 text-twitch hover:underline">
          {t('retry') || 'Reintentar'}
        </button>
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-[12px]">
        {t('cp.pending.empty')}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={rewardFilter}
          onChange={(e) => setRewardFilter(e.target.value)}
          className="text-[11px] px-2 py-1 rounded-md bg-bg-tertiary text-text-primary border border-bg-tertiary focus:border-twitch focus:outline-none"
        >
          <option value="all">{t('cp.manage.filter.all')}</option>
          {rewardOptions.map(([id, title]) => (
            <option key={id} value={id}>{title}</option>
          ))}
        </select>
        <input
          type="text"
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          placeholder={t('cp.pending.filter.user')}
          className="text-[11px] px-2 py-1 rounded-md bg-bg-tertiary text-text-primary border border-bg-tertiary focus:border-twitch focus:outline-none flex-1 min-w-[100px]"
        />
        <button
          onClick={onRefresh}
          className="text-[11px] px-2 py-1 rounded-md text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer"
          title="Refrescar"
        >
          ↻
        </button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-twitch/10 border border-twitch/30">
          <span className="text-[11px] text-text-secondary flex-1">{selected.size} seleccionados</span>
          <button
            onClick={handleBulkFulfill}
            className="text-[11px] px-2.5 py-1 rounded-md bg-green-500/20 text-green-400 hover:bg-green-500/30 cursor-pointer"
          >
            {t('cp.pending.bulkApprove')}
          </button>
          <button
            onClick={handleBulkCancel}
            className="text-[11px] px-2.5 py-1 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 cursor-pointer"
          >
            {t('cp.pending.bulkReject')}
          </button>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <input
            type="checkbox"
            checked={selected.size > 0 && selected.size === filtered.length}
            onChange={toggleSelectAll}
            className="accent-twitch"
          />
          <span className="text-[10px] text-text-muted">Seleccionar todo</span>
        </div>
        {visible.map((rd) => {
          const isSelected = selected.has(rd.id)
          return (
            <div
              key={rd.id}
              className={`flex items-start gap-2 p-3 rounded-lg border transition-colors ${
                isSelected
                  ? 'border-twitch/50 bg-twitch/5'
                  : 'border-bg-tertiary/30 bg-bg-tertiary/20'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelect(rd.id)}
                className="mt-1 accent-twitch"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-text-primary truncate">
                    {rd.user_name || rd.user_login || 'user'}
                  </span>
                  <span className="text-[10px] text-text-muted">·</span>
                  <span className="text-[10px] text-text-muted">{fmtDate(rd.redeemed_at)}</span>
                </div>
                <p className="text-[11px] text-text-secondary truncate mt-0.5">
                  {rd.reward_title || rd.reward?.title || 'Reward'}
                </p>
                {rd.user_input && (
                  <p className="text-[11px] text-text-muted mt-1 italic line-clamp-2">"{rd.user_input}"</p>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={() => onFulfill(rd.id)}
                  className="text-[10px] px-2 py-1 rounded-md bg-green-500/20 text-green-400 hover:bg-green-500/30 cursor-pointer"
                  title={t('cp.pending.approve')}
                >
                  ✓
                </button>
                <button
                  onClick={() => onCancel(rd.id)}
                  className="text-[10px] px-2 py-1 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 cursor-pointer"
                  title={t('cp.pending.reject')}
                >
                  ✕
                </button>
              </div>
            </div>
          )
        })}
        {}
        {hasMore && (
          <div className="flex flex-col items-center gap-1 pt-2">
            <p className="text-[10px] text-text-muted">
              {t('cp.pending.showingOf')?.replace('{shown}', String(safeVisibleCount)).replace('{total}', String(filtered.length))
                || `Mostrando ${safeVisibleCount} de ${filtered.length}`}
            </p>
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="text-[11px] px-3 py-1.5 rounded-md bg-twitch/15 text-twitch hover:bg-twitch/25 cursor-pointer"
            >
              {t('cp.pending.loadMore') || 'Ver mas'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
