import { useEffect, useRef } from 'react'
import { useT } from '../../utils/i18n'
import DropsCampaignBrowser from './DropsCampaignBrowser'
import PhosphorIcon from '../icons/PhosphorIcon'
import { useTwitchDrops } from '../../hooks/useTwitchDrops'
import { isTauri, safeOpenUrl } from '../../utils/tauriEnv'
import { useEmbeddedDropsInventory } from '../../hooks/useEmbeddedDropsInventory'
import { isDomElementVisible } from '../../utils/keyboard'

export default function DropsModal({ token, channel, onClose, nativeWatchEnabled = false, nativeWatchStatus, onToggleNativeWatch }) {
  const t = useT()
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const { isOpen: officialOpen, open: prepareOfficialInventory, close: closeOfficialInventory,
    reload: reloadOfficialInventory, error: officialError, containerRef: officialContainerRef } = useEmbeddedDropsInventory()
  const openOfficialInventory = () => { prepareOfficialInventory().catch(() => {}) }
  const {
    campaigns,
    loading,
    autoClaim,
    toggleAutoClaim,
    claimDrop,
    claimingIds,
    claimableCount,
    refreshDrops,
    authRequired,
    syncStatus,
    lastUpdatedAt,
    syncError,
    claimError,
    claimBlocked,
  } = useTwitchDrops(token, channel, isTauri() ? prepareOfficialInventory : null)

  useEffect(() => {
    const opener = document.activeElement
    closeButtonRef.current?.focus({ preventScroll: true })
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  const handleKeyDown = (event) => {
    if (event.defaultPrevented || event.target.closest('[role="dialog"]') !== dialogRef.current) return
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'Tab') {
      // This contains focus in React controls; Twitch's native Webview has its own keyboard.
      const controls = [...dialogRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]')]
        .filter(element => !element.disabled && element.tabIndex >= 0 && isDomElementVisible(element))
      const first = controls[0]
      const last = controls.at(-1)
      if (!first || !controls.includes(document.activeElement) ||
        (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault()
        const nextFocus = event.shiftKey ? last : first
        nextFocus?.focus()
      }
    }
  }

  return (
    <div
      ref={dialogRef}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drops-modal-title"
    >
      <div
        className={`bg-bg-secondary border border-white/10 rounded-2xl shadow-2xl w-full max-w-[1500px] max-h-[85vh] flex flex-col overflow-hidden ${officialOpen ? 'h-[85vh]' : ''}`}
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
                  {t('drops.center.title')}
                </h3>
                {claimableCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold animate-pulse">
                    {claimableCount} listos
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted">
                {t('drops.center.subtitle')}
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
              title={claimBlocked ? 'Reintentar Auto-Claim desde el inventario integrado de Twitch' : 'Reclama desde el inventario oficial dentro de este panel'}
            >
              <PhosphorIcon name="Lightning" size={14} weight={autoClaim ? 'fill' : 'bold'} className={autoClaim ? 'text-amber-400' : ''} />
              <span>{claimBlocked ? 'Auto-Claim: pausado' : autoClaim ? 'Auto-Claim: ON' : 'Auto-Claim: OFF'}</span>
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
              ref={closeButtonRef}
              className="p-1.5 rounded-xl text-text-muted hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Cerrar modal"
            >
              <PhosphorIcon name="X" size={16} weight="bold" />
            </button>
          </div>
        </div>

        {isTauri() && (
          <div className="flex gap-2 px-5 py-2 border-b border-white/10 shrink-0">
            <button type="button" aria-pressed={!officialOpen} onClick={closeOfficialInventory}
              className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors ${!officialOpen ? 'bg-purple-500/15 text-purple-300' : 'bg-white/5 text-white hover:bg-white/10'}`}>Progreso</button>
            <button type="button" aria-pressed={officialOpen} onClick={openOfficialInventory}
              className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors ${officialOpen ? 'bg-purple-500/15 text-purple-300' : 'bg-white/5 text-white hover:bg-white/10'}`}>Inventario oficial</button>
          </div>
        )}
        {officialOpen && (
          <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
            <p className="text-xs text-purple-200 shrink-0">Twitch oficial integrado. Si pide vincular la cuenta del juego, completa ese requisito antes de reclamar.</p>
            <button type="button" onClick={reloadOfficialInventory} className="text-xs text-purple-300 self-start cursor-pointer shrink-0">Volver al inventario de Twitch</button>
            {(officialError || claimError) && <p role="alert" className="text-xs text-amber-300 shrink-0">{officialError || claimError}</p>}
            {officialError && <button type="button" onClick={closeOfficialInventory} className="text-xs text-white cursor-pointer">Volver al progreso para reintentar</button>}
            <div ref={officialContainerRef} aria-label="Inventario oficial de Twitch integrado"
              className="flex-1 min-h-0 rounded-lg bg-black/30" />
          </div>
        )}
        {/* Body */}
        <div hidden={officialOpen} className={`flex-1 overflow-y-auto p-5 space-y-4 ${officialOpen ? 'hidden' : ''}`}>
          {channel && onToggleNativeWatch && (
            <div className="rounded-xl border border-purple-500/25 bg-purple-500/5 p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-purple-300 cursor-pointer">
                <input type="checkbox" checked={nativeWatchEnabled} onChange={onToggleNativeWatch} />
                Reporte nativo de visionado (experimental)
              </label>
              <p className="text-xs text-text-muted">
                Usa una interfaz interna de Twitch mientras el vídeo avanza. Se detiene al pausar,
                ocultar la app o cambiar de canal. Un reporte aceptado no confirma minutos de Drops.
              </p>
              {nativeWatchEnabled && (
                <p role="status" className="text-xs text-text-muted">
                  {nativeWatchStatus?.error ? `${nativeWatchStatus.error}${nativeWatchStatus.state === 'blocked' ? '. Reporte detenido; desactiva y activa la prueba para reintentar.' : ''}`
                    : nativeWatchStatus?.state === 'paused' ? 'Reporte pausado: vídeo detenido, cargando o app oculta.'
                    : nativeWatchStatus?.acceptedReports > 0
                      ? `${nativeWatchStatus.acceptedReports} reportes aceptados por Twitch. Comprueba el progreso del inventario.`
                      : `Midiendo reproducción real: ${nativeWatchStatus?.sampledSeconds || 0}/60 s para el próximo reporte.`}
                </p>
              )}
            </div>
          )}
          {channel && !authRequired && campaigns.some(campaign => campaign.isCurrentChannel) && !nativeWatchEnabled && (
            <div className="rounded-xl border border-purple-500/25 bg-purple-500/5 p-3 space-y-2">
              <p role="status" className="text-xs text-text-muted">
                Inventario sincronizado. La acreditación de minutos desde el reproductor nativo
                aún no está resuelta; actualizar no suma tiempo. Aquí solo se muestra el progreso
                confirmado por Twitch.
              </p>
            </div>
          )}
          {claimBlocked ? (
            <div role="alert" className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 space-y-2">
              <p className="text-xs text-amber-300">
                Twitch ha rechazado el reclamo por su verificación de integridad. Auto-Claim está pausado; el progreso sigue sincronizándose.
              </p>
              <button type="button" onClick={openOfficialInventory}
                className="text-xs font-bold text-purple-300 hover:text-white cursor-pointer">
                Abrir inventario oficial para reclamar
              </button>
              <button type="button" onClick={() => safeOpenUrl('https://www.twitch.tv/drops/inventory', true)}
                className="block text-xs text-text-muted hover:text-white cursor-pointer">
                Abrir en navegador externo
              </button>
            </div>
          ) : claimError && (
            <p role="alert" className="text-xs text-amber-300">No se pudo reclamar el Drop: {claimError}</p>
          )}
          {syncError && campaigns.length > 0 && (
            <p role="status" className="text-xs text-amber-300">Sincronización parcial: {syncError}</p>
          )}
          {!token || authRequired ? (
            <div className="text-center py-12 px-4 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-text-muted">
                <PhosphorIcon name="User" size={28} weight="duotone" />
              </div>
              <h4 className="text-sm font-bold text-white">Inicia sesión con Twitch</h4>
              <p className="text-xs text-text-muted max-w-sm mx-auto">
                {!token
                  ? 'Conecta tu cuenta de Twitch en BlinkStream para consultar y reclamar Drops.'
                  : 'El progreso de Drops depende de la sesión web de Twitch. Inicia sesión para sincronizar el inventario; los minutos solo se confirman cuando Twitch los acredita.'}
              </p>
              {authRequired && (
                <button
                  type="button"
                  onClick={openOfficialInventory}
                  className="mx-auto px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all cursor-pointer flex items-center gap-2"
                >
                  <PhosphorIcon name="ArrowSquareOut" size={16} weight="bold" />
                  <span>Iniciar sesión / abrir inventario</span>
                </button>
              )}
            </div>
          ) : syncError && campaigns.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 mx-auto flex items-center justify-center text-red-400">
                <PhosphorIcon name="WarningCircle" size={28} weight="duotone" />
              </div>
              <h4 className="text-sm font-bold text-white">No se pudo sincronizar el inventario</h4>
              <p className="text-xs text-text-muted max-w-sm mx-auto">{syncError}</p>
              <button
                type="button"
                onClick={refreshDrops}
                className="mx-auto px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/10 text-xs font-bold transition-all cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : (loading || syncStatus === 'starting') && campaigns.length === 0 ? (
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
                  onClick={openOfficialInventory}
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
            <DropsCampaignBrowser key={channel || ''} campaigns={campaigns} lastUpdatedAt={lastUpdatedAt}
              claimingIds={claimingIds} claimBlocked={claimBlocked} claimDrop={claimDrop} openOfficialInventory={openOfficialInventory} />
          )}
        </div>
      </div>
    </div>
  )
}
