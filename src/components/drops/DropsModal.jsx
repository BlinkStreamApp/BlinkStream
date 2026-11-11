import { useEffect, useRef } from 'react'
import { useT } from '../../utils/i18n'
import { useTwitchDrops } from '../../hooks/useTwitchDrops'
import { useDropsAuthorization } from '../../hooks/useDropsAuthorization'
import { useEmbeddedDropsInventory } from '../../hooks/useEmbeddedDropsInventory'
import { isDomElementVisible } from '../../utils/keyboard'
import DropsCampaignBrowser from './DropsCampaignBrowser'
import PhosphorIcon from '../icons/PhosphorIcon'
import BrandIcon from '../icons/BrandIcon'
import ToggleSwitch from '../ToggleSwitch'

export default function DropsModal({ account = '', onClose }) {
  const t = useT()
  const drops = useTwitchDrops(account)
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const authRef = useRef(null)
  const { isOpen: inventoryOpen, open: openInventory, close: closeInventory, reload: reloadInventory,
    error: inventoryError, containerRef: inventoryRef } = useEmbeddedDropsInventory()
  const { isOpen: catalogOpen, open: openCatalog, close: closeCatalog, reload: reloadCatalog,
    error: catalogError, containerRef: catalogRef } = useEmbeddedDropsInventory('campaigns')
  const official = inventoryOpen || catalogOpen
  const officialRef = inventoryOpen ? inventoryRef : catalogRef
  const officialError = inventoryOpen ? inventoryError : catalogError
  const reloadOfficial = inventoryOpen ? reloadInventory : reloadCatalog
  const authorizing = ['preparing', 'authorizing', 'checking'].includes(drops.phase)
  const busy = authorizing || drops.phase === 'loading' || Boolean(drops.claimingId)
  useDropsAuthorization(authRef, drops.session, authorizing)

  useEffect(() => {
    const opener = document.activeElement
    closeRef.current?.focus({ preventScroll: true })
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }) }
  }, [])
  const openOfficialInventory = () => { closeCatalog(); openInventory().catch(() => {}) }
  const openOfficialCatalog = () => { closeInventory(); openCatalog().catch(() => {}) }
  const closeOfficial = () => { closeInventory(); closeCatalog() }
  const keyDown = event => {
    if (event.defaultPrevented || event.target.closest('[role="dialog"]') !== dialogRef.current) return
    event.stopPropagation()
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab') return
    const controls = [...dialogRef.current.querySelectorAll('button,input,select,a[href],[tabindex]')]
      .filter(element => !element.disabled && element.tabIndex >= 0 && isDomElementVisible(element))
    const first = controls[0]
    const last = controls.at(-1)
    if (!controls.includes(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault()
      ;(event.shiftKey ? last : first)?.focus()
    }
  }
  const errorKey = drops.error === 'storage' ? 'drops.session.storage' : drops.error === 'account' ? 'drops.session.accountReconnect' : drops.error === 'integrity' ? 'drops.session.integrity'
    : ['not-eligible', 'rejected', 'uncertain'].includes(drops.error) ? `drops.probe.${drops.error}`
      : ['authorization', 'cancelled'].includes(drops.error) ? 'drops.session.expired' : 'drops.session.error'

  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="drops-modal-title" onKeyDown={keyDown}
    onClick={onClose} className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
    <div onClick={event => event.stopPropagation()} className="bg-bg-secondary border border-white/10 rounded-2xl shadow-2xl w-full max-w-[1500px] h-[85vh] flex flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3"><BrandIcon name="drops" size={30} />
          <div><h3 id="drops-modal-title" className="text-base font-bold text-white">{t('drops.center.title')}</h3>
            <p className="text-xs text-text-muted">{t('drops.center.subtitle')}</p></div>
          {drops.claimableCount > 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">{drops.claimableCount} {t('drops.session.ready')}</span>}
        </div>
        <div className="flex items-center gap-2">
          {drops.session && !authorizing && <button type="button" onClick={drops.disconnect} disabled={Boolean(drops.claimingId)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20 hover:border-red-400/50 focus-visible:outline-2 focus-visible:outline-red-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"><PhosphorIcon name="SignOut" size={16} />{t('drops.session.disconnect')}</button>}
          <button type="button" onClick={drops.refresh} disabled={busy || !drops.session} aria-label={t('drops.session.refresh')}
            className="p-2 text-purple-300 cursor-pointer disabled:opacity-40"><PhosphorIcon name="ClockCounterClockwise" size={18} className={drops.phase === 'loading' ? 'animate-spin' : ''} /></button>
          <button type="button" ref={closeRef} onClick={onClose} aria-label={t('drops.session.close')} className="p-2 text-text-muted cursor-pointer"><PhosphorIcon name="X" size={18} /></button>
        </div>
      </header>
      {account && drops.session && !authorizing && <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-white/10 px-5 py-3 shrink-0">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
          <div className="flex-1"><p className="text-xs font-semibold text-white">{t('drops.session.autoClaim')}</p>
            <p id="drops-auto-hint" className="text-xs text-text-muted">{t('drops.session.autoHint')}</p></div>
          <ToggleSwitch label={t('drops.session.autoClaim')} describedBy="drops-auto-hint" active={Boolean(drops.autoClaim)}
            disabled={!drops.autoClaim && (busy || drops.claimBlocked || drops.phase !== 'ready')}
            onClick={() => drops.setAutoClaim(!drops.autoClaim)} />
        </div>
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
          <div className="flex-1"><p className="text-xs font-semibold text-white">{t('drops.session.remember')}</p>
            <p id="drops-remember-hint" className="text-xs text-text-muted">{t('drops.session.rememberHint')}</p></div>
          <ToggleSwitch label={t('drops.session.remember')} describedBy="drops-remember-hint" active={Boolean(drops.remember)} disabled={busy || drops.savingPreference}
            onClick={() => drops.setRemember(!drops.remember)} />
        </div>
      </div>}
      <nav className="flex flex-wrap gap-2 px-5 py-2 border-b border-white/10 shrink-0" aria-label={t('drops.center.title')}>
        <button type="button" aria-pressed={!official} onClick={closeOfficial} className="px-3 py-2 text-xs rounded-lg bg-purple-500/15 text-purple-200 cursor-pointer">{t('drops.session.progress')}</button>
        <button type="button" disabled={authorizing} aria-pressed={inventoryOpen} onClick={openOfficialInventory} className="px-3 py-2 text-xs rounded-lg bg-white/5 text-white cursor-pointer disabled:opacity-40">{t('drops.session.inventory')}</button>
        <button type="button" disabled={authorizing} aria-pressed={catalogOpen} onClick={openOfficialCatalog} className="px-3 py-2 text-xs rounded-lg bg-white/5 text-white cursor-pointer disabled:opacity-40">{t('drops.catalog.official')}</button>
      </nav>
      {official ? <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
        <button type="button" onClick={reloadOfficial} className="self-start text-xs text-purple-300 cursor-pointer">{t('drops.session.refresh')}</button>
        {officialError && <p role="alert" className="text-xs text-amber-300">{officialError}</p>}
        <div ref={officialRef} className="flex-1 min-h-0 bg-black/30 rounded-lg" aria-label={t('drops.session.inventory')} />
      </div> : <div data-drops-scroll className={`flex-1 min-h-0 p-5 ${authorizing ? 'flex flex-col gap-3 overflow-hidden' : 'overflow-y-auto space-y-4'}`}>
        {drops.error && <p role="alert" className="text-xs text-amber-300">{t(errorKey)}</p>}
        {drops.claimBlocked && !drops.error && <p role="alert" className="text-xs text-amber-300">{t('drops.session.paused')}</p>}
        {!account ? <p className="text-sm text-text-muted">{t('drops.session.login')}</p>
          : drops.enabled === false ? <p className="text-sm text-text-muted">{t('drops.session.unavailable')}</p>
            : authorizing ? <>
              <p role="status" className="text-xs text-purple-200">{t('drops.probe.authorizing')}</p>
              <button type="button" onClick={drops.disconnect} className="self-start text-xs text-purple-300 cursor-pointer">{t('drops.session.cancel')}</button>
              <div ref={authRef} className="flex-1 min-h-[160px] rounded-lg bg-black/30" aria-label={t('drops.probe.authorizing')} />
            </> : !drops.session ? <div className="space-y-3 py-6">
              <p className="text-sm text-text-muted">{t('drops.session.description')}</p>
              <button type="button" disabled={drops.enabled === null} onClick={drops.connect} className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white cursor-pointer disabled:opacity-40">{t('drops.session.connect')}</button>
            </div> : <>
              {drops.phase === 'loading' && <p role="status" className="text-xs text-purple-200">{t('drops.probe.loading')}</p>}
              {drops.claimingId && <p role="status" className="text-xs text-purple-200">{t('drops.probe.confirming')}</p>}
              {drops.claimOutcome && <p role="status" className="text-xs text-emerald-300">{t(drops.claimOutcome === 'claimed' ? 'drops.probe.claimed' : 'drops.probe.alreadyClaimed')}</p>}
              <DropsCampaignBrowser key={drops.session} campaigns={drops.campaigns} lastUpdatedAt={drops.updatedAt}
                initialFilter="available" claimingIds={new Set(drops.claimingId ? [drops.claimingId] : [])}
                claimDisabled={busy || drops.claimBlocked || drops.phase !== 'ready'} claimDrop={drops.claimDrop} />
            </>}
      </div>}
    </div>
  </div>
}
