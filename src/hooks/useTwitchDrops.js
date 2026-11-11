import { useEffect, useSyncExternalStore } from 'react'
import { bindDropsAccount, checkDropsSession, claimSessionDrop, connectDropsSession,
  disconnectDropsSession, getDropsSnapshot, refreshDropsSession, setDropsAutoClaim, setDropsRemember, subscribeDrops } from '../utils/dropsSession'

export function useTwitchDrops(account) {
  const state = useSyncExternalStore(subscribeDrops, getDropsSnapshot, getDropsSnapshot)
  useEffect(() => { bindDropsAccount(account); void checkDropsSession() }, [account])
  const visible = state.account === String(account || '').trim().toLowerCase() ? state
    : { ...state, session: null, campaigns: [], phase: 'idle', error: null, claimingId: null, claimBlocked: false, claimOutcome: null, updatedAt: null }
  return { ...visible, connect: connectDropsSession, disconnect: disconnectDropsSession,
    setAutoClaim: setDropsAutoClaim, setRemember: setDropsRemember,
    refresh: refreshDropsSession, claimDrop: claimSessionDrop,
    claimableCount: visible.campaigns.reduce((total, campaign) => total + campaign.drops.filter(drop => drop.isReadyToClaim).length, 0) }
}
