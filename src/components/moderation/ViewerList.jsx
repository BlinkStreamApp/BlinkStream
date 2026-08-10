

import { useState, useEffect, useMemo, useRef } from 'react'
import PhosphorIcon from '../icons/PhosphorIcon'

const SORT_OPTIONS = [
  { id: 'alpha', label: 'A-Z' },
  { id: 'recent', label: 'Recientes' },
  { id: 'role', label: 'Rol' },
]

function useDebounced(value, delay = 150) {
  const [v, setV] = useState(value)
  const timerRef = useRef(null)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setV(value), delay)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [value, delay])
  return v
}

function roleColor(badges) {
  if (!badges || badges.length === 0) return '#adadb8'
  if (badges.includes('broadcaster')) return '#9146ff'
  if (badges.includes('mod')) return '#22c55e'
  if (badges.includes('vip')) return '#ec4899'
  if (badges.includes('artist')) return '#f59e0b'
  if (badges.includes('sub')) return '#3b82f6'
  return '#adadb8'
}

function badgeStyle(badge) {
  switch (badge) {
    case 'broadcaster': return { bg: 'bg-twitch/20', text: 'text-twitch', label: 'BROADCASTER' }
    case 'mod': return { bg: 'bg-green-500/20', text: 'text-green-400', label: 'MOD' }
    case 'vip': return { bg: 'bg-pink-500/20', text: 'text-pink-400', label: 'VIP' }
    case 'sub': return { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'SUB' }
    case 'artist': return { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'ARTIST' }
    case 'staff': return { bg: 'bg-red-500/20', text: 'text-red-400', label: 'STAFF' }
    default: return { bg: 'bg-bg-tertiary', text: 'text-text-muted', label: badge.toUpperCase() }
  }
}

function roleRank(badges = []) {
  if (badges.includes('broadcaster')) return 0
  if (badges.includes('mod')) return 1
  if (badges.includes('vip')) return 2
  if (badges.includes('artist')) return 3
  if (badges.includes('sub')) return 4
  return 5
}

export function ViewerList({ viewers, onAction, loading }) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('alpha')
  const debounced = useDebounced(search, 150)

  const filtered = useMemo(() => {
    const term = debounced.trim().toLowerCase()
    let list = viewers
    if (term) {
      list = list.filter(v =>
        v.user_login?.toLowerCase().includes(term) ||
        v.user_name?.toLowerCase().includes(term)
      )
    }
    const sorted = [...list]
    if (sort === 'alpha') {
      sorted.sort((a, b) => (a.user_login || '').localeCompare(b.user_login || ''))
    } else if (sort === 'recent') {
      sorted.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
    } else if (sort === 'role') {
      sorted.sort((a, b) => roleRank(a.badges) - roleRank(b.badges))
    }
    return sorted
  }, [viewers, debounced, sort])

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 p-2 space-y-1.5 border-b border-bg-tertiary/40">
        <div className="relative">
          <PhosphorIcon name="MagnifyingGlass" size={11} weight="regular" className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted/40 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar viewer..."
            className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-bg-tertiary text-text-primary placeholder-text-muted/40 text-[11px] border border-transparent focus:border-twitch/40 focus:outline-none"
          />
        </div>
        <div className="flex gap-1">
          {SORT_OPTIONS.map(o => (
            <button
              key={o.id}
              onClick={() => setSort(o.id)}
              className={`flex-1 text-[10px] py-1 rounded-md cursor-pointer transition-colors ${
                sort === o.id ? 'bg-twitch/20 text-twitch' : 'bg-bg-tertiary text-text-muted hover:bg-hover'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-3 text-center text-[11px] text-text-muted">
            <span className="inline-block w-3 h-3 border border-twitch border-t-transparent rounded-full animate-spin mr-1.5" />
            Cargando viewers...
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <p className="p-3 text-[11px] text-text-muted/60 text-center">
            {search ? 'Sin resultados.' : 'No hay viewers aún.'}
          </p>
        )}
        {!loading && filtered.length > 0 && (
          <ul className="divide-y divide-bg-tertiary/30">
            {filtered.map(v => {
              const color = roleColor(v.badges)
              return (
                <li
                  key={v.user_id}
                  onClick={() => onAction?.(v)}
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-hover/40 cursor-pointer transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-twitch/20 flex items-center justify-center overflow-hidden shrink-0">
                    {v.avatar ? (
                      <img src={v.avatar} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="text-twitch text-[10px] font-bold">
                        {(v.user_login || v.user_name || '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold truncate" style={{ color }}>
                      {v.user_name || v.user_login}
                    </p>
                    <div className="flex gap-0.5 mt-0.5 flex-wrap">
                      {(v.badges || []).slice(0, 3).map(b => {
                        const s = badgeStyle(b)
                        return (
                          <span key={b} className={`text-[8px] px-1 py-0.5 rounded ${s.bg} ${s.text} font-semibold`}>
                            {s.label}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
