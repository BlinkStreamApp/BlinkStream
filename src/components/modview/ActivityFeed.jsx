import { useState, useMemo } from 'react'
import PhosphorIcon from '../icons/PhosphorIcon'

export function ActivityFeed({ messages = [], recentRedemptions = [], onInspectUser }) {
  const [filter, setFilter] = useState('all') // 'all' | 'subs' | 'bits' | 'raids' | 'rewards'

  // Extract special activity events from messages and redemptions
  const activities = useMemo(() => {
    const list = []
    const seenIds = new Set()

    // 1. Direct Twitch API Redemptions
    for (const rd of recentRedemptions) {
      const id = `rd-${rd.id}`
      seenIds.add(id)
      const username = rd.user_name || rd.user_login || 'Espectador'
      const title = rd.reward_title || rd.reward?.title || 'Recompensa'
      const cost = rd.cost || rd.reward?.cost || 0
      list.push({
        id,
        type: 'rewards',
        user: username,
        userId: rd.user_id,
        title: `🎁 ${username} ha canjeado ${title} (${cost.toLocaleString()} pts)`,
        text: rd.user_input || '',
        timestamp: rd.redeemed_at ? new Date(rd.redeemed_at).getTime() : 0,
      })
    }

    // 2. Real-time IRC and bridged Popout chat messages
    for (const m of messages) {
      if (
        m.eventType === 'reward' ||
        m.isReward ||
        m.custom_reward_id ||
        m.msg_id === 'highlighted-message' ||
        m.msg_id === 'custom-reward-redemption' ||
        m.msg_id === 'community-points-redemption' ||
        (typeof m.message === 'string' && /canjeado|canjeó|canje|has redeemed|redeemed|\d+\s+points/i.test(m.message)) ||
        (typeof m.eventHeader === 'string' && /canjeado|canjeó|canje|has redeemed|redeemed|points|puntos|recompensa/i.test(m.eventHeader))
      ) {
        const id = m.id || m.timestamp
        if (!seenIds.has(id)) {
          seenIds.add(id)
          const header = m.eventHeader || m.message || 'Canje de Puntos'
          const formattedTitle = header.startsWith('🎁') ? header : `🎁 ${header}`
          list.push({
            id,
            type: 'rewards',
            user: m.user || m.user_name || 'Espectador',
            userId: m.user_id,
            title: formattedTitle,
            text: m.text || (m.message && m.message !== m.eventHeader ? m.message : ''),
            timestamp: m.timestamp || 0,
          })
        }
      } else if (m.eventType === 'bits' || (m.bits && parseInt(m.bits, 10) > 0)) {
        list.push({
          id: m.id || m.timestamp,
          type: 'bits',
          user: m.user || m.user_name || 'Espectador',
          userId: m.user_id,
          title: m.eventHeader || '💎 Donación de Bits',
          text: m.message || '',
          timestamp: m.timestamp || 0,
        })
      } else if (
        m.msg_id === 'sub' ||
        m.msg_id === 'resub' ||
        m.msg_id === 'subgift' ||
        m.msg_id === 'submysterygift' ||
        m.eventType === 'sub' ||
        m.eventType === 'resub' ||
        m.eventType === 'subgift' ||
        m.eventType === 'submysterygift'
      ) {
        list.push({
          id: m.id || m.timestamp,
          type: 'subs',
          user: m.user || m.user_name || 'Espectador',
          userId: m.user_id,
          title: m.eventHeader || (m.msg_id === 'subgift' ? '🎁 Suscripción de Regalo' : m.msg_id === 'resub' ? '⭐ Resubscripción' : '⭐ Nueva Suscripción'),
          text: m.message || '',
          timestamp: m.timestamp || 0,
        })
      } else if (m.msg_id === 'raid' || m.eventType === 'raid') {
        list.push({
          id: m.id || m.timestamp,
          type: 'raids',
          user: m.user || m.user_name || 'Streamer',
          userId: m.user_id,
          title: m.eventHeader || '🚀 Raid Entrante!',
          text: m.message || '',
          timestamp: m.timestamp || 0,
        })
      }
    }
    return list.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
  }, [messages, recentRedemptions])

  const filtered = activities.filter(a => {
    if (filter === 'all') return true
    return a.type === filter
  })

  return (
    <div className="h-full flex flex-col font-sans">
      {/* Filters Bar */}
      <div className="shrink-0 p-2 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: `Todos (${activities.length})` },
            { id: 'subs', label: '⭐ Subs' },
            { id: 'bits', label: '💎 Bits' },
            { id: 'raids', label: '🚀 Raids' },
            { id: 'rewards', label: '🎁 Puntos' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                filter === tab.id
                  ? 'bg-twitch/20 text-twitch-glow border border-twitch/40'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activity List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-text-muted select-none">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-2 text-white/30">
              <PhosphorIcon name="Lightning" size={20} weight="duotone" />
            </div>
            <p className="text-xs font-semibold text-white/70">Sin actividad reciente</p>
            <p className="text-[10px] text-text-muted mt-0.5 max-w-[220px]">
              Las suscripciones, donaciones de bits, raids y canjes aparecerán aquí en vivo.
            </p>
          </div>
        ) : (
          filtered.map(item => {
            const timeStr = item.timestamp
              ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ''

            const colorClass =
              item.type === 'bits'
                ? 'border-cyan-500/30 bg-cyan-950/20 text-cyan-300'
                : item.type === 'subs'
                ? 'border-amber-500/30 bg-amber-950/20 text-amber-300'
                : item.type === 'raids'
                ? 'border-pink-500/30 bg-pink-950/20 text-pink-300'
                : 'border-purple-500/30 bg-purple-950/20 text-purple-300'

            return (
              <div
                key={item.id}
                className={`p-3 rounded-xl border ${colorClass} space-y-1.5 animate-fade-in shadow-sm`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold truncate">{item.title}</span>
                  <span className="text-[10px] opacity-60 font-mono shrink-0">{timeStr}</span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <button
                    onClick={() => onInspectUser?.({ username: item.user, userId: item.userId })}
                    className="text-xs font-semibold hover:underline cursor-pointer flex items-center gap-1 truncate"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    <span>@{item.user.replace(/^@/, '')}</span>
                  </button>
                </div>

                {item.text && (
                  <p className="text-xs opacity-85 break-words bg-black/30 p-2 rounded-lg border border-white/5">
                    "{item.text}"
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
