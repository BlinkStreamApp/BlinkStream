import { useState, useMemo } from 'react'
import PhosphorIcon from '../icons/PhosphorIcon'
import { getUserByLogin } from '../../utils/twitch'

export function UserInspectorCard({
  targetUser,
  recentMessages = [],
  onTimeout,
  onBan,
  onUnban,
  onClose,
  onSelectUser,
  _isBroadcaster = false,
}) {
  const [customReason, setCustomReason] = useState('')
  const [showReasonInput, setShowReasonInput] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')

  const recentChatters = useMemo(() => {
    const map = new Map()
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const m = recentMessages[i]
      const uname = m.user || m.user_login || m.displayName
      if (uname && !map.has(uname.toLowerCase())) {
        map.set(uname.toLowerCase(), {
          userId: m.user_id || m.userId || '',
          username: uname,
          displayName: m.displayName || m.user_name || uname,
          avatar: m.avatar || null,
          isSub: !!(m.isSub || m.badges?.some?.(b => b.name === 'subscriber')),
          isVip: !!(m.isVip || m.badges?.some?.(b => b.name === 'vip')),
          isMod: !!(m.isMod || m.badges?.some?.(b => b.name === 'moderator')),
          lastMessage: m.text || m.message || '',
          timestamp: m.timestamp || 0,
        })
      }
    }
    return Array.from(map.values())
  }, [recentMessages])

  const handleSearchSubmit = async (e) => {
    e?.preventDefault()
    const clean = searchQuery.replace(/^@/, '').trim().toLowerCase()
    if (!clean) return

    const foundInRecent = recentChatters.find(c => c.username.toLowerCase() === clean)
    if (foundInRecent) {
      onSelectUser?.(foundInRecent)
      setSearchQuery('')
      setSearchError('')
      return
    }

    setSearchLoading(true)
    setSearchError('')
    try {
      const res = await getUserByLogin(clean)
      if (res.success && res.value) {
        const u = res.value
        onSelectUser?.({
          userId: u.id,
          username: u.login,
          displayName: u.display_name || u.login,
          avatar: u.profile_image_url || null,
          isSub: false,
          isVip: false,
          isMod: false,
        })
        setSearchQuery('')
      } else {
        setSearchError(`No se encontró el usuario @${clean}`)
      }
    } catch {
      setSearchError(`Error al buscar @${clean}`)
    }
    setSearchLoading(false)
  }

  const handleTimeoutClick = async (durationSec, label) => {
    setActionPending(true)
    const reason = customReason.trim() || `Mod View Timeout (${label})`
    await onTimeout?.(targetUser.userId, targetUser.username, durationSec, reason)
    setActionPending(false)
  }

  const handleBanClick = async () => {
    setActionPending(true)
    const reason = customReason.trim() || 'Mod View Permanent Ban'
    await onBan?.(targetUser.userId, targetUser.username, reason)
    setActionPending(false)
  }

  const handleUnbanClick = async () => {
    setActionPending(true)
    await onUnban?.(targetUser.userId, targetUser.username)
    setActionPending(false)
  }

  if (!targetUser) {
    return (
      <div className="h-full flex flex-col bg-[#111119]/90 border border-white/10 rounded-2xl overflow-hidden shadow-xl backdrop-blur-xl">
        <div className="p-3 border-b border-white/10 bg-white/5 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
            <PhosphorIcon name="MagnifyingGlass" size={16} className="text-twitch-glow" weight="bold" />
            <span>Inspector & Buscador de Usuario</span>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchError('') }}
                placeholder="Buscar o escribir @usuario..."
                className="w-full bg-black/40 border border-white/15 focus:border-twitch rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs p-0.5"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={searchLoading || !searchQuery.trim()}
              className="px-3 py-1.5 bg-twitch hover:bg-twitch-glow text-white rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-40 transition-all shrink-0 flex items-center gap-1 shadow-md shadow-twitch/20"
            >
              {searchLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Buscar'
              )}
            </button>
          </form>

          {searchError && (
            <p className="text-[11px] text-red-400 animate-fade-in">{searchError}</p>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col p-2.5 overflow-hidden">
          <div className="flex items-center justify-between px-1 mb-1.5">
            <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">
              Participantes Recientes ({recentChatters.length})
            </span>
            <span className="text-[10px] text-text-muted/60">Clic para moderar</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {recentChatters.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-4 text-center text-text-muted">
                <PhosphorIcon name="ChatCircleDots" size={24} className="text-white/20 mb-2" />
                <p className="text-xs font-semibold text-white/60">Esperando mensajes</p>
                <p className="text-[11px] text-text-muted/60 mt-0.5">
                  Los usuarios que hablen en el chat aparecerán aquí para moderación rápida.
                </p>
              </div>
            ) : (
              recentChatters.map(chatter => (
                <button
                  key={chatter.username}
                  onClick={() => onSelectUser?.(chatter)}
                  className="w-full text-left p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-twitch/40 transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-purple-600/40 border border-white/10 flex items-center justify-center font-bold text-white text-xs shrink-0">
                      {chatter.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate group-hover:text-twitch-glow transition-colors">
                          {chatter.displayName || chatter.username}
                        </span>
                        {chatter.isSub && <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded font-bold border border-amber-500/30">SUB</span>}
                        {chatter.isVip && <span className="text-[8px] bg-pink-500/20 text-pink-300 px-1 py-0.2 rounded font-bold border border-pink-500/30">VIP</span>}
                        {chatter.isMod && <span className="text-[8px] bg-green-500/20 text-green-300 px-1 py-0.2 rounded font-bold border border-green-500/30">MOD</span>}
                      </div>
                      {chatter.lastMessage && (
                        <p className="text-[10px] text-text-muted truncate max-w-[180px]">
                          {chatter.lastMessage}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] font-semibold text-twitch-glow opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                    Inspeccionar →
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    )
  }

  const userMessages = recentMessages.filter(m => 
    (m.user && m.user.toLowerCase() === targetUser.username.toLowerCase()) ||
    (m.user_login && m.user_login.toLowerCase() === targetUser.username.toLowerCase()) ||
    (m.displayName && m.displayName.toLowerCase() === targetUser.username.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col bg-[#111119]/95 border border-white/15 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl animate-fade-in">
      <div className="p-3 border-b border-white/10 bg-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-twitch to-purple-800 flex items-center justify-center font-bold text-white text-sm shrink-0 border border-white/20 shadow-md">
            {targetUser.avatar ? (
              <img src={targetUser.avatar} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              targetUser.username.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white truncate">{targetUser.displayName || targetUser.username}</span>
              {targetUser.isSub && <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded font-bold border border-amber-500/30">SUB</span>}
              {targetUser.isVip && <span className="text-[9px] bg-pink-500/20 text-pink-300 px-1 py-0.2 rounded font-bold border border-pink-500/30">VIP</span>}
              {targetUser.isMod && <span className="text-[9px] bg-green-500/20 text-green-300 px-1 py-0.2 rounded font-bold border border-green-500/30">MOD</span>}
            </div>
            <span className="text-[10px] text-text-muted truncate block">@{targetUser.username}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onSelectUser?.(null)}
            className="px-2 py-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 text-xs font-medium transition-colors cursor-pointer"
            title="Buscar otro usuario"
          >
            🔍 Buscar otro
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Cerrar Inspector"
          >
            <PhosphorIcon name="X" size={16} />
          </button>
        </div>
      </div>

      <div className="p-3 border-b border-white/10 bg-black/20 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Acciones Directas</span>
          <button
            onClick={() => setShowReasonInput(p => !p)}
            className="text-[10px] text-twitch-glow hover:underline cursor-pointer"
          >
            {showReasonInput ? 'Ocultar motivo' : '+ Añadir motivo'}
          </button>
        </div>

        {showReasonInput && (
          <input
            type="text"
            placeholder="Motivo de la sanción (opcional)..."
            value={customReason}
            onChange={e => setCustomReason(e.target.value)}
            className="w-full bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-twitch"
          />
        )}

        <div className="grid grid-cols-4 gap-1.5">
          <button
            onClick={() => handleTimeoutClick(1, '1s Purga')}
            disabled={actionPending}
            className="px-2 py-1.5 bg-white/5 hover:bg-amber-500/20 text-amber-300 border border-white/10 hover:border-amber-500/40 rounded-lg text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            1s Purga
          </button>
          <button
            onClick={() => handleTimeoutClick(600, '10m')}
            disabled={actionPending}
            className="px-2 py-1.5 bg-white/5 hover:bg-amber-500/20 text-amber-300 border border-white/10 hover:border-amber-500/40 rounded-lg text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            10 min
          </button>
          <button
            onClick={() => handleTimeoutClick(3600, '1h')}
            disabled={actionPending}
            className="px-2 py-1.5 bg-white/5 hover:bg-amber-500/20 text-amber-300 border border-white/10 hover:border-amber-500/40 rounded-lg text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            1 hora
          </button>
          <button
            onClick={() => handleTimeoutClick(86400, '24h')}
            disabled={actionPending}
            className="px-2 py-1.5 bg-white/5 hover:bg-amber-500/20 text-amber-300 border border-white/10 hover:border-amber-500/40 rounded-lg text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            24 horas
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <button
            onClick={handleBanClick}
            disabled={actionPending}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-500/15 hover:bg-red-500/30 text-red-300 border border-red-500/30 hover:border-red-500/60 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            title="Ban Permanente"
          >
            <PhosphorIcon name="ChatCircleSlash" size={14} weight="bold" />
            <span>Banear</span>
          </button>
          <button
            onClick={handleUnbanClick}
            disabled={actionPending}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-500/15 hover:bg-green-500/30 text-green-300 border border-green-500/30 hover:border-green-500/60 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            title="Perdonar / Quitar Ban o Timeout"
          >
            <PhosphorIcon name="CheckCircle" size={14} weight="bold" />
            <span>Perdonar / Unban</span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col p-3 overflow-hidden">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">
            Mensajes en esta Sesión ({userMessages.length})
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
          {userMessages.length === 0 ? (
            <p className="text-text-muted/50 text-xs italic text-center py-6">
              Sin mensajes registrados en esta sesión.
            </p>
          ) : (
            userMessages.map(m => (
              <div key={m.id || m.timestamp} className="p-2 rounded-lg bg-white/[0.03] border border-white/5 flex flex-col gap-0.5">
                <div className="flex items-center justify-between text-[10px] text-text-muted/60">
                  <span>{m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ''}</span>
                </div>
                <p className="text-white/90 break-words font-sans">{m.text || m.message}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
