

import { useState, useEffect, useCallback } from 'react'
import { useChannelRole } from '../../hooks/useChannelRole'
import { useModeration } from '../../hooks/useModeration'
import { getModerators, getVips, getBannedUsers, getTimeouts } from '../../utils/twitch'
import { ViewerList } from './ViewerList'
import { ModList } from './ModList'
import { VipList } from './VipList'
import { BanList } from './BanList'
import { TimeoutList } from './TimeoutList'
import { ChatSettings } from './ChatSettings'
import { ActionModal } from './ActionModal'
import PhosphorIcon from '../icons/PhosphorIcon'

const TABS = [
  { id: 'viewers', label: 'VIEWERS' },
  { id: 'mods', label: 'MODS' },
  { id: 'vips', label: 'VIPS' },
  { id: 'bans', label: 'BANS' },
  { id: 'timeouts', label: 'TIMEOUTS' },
  { id: 'settings', label: 'SETTINGS' },
]
const LS_TAB = 'bs.modPanel.tab'

export function ModPanel({ open, onClose, broadcasterId, userId, channel, initialTarget, onExecuteAction, onPromoteAction }) {
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem(LS_TAB) || 'viewers' } catch { return 'viewers' }
  })

  const roleState = useChannelRole({ broadcasterId, userId, channel })
  const modState = useModeration({ broadcasterId, userId })

  const [mods, setMods] = useState([])
  const [vips, setVips] = useState([])
  const [bans, setBans] = useState([])
  const [timeouts, setTimeouts] = useState([])
  const [loadingList, setLoadingList] = useState({ viewers: false, mods: false, vips: false, bans: false, timeouts: false })

  const [modal, setModal] = useState(null) 

  useEffect(() => {
    try { localStorage.setItem(LS_TAB, activeTab) } catch {  }
  }, [activeTab])

  useEffect(() => {
    if (initialTarget && open) {

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModal({ action: 'ban', target: initialTarget })
    }
  }, [initialTarget, open])

  const loadMods = useCallback(async () => {
    if (!broadcasterId) return
    setLoadingList(s => ({ ...s, mods: true }))
    const r = await getModerators(broadcasterId)
    if (r.success) setMods(r.value)
    setLoadingList(s => ({ ...s, mods: false }))
  }, [broadcasterId])

  const loadVips = useCallback(async () => {
    if (!broadcasterId) return
    setLoadingList(s => ({ ...s, vips: true }))
    const r = await getVips(broadcasterId)
    if (r.success) setVips(r.value)
    setLoadingList(s => ({ ...s, vips: false }))
  }, [broadcasterId])

  const loadBans = useCallback(async () => {
    if (!broadcasterId) return
    setLoadingList(s => ({ ...s, bans: true }))
    const r = await getBannedUsers(broadcasterId, 'permanent')
    if (r.success) setBans(r.value)
    setLoadingList(s => ({ ...s, bans: false }))
  }, [broadcasterId])

  const loadTimeouts = useCallback(async () => {
    if (!broadcasterId) return
    setLoadingList(s => ({ ...s, timeouts: true }))
    const r = await getTimeouts(broadcasterId)
    if (r.success) setTimeouts(r.value)
    setLoadingList(s => ({ ...s, timeouts: false }))
  }, [broadcasterId])

  useEffect(() => {
    if (!open) return

    if (activeTab === 'mods') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadMods()
    }
    else if (activeTab === 'vips') {

      loadVips()
    }
    else if (activeTab === 'bans') {

      loadBans()
    }
    else if (activeTab === 'timeouts') {

      loadTimeouts()
    }

  }, [activeTab, open, loadMods, loadVips, loadBans, loadTimeouts])

  const refreshLists = useCallback(() => {
    if (activeTab === 'mods') loadMods()
    else if (activeTab === 'vips') loadVips()
    else if (activeTab === 'bans') loadBans()
    else if (activeTab === 'timeouts') loadTimeouts()
  }, [activeTab, loadMods, loadVips, loadBans, loadTimeouts])

  const handleConfirm = useCallback(async ({ reason, duration }) => {
    if (!modal) return
    const { action, target } = modal
    let ok = false
    if (action === 'ban') ok = await modState.ban(target.user_id, target.user_login, reason)
    else if (action === 'unban') ok = await modState.unban(target.user_id, target.user_login)
    else if (action === 'timeout') ok = await modState.timeout(target.user_id, target.user_login, duration, reason)
    else if (action === 'untimeout') ok = await modState.untimeout(target.user_id, target.user_login)
    else if (action === 'mod' && onPromoteAction) ok = await onPromoteAction('mod', target)
    else if (action === 'unmod' && onPromoteAction) ok = await onPromoteAction('unmod', target)
    else if (action === 'vip' && onPromoteAction) ok = await onPromoteAction('vip', target)
    else if (action === 'unvip' && onPromoteAction) ok = await onPromoteAction('unvip', target)

    if (ok) {
      setModal(null)
      refreshLists()
    }
  }, [modal, modState, onPromoteAction, refreshLists])

  const mockViewers = [] 

  if (!open) return null
  if (!roleState.isModerator) {
    return (
      <div className="fixed right-0 top-0 bottom-0 z-[99999] w-80 bg-bg-secondary/95 border-l border-bg-tertiary/60 shadow-2xl animate-slide-in-right p-4 flex flex-col">
        <p className="text-sm text-text-primary mb-2">Panel de moderación</p>
        <p className="text-[11px] text-text-muted/80 leading-relaxed">
          {roleState.loading
            ? 'Verificando permisos...'
            : roleState.error
              ? 'No pudimos verificar tu rol. Reintenta abrir el panel.'
              : 'No tienes permisos de moderador en este canal.'}
        </p>
        <button onClick={onClose} className="mt-auto text-[11px] text-text-muted hover:text-text-primary self-start cursor-pointer">Cerrar</button>
      </div>
    )
  }

  const roleLabel = roleState.role === 'broadcaster' ? 'BROADCASTER'
    : roleState.role === 'mod' ? 'MOD'
    : roleState.role === 'vip' ? 'VIP'
    : 'VIEWER'
  const roleColor = roleState.role === 'broadcaster' ? 'bg-twitch text-white'
    : roleState.role === 'mod' ? 'bg-green-500/20 text-green-400'
    : roleState.role === 'vip' ? 'bg-pink-500/20 text-pink-400'
    : 'bg-bg-tertiary text-text-muted'

  return (
    <>
      <div className="fixed right-0 top-0 bottom-0 z-[99999] w-80 bg-bg-secondary/95 backdrop-blur-md border-l border-bg-tertiary/60 shadow-2xl flex flex-col animate-slide-in-right" style={{ animationDuration: '240ms' }}>
        {}
        <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-bg-tertiary/50">
          <div className="w-8 h-8 rounded-full bg-twitch/20 flex items-center justify-center overflow-hidden shrink-0">
            <span className="text-twitch text-[12px] font-bold">{channel?.charAt(0).toUpperCase() || '?'}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-text-primary truncate">{channel || '—'}</p>
            <p className="text-[9px] text-text-muted/70">Moderación</p>
          </div>
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${roleColor}`}>
            {roleLabel}
          </span>
          <button onClick={onClose} className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer" title="Cerrar">
            <PhosphorIcon name="X" size={14} weight="bold" />
          </button>
        </div>

        {}
        <div className="shrink-0 flex border-b border-bg-tertiary/40 px-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`shrink-0 text-[10px] font-semibold px-2 py-2 cursor-pointer transition-colors relative ${
                activeTab === t.id ? 'text-twitch' : 'text-text-muted/70 hover:text-text-secondary'
              }`}
            >
              {t.label}
              {activeTab === t.id && <span className="absolute left-1 right-1 bottom-0 h-0.5 bg-twitch rounded-t" />}
            </button>
          ))}
        </div>

        {}
        {modState.isRateLimited && (
          <div className="shrink-0 px-3 py-1.5 bg-orange-500/10 border-b border-orange-500/20 text-[10px] text-orange-400">
            ⏸ Rate limit: demasiadas acciones. Espera unos segundos.
          </div>
        )}

        {}
        <div className="flex-1 min-h-0">
          {activeTab === 'viewers' && (
            <ViewerList viewers={mockViewers} onAction={(v) => setModal({ action: 'ban', target: v })} loading={false} />
          )}
          {activeTab === 'mods' && (
            <ModList mods={mods} isBroadcaster={roleState.isBroadcaster} loading={loadingList.mods}
              onUnmod={(m) => setModal({ action: 'unmod', target: m })} />
          )}
          {activeTab === 'vips' && (
            <VipList vips={vips} isBroadcaster={roleState.isBroadcaster} loading={loadingList.vips}
              onUnvip={(v) => setModal({ action: 'unvip', target: v })} />
          )}
          {activeTab === 'bans' && (
            <BanList bans={bans} loading={loadingList.bans}
              onUnban={(b) => setModal({ action: 'unban', target: b })} />
          )}
          {activeTab === 'timeouts' && (
            <TimeoutList timeouts={timeouts} loading={loadingList.timeouts}
              onUntimeout={(t) => setModal({ action: 'untimeout', target: t })} />
          )}
          {activeTab === 'settings' && (
            <ChatSettings
              isModerator={roleState.isModerator}
              activeModes={{}}
              onSetMode={async (mode) => {
                await modState.setChatMode(mode)
                onExecuteAction?.(null, mode)
              }}
            />
          )}
        </div>

        {}
        <div className="shrink-0 px-3 py-1.5 border-t border-bg-tertiary/40 text-[9px] text-text-muted/60 flex items-center justify-between">
          <span>Acciones restantes: {modState.remainingActions}</span>
          {modState.auditLog.length > 0 && <span>Audit: {modState.auditLog.length}</span>}
        </div>
      </div>

      {modal && (
        <ActionModal
          open={!!modal}
          onClose={() => setModal(null)}
          onConfirm={handleConfirm}
          action={modal.action}
          targetUser={modal.target}
          busy={modState.isRateLimited}
        />
      )}
    </>
  )
}

export default ModPanel
