import { useEffect, useSyncExternalStore } from 'react'
import { bindDropsAccount, checkDropsSession, getDropsSnapshot, subscribeDrops } from '../utils/dropsSession'
import { getDropsProgress } from '../utils/drops'

export function useDropsProgress(channel, account) {
  const state = useSyncExternalStore(subscribeDrops, getDropsSnapshot, getDropsSnapshot)
  useEffect(() => { bindDropsAccount(account); if (account) void checkDropsSession() }, [account])
  if (!channel || !account || state.account !== String(account).trim().toLowerCase() || !state.session) return null
  return getDropsProgress(state.campaigns)
}
