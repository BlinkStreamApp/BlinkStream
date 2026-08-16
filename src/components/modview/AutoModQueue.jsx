import { useState } from 'react'
import PhosphorIcon from '../icons/PhosphorIcon'
import { manageAutoModMessage } from '../../utils/twitch'

export function AutoModQueue({ broadcasterId, userId, isLoggedIn = true, onLoginWithToken, heldMessages = [], onRemoveMessage, onInspectUser }) {
  const [actionPending, setActionPending] = useState({})
  const [statusMessage, setStatusMessage] = useState('')

  const handleAction = async (msgId, action) => {
    if (!broadcasterId || !userId || !msgId || !isLoggedIn) return
    setActionPending(prev => ({ ...prev, [msgId]: true }))
    setStatusMessage('')

    const res = await manageAutoModMessage(broadcasterId, userId, msgId, action)
    if (res.success) {
      onRemoveMessage?.(msgId)
      setStatusMessage(`Mensaje ${action === 'ALLOW' ? 'permitido' : 'denegado'} con éxito.`)
    } else {
      setStatusMessage(res.error?.message || `Error al procesar mensaje con AutoMod (${action})`)
    }
    setActionPending(prev => ({ ...prev, [msgId]: false }))
  }

  return (
    <div className="h-full flex flex-col font-sans">
      {/* Header */}
      <div className="shrink-0 p-2.5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <PhosphorIcon name="ShieldCheck" size={16} className="text-amber-400" weight="duotone" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">Cola de AutoMod ({heldMessages.length})</span>
        </div>
        {statusMessage && (
          <span className="text-[10px] text-text-muted animate-fade-in truncate max-w-[200px]">{statusMessage}</span>
        )}
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {!isLoggedIn ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center select-none">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-300 mb-3">
              <PhosphorIcon name="ShieldCheck" size={24} weight="duotone" />
            </div>
            <p className="text-xs font-bold text-white mb-1">Inicio de Sesión Requerido</p>
            <p className="text-[11px] text-text-muted max-w-[240px] mb-4">
              Inicia sesión con tu cuenta de moderador o creador para revisar y liberar mensajes retenidos por AutoMod.
            </p>
            {onLoginWithToken && (
              <button
                onClick={onLoginWithToken}
                className="px-4 py-2 bg-twitch hover:bg-twitch-glow text-white text-xs font-bold rounded-xl shadow-lg shadow-twitch/30 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <PhosphorIcon name="SignIn" size={15} weight="bold" />
                <span>Iniciar sesión en Twitch</span>
              </button>
            )}
          </div>
        ) : heldMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-text-muted select-none">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-2 text-white/30">
              <PhosphorIcon name="ShieldCheck" size={20} weight="duotone" />
            </div>
            <p className="text-xs font-semibold text-white/70">Sin mensajes retenidos</p>
            <p className="text-[10px] text-text-muted mt-0.5 max-w-[220px]">
              Los mensajes marcados por AutoMod para revisión de moderador aparecerán aquí.
            </p>
          </div>
        ) : (
          heldMessages.map(msg => {
            const isPending = actionPending[msg.id]
            return (
              <div
                key={msg.id}
                className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] space-y-2 animate-fade-in"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => onInspectUser?.({ username: msg.user, userId: msg.userId })}
                    className="text-xs font-bold text-white hover:text-twitch-glow hover:underline cursor-pointer truncate"
                  >
                    @{msg.user}
                  </button>
                  {msg.category && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                      {msg.category}
                    </span>
                  )}
                </div>

                <p className="text-xs text-white/90 break-words bg-black/30 p-2 rounded-lg border border-white/5 font-sans">
                  "{msg.text || msg.message}"
                </p>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => handleAction(msg.id, 'DENY')}
                    disabled={isPending}
                    className="flex items-center gap-1 px-2.5 py-1 bg-red-500/15 hover:bg-red-500/30 text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                    title="Denegar mensaje"
                  >
                    <PhosphorIcon name="X" size={13} weight="bold" />
                    <span>Denegar</span>
                  </button>
                  <button
                    onClick={() => handleAction(msg.id, 'ALLOW')}
                    disabled={isPending}
                    className="flex items-center gap-1 px-2.5 py-1 bg-green-500/15 hover:bg-green-500/30 text-green-300 border border-green-500/30 hover:border-green-500/50 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                    title="Permitir mensaje"
                  >
                    <PhosphorIcon name="CheckCircle" size={13} weight="bold" />
                    <span>Permitir</span>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
