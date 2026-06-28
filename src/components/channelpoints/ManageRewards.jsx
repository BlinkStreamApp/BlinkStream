/**
 * @file Tabla de gestion de recompensas para el broadcaster (P2 / WT-20260628-14).
 *
 * @typedef {object} ManageRewardsProps
 * @property {Array<object>} rewards
 * @property {boolean} loading
 * @property {string|null} error
 * @property {() => void} onRefresh
 * @property {() => void} onNewReward
 * @property {(reward: object) => void} onEdit
 * @property {(id: string, isEnabled: boolean) => void} onToggle
 * @property {(id: string) => void} onArchive
 */

import { useState, useMemo } from 'react'
import { t } from '../../utils/i18n'

const FILTERS = [
  { id: 'all', label: 'cp.manage.filter.all' },
  { id: 'enabled', label: 'cp.manage.filter.enabled' },
  { id: 'disabled', label: 'cp.manage.filter.disabled' },
]

const SORTS = [
  { id: 'date', label: 'cp.manage.sort.date' },
  { id: 'title', label: 'cp.manage.sort.title' },
  { id: 'cost', label: 'cp.manage.sort.cost' },
]

export default function ManageRewards({ rewards, loading, error, onRefresh, onNewReward, onEdit, onToggle, onArchive }) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('date')

  const filteredSorted = useMemo(() => {
    let list = rewards
    if (filter === 'enabled') list = list.filter(r => r.is_enabled)
    else if (filter === 'disabled') list = list.filter(r => !r.is_enabled)
    list = [...list]
    if (sort === 'title') list.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    else if (sort === 'cost') list.sort((a, b) => (a.cost || 0) - (b.cost || 0))
    else list.sort((a, b) => new Date(b.id || 0) - new Date(a.id || 0))
    return list
  }, [rewards, filter, sort])

  if (loading && rewards.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-twitch border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header: filtros + sort + new */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-[10px] px-2 py-1 rounded-md cursor-pointer transition-colors ${
                filter === f.id ? 'bg-twitch/20 text-twitch' : 'bg-bg-tertiary/50 text-text-muted hover:bg-hover'
              }`}
            >
              {t(f.label)}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="text-[10px] px-2 py-1 rounded-md bg-bg-tertiary text-text-primary border border-bg-tertiary focus:border-twitch focus:outline-none"
        >
          {SORTS.map(s => (
            <option key={s.id} value={s.id}>{t(s.label)}</option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          onClick={onRefresh}
          className="text-[10px] px-2 py-1 rounded-md text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer"
          title="Refrescar"
        >
          ↻
        </button>
        <button
          onClick={onNewReward}
          className="text-[10px] px-2.5 py-1 rounded-md font-medium text-white bg-twitch hover:bg-twitch-dark cursor-pointer transition-colors btn-press"
        >
          + {t('cp.manage.newReward')}
        </button>
      </div>

      {error && (
        <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {filteredSorted.length === 0 ? (
        <div className="text-center py-6 text-text-muted text-[11px]">
          {t('cp.empty.rewards')}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredSorted.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 p-2.5 rounded-lg border border-bg-tertiary/40 bg-bg-tertiary/20 hover:bg-bg-tertiary/40 transition-colors"
            >
              {/* Mini imagen */}
              <div
                className="w-10 h-10 rounded-md shrink-0 flex items-center justify-center text-white/80 text-sm font-bold overflow-hidden"
                style={{ backgroundColor: r.background_color || '#9146ff' }}
              >
                {r.image?.url_1x ? (
                  <img src={r.image.url_1x} alt="" className="w-full h-full object-cover" />
                ) : (
                  (r.title || '?').charAt(0).toUpperCase()
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-text-primary truncate">{r.title}</p>
                <div className="flex items-center gap-2 text-[10px] text-text-muted mt-0.5">
                  <span className="text-yellow-400 font-medium">{r.cost?.toLocaleString('es-ES')}</span>
                  {r.global_cooldown_seconds > 0 && r.is_global_cooldown_enabled && (
                    <span>⏱ {r.global_cooldown_seconds}s</span>
                  )}
                  {r.is_max_per_stream_enabled && (
                    <span>max {r.max_per_stream}/stream</span>
                  )}
                </div>
              </div>

              {/* Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                <span className="text-[10px] text-text-muted">{t('cp.manage.enabled')}</span>
                <button
                  type="button"
                  onClick={() => onToggle(r.id, !r.is_enabled)}
                  className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                    r.is_enabled ? 'bg-twitch' : 'bg-bg-tertiary'
                  }`}
                  role="switch"
                  aria-checked={r.is_enabled}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform ${
                      r.is_enabled ? 'translate-x-[14px]' : 'translate-x-[2px]'
                    }`}
                  />
                </button>
              </label>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onEdit(r)}
                  className="text-[10px] px-2 py-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-hover cursor-pointer"
                  title={t('cp.manage.editReward')}
                >
                  ✎
                </button>
                <button
                  onClick={() => {
                    if (confirm(`¿Eliminar la recompensa "${r.title}"?`)) onArchive(r.id)
                  }}
                  className="text-[10px] px-2 py-1 rounded-md text-red-400 hover:bg-red-500/20 cursor-pointer"
                  title={t('cp.manage.delete')}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
