import { useState } from 'react'
import PhosphorIcon from '../icons/PhosphorIcon'

export function RewardsQueuePanel({
  pendingRedemptions = [],
  fulfilledRedemptions = [],
  onFulfillRedemption,
  onCancelRedemption,
  loading = false,
  onRefresh,
  onInspectUser,
}) {
  const [tab, setTab] = useState('all') // 'all' | 'pending' | 'fulfilled'
  const [actionPending, setActionPending] = useState({})

  const handleAction = async (redemption, action) => {
    if (!redemption?.id) return
    setActionPending(prev => ({ ...prev, [redemption.id]: true }))
    if (action === 'FULFILLED') {
      await onFulfillRedemption?.(redemption.reward?.id || redemption.reward_id, redemption.id)
    } else {
      await onCancelRedemption?.(redemption.reward?.id || redemption.reward_id, redemption.id)
    }
    setActionPending(prev => ({ ...prev, [redemption.id]: false }))
  }

  const displayedList =
    tab === 'pending'
      ? pendingRedemptions
      : tab === 'fulfilled'
      ? fulfilledRedemptions
      : [...pendingRedemptions, ...fulfilledRedemptions].sort(
          (a, b) => new Date(b.redeemed_at) - new Date(a.redeemed_at)
        )

  return (
    <div className="h-full flex flex-col font-sans">
      {/* Header */}
      <div className="shrink-0 p-2.5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <PhosphorIcon name="Gift" size={16} className="text-twitch-glow" weight="duotone" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Puntos de Canal ({pendingRedemptions.length + fulfilledRedemptions.length})
          </span>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Recargar cola de recompensas"
        >
          <PhosphorIcon name="ArrowsClockwise" size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Sub Tabs Bar */}
      <div className="shrink-0 px-2.5 py-1.5 border-b border-white/10 bg-white/[0.01] flex items-center gap-1">
        <button
          onClick={() => setTab('all')}
          className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
            tab === 'all'
              ? 'bg-twitch/20 text-twitch-glow border border-twitch/40'
              : 'text-white/60 hover:text-white'
          }`}
        >
          Todos ({pendingRedemptions.length + fulfilledRedemptions.length})
        </button>
        <button
          onClick={() => setTab('pending')}
          className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1 ${
            tab === 'pending'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <span>⏳ Solicitudes</span>
          {pendingRedemptions.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-black text-[10px] font-black">
              {pendingRedemptions.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('fulfilled')}
          className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1 ${
            tab === 'fulfilled'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <span>✅ Completadas ({fulfilledRedemptions.length})</span>
        </button>
      </div>

      {/* Redemptions List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center p-8 text-text-muted text-xs">
            <div className="w-5 h-5 border-2 border-twitch border-t-transparent rounded-full animate-spin mr-2" />
            <span>Cargando cola de recompensas...</span>
          </div>
        ) : displayedList.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-text-muted select-none">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-2 text-white/30">
              <PhosphorIcon name="Gift" size={20} weight="duotone" />
            </div>
            <p className="text-xs font-semibold text-white/70">
              {tab === 'fulfilled' ? 'Sin canjes registrados' : 'Sin solicitudes pendientes'}
            </p>
            <p className="text-[10px] text-text-muted mt-0.5 max-w-[220px]">
              {tab === 'pending'
                ? 'Los canjes de recompensas personalizadas que requieran aprobación aparecerán aquí.'
                : 'Los canjes completados y automáticos de los espectadores aparecerán aquí.'}
            </p>
          </div>
        ) : (
          displayedList.map(item => {
            const isPending = actionPending[item.id]
            const isUnfulfilled = item.status !== 'FULFILLED' && item.status !== 'CANCELED'
            const username = item.user_login || item.user_name || 'Espectador'
            const rewardTitle = item.reward_title || item.reward?.title || 'Recompensa'
            const cost = item.reward?.cost || item.cost || 0
            const userInput = item.user_input || item.userInput || ''

            return (
              <div
                key={item.id}
                className={`p-3 rounded-xl border ${
                  isUnfulfilled
                    ? 'border-amber-500/30 bg-amber-950/15'
                    : 'border-purple-500/20 bg-white/[0.03]'
                } space-y-2 animate-fade-in`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-twitch-glow truncate">{rewardTitle}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      {cost.toLocaleString()} pts
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        isUnfulfilled
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {isUnfulfilled ? 'Pendiente' : 'Completado'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => onInspectUser?.({ username, userId: item.user_id })}
                    className="text-xs font-bold text-white hover:text-twitch-glow hover:underline cursor-pointer truncate"
                  >
                    @{username}
                  </button>
                  <span className="text-[10px] text-text-muted/60 font-mono">
                    {item.redeemed_at ? new Date(item.redeemed_at).toLocaleTimeString() : ''}
                  </span>
                </div>

                {userInput && (
                  <div className="p-2 rounded-lg bg-black/40 border border-white/5 space-y-0.5">
                    <span className="text-[9px] uppercase font-bold text-text-muted">Mensaje / Entrada:</span>
                    <p className="text-xs text-white/90 break-words font-sans">
                      "{userInput}"
                    </p>
                  </div>
                )}

                {isUnfulfilled && (
                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <button
                      onClick={() => handleAction(item, 'CANCELED')}
                      disabled={isPending}
                      className="flex items-center gap-1 px-2.5 py-1 bg-red-500/15 hover:bg-red-500/30 text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                      title="Rechazar y reembolsar puntos"
                    >
                      <PhosphorIcon name="X" size={13} weight="bold" />
                      <span>Rechazar</span>
                    </button>
                    <button
                      onClick={() => handleAction(item, 'FULFILLED')}
                      disabled={isPending}
                      className="flex items-center gap-1 px-2.5 py-1 bg-green-500/15 hover:bg-green-500/30 text-green-300 border border-green-500/30 hover:border-green-500/50 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                      title="Marcar como cumplida"
                    >
                      <PhosphorIcon name="CheckCircle" size={13} weight="bold" />
                      <span>Cumplir</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
