import { useState, useEffect, useCallback, useMemo } from 'react'
import { getModerators, getVips, getChatters } from '../../utils/twitch'
import PhosphorIcon from '../icons/PhosphorIcon'

export function ActiveModsPanel({ broadcasterId, userId, recentMessages = [], onInspectUser }) {
  const [tab, setTab] = useState('chatters') // 'chatters' | 'mods' | 'vips'
  const [mods, setMods] = useState([])
  const [vips, setVips] = useState([])
  const [chatters, setChatters] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const loadData = useCallback(async () => {
    if (!broadcasterId) return
    setLoading(true)
    try {
      const [modRes, vipRes, chattersRes] = await Promise.all([
        getModerators(broadcasterId),
        getVips(broadcasterId),
        getChatters(broadcasterId, userId),
      ])
      if (modRes.success) setMods(modRes.value || [])
      if (vipRes.success) setVips(vipRes.value || [])
      if (chattersRes.success) setChatters(chattersRes.value || [])
    } catch {
      // ignore
    }
    setLoading(false)
  }, [broadcasterId, userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [loadData])

  // Unificar chatters de API con los que han hablado en chat en esta sesión
  const mergedChatters = useMemo(() => {
    const map = new Map()
    for (const c of chatters) {
      const uname = (c.user_login || c.user_name || '').toLowerCase()
      if (uname) {
        map.set(uname, {
          userId: c.user_id || c.id || '',
          user_login: c.user_login || c.user_name,
          user_name: c.user_name || c.user_login,
        })
      }
    }
    for (const m of recentMessages) {
      const uname = (m.user || m.user_login || m.displayName || '').toLowerCase()
      if (uname && !map.has(uname)) {
        map.set(uname, {
          userId: m.user_id || m.userId || '',
          user_login: uname,
          user_name: m.displayName || m.user_name || uname,
          isSub: !!(m.isSub || m.badges?.some?.(b => b.name === 'subscriber')),
          isVip: !!(m.isVip || m.badges?.some?.(b => b.name === 'vip')),
          isMod: !!(m.isMod || m.badges?.some?.(b => b.name === 'moderator')),
        })
      }
    }
    return Array.from(map.values())
  }, [chatters, recentMessages])

  const currentList = tab === 'chatters' ? mergedChatters : tab === 'mods' ? mods : vips
  const filteredList = currentList.filter(item => {
    const name = item.user_name || item.user_login || item.name || ''
    return name.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="h-full flex flex-col font-sans">
      {/* Subtabs */}
      <div className="shrink-0 flex items-center justify-between p-2 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setTab('chatters')}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              tab === 'chatters' ? 'bg-twitch/20 text-twitch-glow border border-twitch/40' : 'text-white/60 hover:text-white'
            }`}
          >
            Espectadores ({mergedChatters.length})
          </button>
          <button
            onClick={() => setTab('mods')}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              tab === 'mods' ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'text-white/60 hover:text-white'
            }`}
          >
            Mods ({mods.length})
          </button>
          <button
            onClick={() => setTab('vips')}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              tab === 'vips' ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30' : 'text-white/60 hover:text-white'
            }`}
          >
            VIPs ({vips.length})
          </button>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0 ml-1"
          title="Recargar lista"
        >
          <PhosphorIcon name="ArrowsClockwise" size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Search filter */}
      <div className="p-2 border-b border-white/5">
        <input
          type="text"
          placeholder={`Buscar en ${tab === 'chatters' ? 'espectadores' : tab === 'mods' ? 'moderadores' : 'VIPs'}...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-twitch"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center p-6 text-text-muted text-xs">
            <div className="w-5 h-5 border-2 border-twitch border-t-transparent rounded-full animate-spin mr-2" />
            <span>Cargando lista...</span>
          </div>
        ) : filteredList.length === 0 ? (
          <p className="text-center p-4 text-xs text-text-muted/60 italic">
            No se encontraron {tab === 'chatters' ? 'espectadores' : tab === 'mods' ? 'moderadores' : 'VIPs'}.
          </p>
        ) : (
          filteredList.map(item => {
            const username = item.user_login || item.name || item.user_name || ''
            const displayName = item.user_name || item.name || username
            const userId = item.user_id || item.id

            return (
              <div
                key={userId || username}
                onClick={() => onInspectUser?.({
                  username,
                  displayName,
                  userId,
                  isMod: tab === 'mods' || item.isMod,
                  isVip: tab === 'vips' || item.isVip,
                  isSub: item.isSub,
                })}
                className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.07] border border-white/5 cursor-pointer transition-all group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-twitch/50 to-purple-900 flex items-center justify-center font-bold text-white text-xs shrink-0">
                    {username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate group-hover:text-twitch-glow">{displayName}</p>
                    <p className="text-[10px] text-text-muted/60 truncate">@{username}</p>
                  </div>
                </div>

                <span className="text-[10px] text-white/30 group-hover:text-white/80 transition-colors">
                  Inspeccionar ➔
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
