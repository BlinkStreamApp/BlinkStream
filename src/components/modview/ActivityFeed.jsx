import { useState, useMemo } from 'react'
import PhosphorIcon from '../icons/PhosphorIcon'
import { useT } from '../../utils/i18n'

const validId = value => typeof value === 'string' && value.trim() && !['undefined', 'null'].includes(value.trim()) ? value.trim() : null
const ircMessageId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : null
const usableLogin = value => typeof value === 'string' && /^[a-z0-9_]{1,25}$/i.test(value)
const searchable = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function ActivityFeed({ messages = [], recentRedemptions = [], moderationEvents = [], onInspectUser, connectionState, possibleGap = false }) {
  const t = useT()
  const [filter, setFilter] = useState('all') // Includes only observed events, never persisted local actions.

  const [query, setQuery] = useState('')

  // Extract special activity events from messages and redemptions
  const activities = useMemo(() => {
    const list = []
    const seenIds = new Set()

    // 1. Direct Twitch API Redemptions
    for (const rd of recentRedemptions) {
      const receiptId = validId(rd.id)
      const id = receiptId ? `rd-${receiptId}` : null
      if (id && seenIds.has(id)) continue
      if (id) seenIds.add(id)
      const username = rd.user_name || rd.user_login || 'Espectador'
      const title = rd.reward_title || rd.reward?.title || 'Recompensa'
      const cost = rd.cost || rd.reward?.cost || 0
      list.push({
        id,
        key: id,
        type: 'rewards',
        user: username,
        userId: rd.user_id,
        login: rd.user_login || rd.user_name,
        search: [rd.user_name, rd.user_login, rd.user_id],
        redemptionId: rd.id,
        title: `🎁 ${username} ha canjeado ${title} (${cost.toLocaleString()} pts)`,
        text: rd.user_input || '',
        timestamp: rd.redeemed_at ? new Date(rd.redeemed_at).getTime() : 0,
      })
    }

    // 2. Real-time IRC and bridged Popout chat messages
    for (const m of messages) {
      const start = list.length
      if (
        m.eventType === 'reward' ||
        m.isReward ||
        m.custom_reward_id ||
        m.msg_id === 'highlighted-message' ||
        m.msg_id === 'custom-reward-redemption' ||
        m.msg_id === 'community-points-redemption'
      ) {
        const rawUser = m.user || m.user_name || 'Espectador'
        const cleanUser = rawUser.replace(/^@/, '')
        const rawText = m.text || (m.message && m.message !== m.eventHeader ? m.message : '')
        const cleanText = typeof rawText === 'string' ? rawText.trim().replace(/^["']|["']$/g, '').trim() : ''

        const id = validId(m.redemption_id) ? `rd-${validId(m.redemption_id)}` : null
        if (!id || !seenIds.has(id)) {
          if (id) seenIds.add(id)
          const header = m.eventHeader || m.message || 'Canje de Puntos'
          const formattedTitle = header.startsWith('🎁') ? header : `🎁 ${header}`
          list.push({
            id,
            type: 'rewards',
            user: cleanUser,
            userId: m.user_id,
            title: formattedTitle,
            text: cleanText,
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
          text: m.text || m.message || '',
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
          text: m.text || m.message || '',
          timestamp: m.timestamp || 0,
        })
      } else if (m.eventType === 'follow') {
        list.push({ id: m.id, type: 'follows', user: m.user || m.user_name || '', userId: m.user_id, title: `♥ ${m.user || m.user_name || ''}`, text: '', timestamp: m.timestamp })
      } else if (m.msg_id === 'raid' || m.eventType === 'raid') {
        list.push({
          id: m.id || m.timestamp,
          type: 'raids',
          user: m.user || m.user_name || 'Streamer',
          userId: m.user_id,
          title: m.eventHeader || '🚀 Raid Entrante!',
          text: m.text || m.message || '',
          timestamp: m.timestamp || 0,
        })
      }
      if (list.length > start) {
        const item = list[list.length - 1]
        item.key = item.id && item.type === 'rewards' ? item.id : null
        item.login = m.user_login || m.login || m.user || m.user_name
        item.search = [m.user, m.user_name, m.user_login, m.user_id]
        // Only a redemption instance ID can correlate receipts with chat.
        if (!validId(m.redemption_id) || item.type !== 'rewards') {
          const source = !m.source || m.source === 'irc' ? 'irc' : m.source === 'eventsub' ? 'eventsub' : null
          const messageId = source === 'irc' ? ircMessageId(m.message_id) : validId(m.id)
          const identity = source && messageId ? JSON.stringify([item.type, m.eventType || m.msg_id || item.type, source, messageId]) : null
          if (identity && seenIds.has(identity)) list.pop()
          else if (identity) { seenIds.add(identity); item.key = identity }
        }
      }
    }
    for (const event of moderationEvents) {
      if (event.source !== 'eventsub' || event.success !== true) continue
      const id = validId(event.id)
      const identity = id ? JSON.stringify(['moderation', 'eventsub', id]) : null
      if (identity && seenIds.has(identity)) continue
      if (identity) seenIds.add(identity)
      list.push({ key: identity, type: 'moderation', user: event.targetName || event.target || '', login: event.targetLogin,
        userId: event.target, title: [event.moderator, event.action, event.targetName || event.target].filter(Boolean).join(' · '),
        text: event.reason || '', search: [event.moderator, event.targetName, event.targetLogin, event.target], timestamp: event.timestamp })
    }
    return list.map((item, index) => ({ ...item, key: item.key || `anonymous-${index}` })).slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
  }, [messages, recentRedemptions, moderationEvents])

  const filtered = activities.filter(a => {
    return (filter === 'all' || a.type === filter) && searchable([a.user, a.userId, a.title, a.text, ...(a.search || [])].join(' ')).includes(searchable(query.trim()))
  })

  return (
    <div className="h-full flex flex-col font-sans">
      {connectionState && <p className="native-mod-notice">{t(`channel.activity.${connectionState}`)} · {t('activity.coverage')}</p>}
      <p role="status" aria-live="polite" className={possibleGap ? 'native-mod-notice' : undefined}>{possibleGap ? t('channel.activity.possibleGap') : ''}</p>
      {/* Filters Bar */}
      <div className="shrink-0 p-2 border-b border-white/10 bg-white/[0.02] flex flex-col gap-2 min-w-0">
        <label className="text-xs text-white/70">{t('activity.search')}<input type="search" value={query} onChange={event => setQuery(event.target.value)} className="block w-full min-w-0 rounded-lg bg-black/30 p-2" /></label>
        <div className="flex flex-wrap items-center gap-1">
          {[
            { id: 'all', label: `${t('activity.available')} (${activities.length})` },
            { id: 'subs', label: '⭐ Subs' },
            { id: 'bits', label: '💎 Bits' },
            { id: 'raids', label: '🚀 Raids' },
            { id: 'follows', label: '♥ Follows' },
            { id: 'rewards', label: '🎁 Puntos' },
            { id: 'moderation', label: t('activity.moderation') },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={filter === tab.id}
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

      {filter === 'moderation' && <p className="native-mod-notice">{t('activity.moderationHelp')}</p>}
      {/* Activity List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-text-muted select-none">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-2 text-white/30">
              <PhosphorIcon name="Lightning" size={20} weight="duotone" />
            </div>
            <p className="text-xs font-semibold text-white/70">{t(activities.length || query.trim() || filter !== 'all' ? 'activity.noMatches' : 'activity.empty')}</p>
            <p className="text-[10px] text-text-muted mt-0.5 max-w-[220px]">
              {t('activity.coverage')}
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
                key={item.key}
                className={`p-3 rounded-xl border ${colorClass} space-y-1.5 animate-fade-in shadow-sm`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold truncate">{item.title}</span>
                  <span className="text-[10px] opacity-60 font-mono shrink-0">{timeStr}</span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-0.5">
                  {item.type === 'moderation' && !usableLogin(item.login) ? <span className="text-xs font-semibold">@{item.user.replace(/^@/, '')}</span> : <button
                    type="button"
                    disabled={!item.userId && !item.login}
                    onClick={() => onInspectUser?.({ username: item.login || '', userId: item.userId })}
                    className="text-xs font-semibold hover:underline cursor-pointer flex items-center gap-1 truncate"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    <span>@{item.user.replace(/^@/, '')}</span>
                  </button>}
                </div>

                {item.text && item.text.trim() && (
                  <p className="text-xs opacity-85 break-words bg-black/30 p-2 rounded-lg border border-white/5 font-normal">
                    "{item.text.replace(/^["']|["']$/g, '')}"
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
