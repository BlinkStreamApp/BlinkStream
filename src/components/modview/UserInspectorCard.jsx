import { useState } from 'react'
import PhosphorIcon from '../icons/PhosphorIcon'

export function UserInspectorCard({
  targetUser,
  recentMessages = [],
  onTimeout,
  onBan,
  onUnban,
  onClose,
  _isBroadcaster = false,
}) {
  const [customReason, setCustomReason] = useState('')
  const [showReasonInput, setShowReasonInput] = useState(false)
  const [actionPending, setActionPending] = useState(false)

  if (!targetUser) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-text-muted select-none bg-[#111119]/80 border border-white/10 rounded-2xl">
        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3 text-white/40">
          <PhosphorIcon name="MagnifyingGlass" size={24} weight="duotone" />
        </div>
        <p className="text-xs font-semibold text-white/80">Inspector de Usuario</p>
        <p className="text-[11px] text-text-muted mt-1 max-w-[200px]">
          Haz clic en cualquier mensaje del chat para inspeccionar y moderar al usuario.
        </p>
      </div>
    )
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

  const userMessages = recentMessages.filter(m => 
    (m.user && m.user.toLowerCase() === targetUser.username.toLowerCase()) ||
    (m.displayName && m.displayName.toLowerCase() === targetUser.username.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col bg-[#111119]/95 border border-white/15 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl animate-fade-in">
      {/* Header */}
      <div className="p-3.5 border-b border-white/10 bg-white/5 flex items-center justify-between">
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

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Cerrar Inspector"
        >
          <PhosphorIcon name="X" size={16} />
        </button>
      </div>

      {/* Quick Action Buttons Grid */}
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
            title="Purgar mensajes (1 segundo)"
          >
            1s Purga
          </button>
          <button
            onClick={() => handleTimeoutClick(600, '10m')}
            disabled={actionPending}
            className="px-2 py-1.5 bg-white/5 hover:bg-amber-500/20 text-amber-300 border border-white/10 hover:border-amber-500/40 rounded-lg text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50"
            title="Timeout 10 minutos"
          >
            10 min
          </button>
          <button
            onClick={() => handleTimeoutClick(3600, '1h')}
            disabled={actionPending}
            className="px-2 py-1.5 bg-white/5 hover:bg-amber-500/20 text-amber-300 border border-white/10 hover:border-amber-500/40 rounded-lg text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50"
            title="Timeout 1 hora"
          >
            1 hora
          </button>
          <button
            onClick={() => handleTimeoutClick(86400, '24h')}
            disabled={actionPending}
            className="px-2 py-1.5 bg-white/5 hover:bg-amber-500/20 text-amber-300 border border-white/10 hover:border-amber-500/40 rounded-lg text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50"
            title="Timeout 24 horas"
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
            <PhosphorIcon name="ShieldSlash" size={14} />
            <span>Banear</span>
          </button>
          <button
            onClick={handleUnbanClick}
            disabled={actionPending}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-500/15 hover:bg-green-500/30 text-green-300 border border-green-500/30 hover:border-green-500/60 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            title="Desbanear o perdonar usuario"
          >
            <PhosphorIcon name="CheckCircle" size={14} />
            <span>Perdonar / Unban</span>
          </button>
        </div>
      </div>

      {/* User Message History in Session */}
      <div className="flex-1 min-h-0 flex flex-col p-3 overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">
            Mensajes en esta sesión ({userMessages.length})
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 font-sans text-xs">
          {userMessages.length === 0 ? (
            <p className="text-[11px] text-text-muted/50 italic py-3 text-center">
              No hay mensajes recientes registrados en la memoria local de esta sesión.
            </p>
          ) : (
            userMessages.slice(-20).map((msg, i) => (
              <div key={msg.id || i} className="p-2 rounded-lg bg-white/5 border border-white/5 text-white/80 leading-relaxed text-[11px]">
                <span className="text-[9px] text-text-muted/60 mr-1.5 font-mono">
                  {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
                <span>{msg.text || msg.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
