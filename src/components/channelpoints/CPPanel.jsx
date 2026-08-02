/**
 * @file Panel lateral de Channel Points (P1 + P2 / WT-20260628-14).
 * Drawer derecho 360px, animacion slide-in 240ms, tabs segun broadcaster/viewer.
 *
 * @typedef {object} CPPanelProps
 * @property {boolean} open
 * @property {() => void} onClose
 * @property {string|null} channel              - login del canal
 * @property {string|null} broadcasterId        - broadcaster_id (para manage tab)
 * @property {string|null} userId               - user_id del viewer (para myRedemptions)
 * @property {string|null} userToken            - OAuth token del viewer
 * @property {boolean} isBroadcaster            - el viewer es el broadcaster del canal actual
 * @property {() => Promise<object>} useRewardsHook    - factory de useChannelPoints
 * @property {() => object} useManageHook              - factory de useManageRewards
 */

import { useState, useEffect, useMemo } from 'react'
import { t } from '../../utils/i18n'
import { useChannelPoints } from '../../hooks/useChannelPoints'
import { useManageRewards } from '../../hooks/useManageRewards'
import RewardCard from './RewardCard'
import RedeemModal from './RedeemModal'
import MyRedemptions from './MyRedemptions'
import ManageRewards from './ManageRewards'
import RewardForm from './RewardForm'
import PendingRedemptions from './PendingRedemptions'
import PhosphorIcon from '../icons/PhosphorIcon'

const PANEL_WIDTH = 380

function CloseIcon() {
  return <PhosphorIcon name="X" size={18} weight="bold" />
}

function CoinsIcon() {
  return <PhosphorIcon name="Coins" size={18} weight="duotone" />
}

