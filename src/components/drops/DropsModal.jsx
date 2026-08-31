import { useEffect } from 'react'
import PhosphorIcon from '../icons/PhosphorIcon'
import { useTwitchDrops } from '../../hooks/useTwitchDrops'
import { safeOpenUrl } from '../../utils/tauriEnv'
import { openTwitchDropsWindow } from '../../utils/twitchPopout'

export default function DropsModal({ token, channel, onClose }) {
  const {
    campaigns,
    loading,
    autoClaim,
    toggleAutoClaim,
    claimDrop,
    claimingIds,
    claimableCount,
    refreshDrops,
  } = useTwitchDrops(token, channel)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drops-modal-title"
    >
      <div
        className="bg-bg-secondary border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0 bg-bg-tertiary/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <PhosphorIcon name="Gift" size={20} weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="drops-modal-title" className="text-base font-bold text-white">
                  Twitch Drops & Recompensas
                </h3>
                {claimableCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold animate-pulse">
                    {claimableCount} listos
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted">
                Rastrea tu progreso y reclama automáticamente tus Drops
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto-Claim Toggle */}
            <button
              type="button"
              onClick={toggleAutoClaim}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                autoClaim
                  ? 'bg-purple-600/25 text-purple-300 border-purple-500/60 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                  : 'bg-white/5 text-text-muted border-white/10 hover:border-white/20'
              }`}
              title="Reclama automáticamente los Drops en cuanto alcancen el 100%"
            >
              <PhosphorIcon name="Lightning" size={14} weight={autoClaim ? 'fill' : 'bold'} className={autoClaim ? 'text-amber-400' : ''} />
              <span>{autoClaim ? 'Auto-Claim: ON' : 'Auto-Claim: OFF'}</span>
            </button>

            <button
              type="button"
              onClick={refreshDrops}
              disabled={loading}
              className="p-1.5 rounded-xl text-text-muted hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
              title="Actualizar progreso"
              aria-label="Actualizar progreso"
            >
              <PhosphorIcon name="ClockCounterClockwise" size={16} weight="bold" className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-text-muted hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Cerrar modal"
            >
              <PhosphorIcon name="X" size={16} weight="bold" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!token ? (
            <div className="text-center py-12 px-4 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-text-muted">
                <PhosphorIcon name="User" size={28} weight="duotone" />
              </div>
              <h4 className="text-sm font-bold text-white">Inicia sesión con Twitch</h4>
              <p className="text-xs text-text-muted max-w-sm mx-auto">
                Debes iniciar sesión con tu cuenta de Twitch para consultar el inventario de Drops activos y reclamar recompensas.
              </p>
            </div>
          ) : loading && campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-text-muted">Consultando campañas de Drops activas...</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 mx-auto flex items-center justify-center text-purple-400 shadow-lg shadow-purple-500/5">
                <PhosphorIcon name="Gift" size={32} weight="duotone" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">No hay Drops en progreso detectados</h4>
                <p className="text-xs text-text-muted max-w-md mx-auto leading-relaxed">
                  Mira canales con la etiqueta <span className="text-purple-300 font-semibold">Drops activados</span> o consulta tu inventario oficial y campañas activas directamente en Twitch.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => openTwitchDropsWindow()}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all cursor-pointer flex items-center gap-2"
                >
                  <PhosphorIcon name="ArrowSquareOut" size={16} weight="bold" />
                  <span>Abrir Inventario de Drops</span>
                </button>
                <button
                  type="button"
                  onClick={() => safeOpenUrl('https://www.twitch.tv/drops/campaigns', true)}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-muted hover:text-white border border-white/10 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>Todas las Campañas</span>
                </button>
              </div>
            </div>
          ) : (
            campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="bg-bg-tertiary/40 border border-white/5 rounded-2xl p-4 space-y-3"
              >
                {/* Campaign Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {campaign.boxArtUrl ? (
                      <img
                        src={campaign.boxArtUrl.replace('{width}', '60').replace('{height}', '80')}
                        alt={campaign.gameName}
                        className="w-8 h-10 object-cover rounded-lg border border-white/10 shadow-sm"
                      />
                    ) : (
                      <div className="w-8 h-10 bg-white/10 rounded-lg flex items-center justify-center text-[10px] font-bold text-text-muted">
                        🎮
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{campaign.name}</h4>
                        {campaign.isCurrentChannel && (
                          <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold">
                            En este canal
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-text-muted font-medium">{campaign.gameName}</p>
                    </div>
                  </div>
                </div>

                {/* Drops list */}
                <div className="space-y-2.5 pt-1">
                  {campaign.drops.map((drop) => {
                    const isClaimingThis = claimingIds.has(drop.dropInstanceId)

                    return (
                      <div
                        key={drop.id}
                        className="bg-black/30 border border-white/5 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {drop.benefitImage ? (
                            <img
                              src={drop.benefitImage}
                              alt={drop.benefitName}
                              className="w-10 h-10 rounded-lg object-cover border border-white/10 bg-black/40 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                              <PhosphorIcon name="Gift" size={18} weight="bold" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-bold text-white truncate max-w-[200px]">
                                {drop.benefitName}
                              </span>
                              <span className="font-mono text-[11px] text-text-muted font-medium">
                                {drop.currentMinutes} / {drop.requiredMinutes} min ({drop.percent}%)
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-500 ${
                                  drop.isClaimed
                                    ? 'bg-emerald-500'
                                    : drop.isReadyToClaim
                                    ? 'bg-purple-500 animate-pulse'
                                    : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                                }`}
                                style={{ width: `${drop.percent}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Action status / button */}
                        <div className="shrink-0 flex items-center justify-end">
                          {drop.isClaimed ? (
                            <span className="px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1">
                              <PhosphorIcon name="Check" size={14} weight="bold" />
                              <span>Reclamado</span>
                            </span>
                          ) : drop.isReadyToClaim ? (
                            <button
                              type="button"
                              onClick={() => claimDrop(drop.dropInstanceId, drop.benefitName)}
                              disabled={isClaimingThis}
                              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                            >
                              {isClaimingThis ? (
                                <>
                                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  <span>Reclamando...</span>
                                </>
                              ) : (
                                <>
                                  <PhosphorIcon name="Gift" size={14} weight="fill" />
                                  <span>¡Reclamar Drop!</span>
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-[11px] font-medium text-text-muted px-2 py-1 rounded bg-white/5 border border-white/5">
                              {drop.requiredMinutes - drop.currentMinutes} min restantes
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
