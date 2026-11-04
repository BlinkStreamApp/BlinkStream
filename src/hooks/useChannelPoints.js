import { useState, useEffect, useCallback, useRef } from 'react'
import { getCustomRewards, getCustomRewardsGQL, redeemCustomReward } from '../utils/twitch'
import { t } from '../utils/i18n'

const rewardsCache = new Map()

export function useChannelPoints({ broadcasterId, userToken, userId, channel, cacheTtlMs = 5 * 60 * 1000 } = {}) {
  const scope = JSON.stringify([userId || null, Boolean(userToken), broadcasterId || null, channel || null])
  const cacheKey = userId && userToken ? scope : null
  const requestRef = useRef(0)
  const [state, setState] = useState({ scope, rewards: [], balance: null, loading: false, error: null })
  const fetchRewards = useCallback(async (force = false) => {
    const request = ++requestRef.current
    const empty = { scope, rewards: [], balance: null, loading: false, error: null }
    if (!broadcasterId && !channel) { setState(empty); return }
    if (force && cacheKey) rewardsCache.delete(cacheKey)
    const cached = cacheKey && rewardsCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < cacheTtlMs) {
      setState({ ...empty, rewards: cached.data, balance: cached.balance ?? null })
      return
    }
    setState({ ...empty, loading: true })
    try {
      const res = await (channel ? getCustomRewardsGQL(channel, userToken) : getCustomRewards(broadcasterId, userToken))
      if (request !== requestRef.current) return
      if (!res.ok) {
        setState({ ...empty, error: res.error || t('cp.official.catalogFailed') })
        return
      }
      if (cacheKey) {
        if (rewardsCache.size >= 100) rewardsCache.delete(rewardsCache.keys().next().value)
        rewardsCache.set(cacheKey, { ts: Date.now(), data: res.data, balance: res.balance })
      }
      setState({ ...empty, rewards: res.data, balance: res.balance ?? null })
    } catch {
      if (request === requestRef.current) setState({ ...empty, error: t('cp.official.catalogFailed') })
    }
  }, [broadcasterId, channel, userToken, scope, cacheKey, cacheTtlMs])

  const refresh = useCallback(() => fetchRewards(true), [fetchRewards])
  // Legacy callers receive an explicit refusal; no viewer redemption HTTP request is sent.
  const redeem = useCallback(() => redeemCustomReward(), [])

  useEffect(() => {
    if (!userToken) rewardsCache.clear()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRewards()
    return () => { requestRef.current += 1 }
  }, [fetchRewards, userToken])

  const current = state.scope === scope ? state : { rewards: [], balance: null, error: null, loading: Boolean(broadcasterId || channel) }
  return { rewards: current.rewards, balance: current.balance, loading: current.loading, error: current.error, refresh, redeem }
}

export function __clearRewardsCache() { rewardsCache.clear() }