export default function CPPanel({ open, onClose, channel, broadcasterId, userId, userToken, isBroadcaster }) {
  // ── Hooks (siempre se llaman en el mismo orden, incluso si no
  //    hay canal: asi evitamos violation of rules of hooks).
  const viewer = useChannelPoints({
    broadcasterId: isBroadcaster ? null : broadcasterId, // si es broadcaster, NO usamos viewer hook (lo gestiona el manage)
    userToken,
    userId,
    channel,
  })

  const manage = useManageRewards({
    broadcasterId: isBroadcaster ? broadcasterId : null,
    token: userToken,
  })

  // Tab activa. Si no es broadcaster, no puede ir a manage.
  const [tab, setTab] = useState(isBroadcaster ? 'manage' : 'rewards')
  useEffect(() => {
    // Corregir tab si el usuario pierde permisos de broadcaster.
    // setState en effect: estado UI derivado de isBroadcaster.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isBroadcaster && tab === 'manage') setTab('rewards')
  }, [isBroadcaster, tab])

  // Modal states
  const [selectedReward, setSelectedReward] = useState(null)
  const [redeemStatus, setRedeemStatus] = useState({ submitting: false, error: null, success: false })
  const [showRewardForm, setShowRewardForm] = useState(false)
  const [editingReward, setEditingReward] = useState(null)

  // Persistencia: si reabre el panel, restaura el tab.
  useEffect(() => {
    if (open) {
      try {
        const saved = localStorage.getItem('bs.cpPanel.tab')
        if (saved && (saved !== 'manage' || isBroadcaster)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setTab(saved)
        }
      } catch { /* ignore */ }
    }
  }, [open, isBroadcaster])

  useEffect(() => {
    try { localStorage.setItem('bs.cpPanel.tab', tab) } catch { /* ignore */ }
  }, [tab])

  // Escape cierra el panel
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.code === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // ── Handlers ──
  const handleRedeem = async (rewardId, userInput) => {
    setRedeemStatus({ submitting: true, error: null, success: false })
    const res = await viewer.redeem(rewardId, userInput)
    if (res.ok) {
      setRedeemStatus({ submitting: false, error: null, success: true })
    } else {
      setRedeemStatus({ submitting: false, error: res.error, success: false })
    }
    return res
  }

  const handleCloseRedeem = () => {
    setSelectedReward(null)
    setRedeemStatus({ submitting: false, error: null, success: false })
  }

  const handleNewReward = () => {
    setEditingReward(null)
    setShowRewardForm(true)
  }

  const handleEditReward = (reward) => {
    setEditingReward(reward)
    setShowRewardForm(true)
  }

  const handleSaveReward = async (data) => {
    if (editingReward) {
      return await manage.updateReward(editingReward.id, data)
    }
    return await manage.createReward(data)
  }

  // Lista de rewards a mostrar (la fuente depende del tab)
  const rewardsList = useMemo(() => {
    if (isBroadcaster) {
      // Para manage tab, mostramos los del broadcaster
      if (tab === 'rewards') return viewer.rewards
      return manage.rewards
    }
    return viewer.rewards
  }, [isBroadcaster, tab, viewer.rewards, manage.rewards])

  if (!broadcasterId) return null

  return (
    <>
      {/* Backdrop clickeable */}
      {open && (
        <div
          className="fixed inset-0 z-[99998] bg-black/30 backdrop-blur-sm animate-fade-in"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <aside
        className={`fixed top-0 right-0 h-full z-[99999] bg-bg-secondary border-l border-bg-tertiary/40 shadow-2xl flex flex-col
          transition-transform duration-240 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ width: PANEL_WIDTH, transitionDuration: '240ms' }}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bg-tertiary/40 shrink-0">
          <div className="flex items-center gap-2">
            <CoinsIcon />
            <div>
              <h2 className="text-[13px] font-bold text-text-primary leading-none">
                Channel Points
              </h2>
              {channel && (
                <p className="text-[10px] text-text-muted mt-0.5">@{channel}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer"
            title="Cerrar"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Balance / Catálogo Informativo (solo viewer) */}
        {!isBroadcaster && (
          <div className="px-4 py-3 bg-gradient-to-r from-twitch/15 via-purple-500/10 to-transparent border-b border-twitch/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-twitch/20 flex items-center justify-center text-twitch">
                  <CoinsIcon />
                </div>
                <span className="text-[12px] font-semibold text-text-primary">
                  {viewer.balance == null ? t('cp.balance.catalog') : t('cp.balance.estimated')}
                </span>
              </div>
              {viewer.balance != null ? (
                <span
                  className="text-[14px] font-extrabold text-yellow-400 font-mono tracking-tight drop-shadow-sm"
                  title="Saldo sincronizado con Twitch"
                >
                  {viewer.balance.toLocaleString('es-ES')}
                </span>
              ) : (
                <span
                  className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-twitch/20 text-twitch border border-twitch/30"
                  title="Por política de Twitch, tu saldo no se expone a apps de terceros por API pública."
                >
                  {t('cp.balance.private')}
                </span>
              )}
            </div>
            <p className="text-[11px] text-text-muted/90 mt-2.5 leading-relaxed bg-bg-secondary/70 p-2.5 rounded-lg border border-bg-tertiary/40 backdrop-blur-sm shadow-inner">
              {viewer.balance == null ? t('cp.balance.disclaimer_private') : t('cp.balance.disclaimer')}
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-bg-tertiary/40 shrink-0">
          <button
            onClick={() => setTab('rewards')}
            className={`flex-1 px-3 py-2.5 text-[12px] font-medium cursor-pointer transition-colors ${
              tab === 'rewards' ? 'text-twitch border-b-2 border-twitch' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {t('cp.tab.rewards')}
          </button>
          <button
            onClick={() => setTab('mine')}
            className={`flex-1 px-3 py-2.5 text-[12px] font-medium cursor-pointer transition-colors ${
              tab === 'mine' ? 'text-twitch border-b-2 border-twitch' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {t('cp.tab.myRedemptions')}
          </button>
          {isBroadcaster && (
            <button
              onClick={() => setTab('manage')}
              className={`flex-1 px-3 py-2.5 text-[12px] font-medium cursor-pointer transition-colors ${
                tab === 'manage' ? 'text-twitch border-b-2 border-twitch' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {t('cp.tab.manage')}
              {manage.pendingRedemptions.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {manage.pendingRedemptions.length}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'rewards' && (
            <div className="space-y-3">
              {viewer.error && (
                <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 font-mono break-all">
                  <div className="font-bold mb-1">Error:</div>
                  <div>{viewer.error}</div>
                  <div className="text-[10px] text-red-400/60 mt-1">Ctrl+Shift+I para más detalles</div>
                </div>
              )}
              {viewer.loading && viewer.rewards.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-twitch border-t-transparent rounded-full animate-spin" />
                </div>
              ) : rewardsList.length === 0 ? (
                <div className="text-center py-8 text-text-muted text-[12px]">
                  {t('cp.empty.rewards')}
                </div>
              ) : (
                rewardsList.map((r) => (
                  <RewardCard
                    key={r.id}
                    reward={r}
                    userBalance={viewer.balance}
                    onClick={() => setSelectedReward(r)}
                  />
                ))
              )}
            </div>
          )}

          {tab === 'mine' && (
            <MyRedemptions
              redemptions={viewer.myRedemptions}
              loading={viewer.loading}
              error={viewer.error}
              onRefresh={viewer.refresh}
            />
          )}

          {tab === 'manage' && isBroadcaster && (
            <div className="space-y-5">
              {/* Pending redemptions (top) */}
              {manage.pendingRedemptions.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-2">
                    Pendientes ({manage.pendingRedemptions.length})
                  </h3>
                  <PendingRedemptions
                    redemptions={manage.pendingRedemptions}
                    loading={manage.loading}
                    error={manage.error}
                    onFulfill={manage.fulfillRedemption}
                    onCancel={manage.cancelRedemption}
                    onBulkFulfill={manage.bulkFulfill}
                    onBulkCancel={manage.bulkCancel}
                    onRefresh={manage.refresh}
                  />
                </section>
              )}

              {/* Rewards table */}
              <section>
                <h3 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-2">
                  Recompensas
                </h3>
                <ManageRewards
                  rewards={manage.rewards}
                  loading={manage.loading}
                  error={manage.error}
                  onRefresh={manage.refresh}
                  onNewReward={handleNewReward}
                  onEdit={handleEditReward}
                  onToggle={manage.toggleReward}
                  onArchive={manage.archiveReward}
                />
              </section>
            </div>
          )}
        </div>
      </aside>

      {/* Modals */}
      {selectedReward && (
        <RedeemModal
          reward={selectedReward}
          userBalance={viewer.balance}
          submitting={redeemStatus.submitting}
          error={redeemStatus.error}
          success={redeemStatus.success}
          onRedeem={handleRedeem}
          onClose={handleCloseRedeem}
        />
      )}

      {showRewardForm && (
        <RewardForm
          initial={editingReward}
          saving={manage.loading}
          onSave={async (data) => {
            const res = await handleSaveReward(data)
            if (res.ok) setShowRewardForm(false)
            return res
          }}
          onCancel={() => {
            setShowRewardForm(false)
            setEditingReward(null)
          }}
        />
      )}
    </>
  )
}
