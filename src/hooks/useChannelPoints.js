

import { useState, useEffect, useCallback, useRef } from 'react'
import { logError } from '../utils/errors'
import { logEvent } from '../utils/eventLog'
import {
  getCustomRewards,
  getCustomRewardsGQL,
  getRedemptions,
  redeemCustomReward,
} from '../utils/twitch'

const _rewardsCache = new Map() 

async function pMap(items, concurrency, fn) {
  const results = new Array(items.length)
  let nextIndex = 0

  const worker = async () => {
    while (true) {
      const i = nextIndex++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }

  const lanes = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: lanes }, () => worker()))
  return results
}

export function useChannelPoints({ broadcasterId, userToken, userId, channel, cacheTtlMs = 5 * 60 * 1000 } = {}) {
  const [rewards, setRewards] = useState([])
  const [myRedemptions, setMyRedemptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [balance, setBalance] = useState(null)
  const cancelledRef = useRef(false)

  const fetchRewards = useCallback(async () => {
    if (!broadcasterId && !channel) {
      setRewards([])
      return
    }
    setLoading(true)
    setError(null)

    const cacheKey = broadcasterId || channel

    const cached = _rewardsCache.get(cacheKey)
    if (cached && (Date.now() - cached.ts) < cacheTtlMs) {
      setRewards(cached.data)
      if (cached.balance !== undefined) setBalance(cached.balance)
      setLoading(false)
      return
    }

    const res = await (channel ? getCustomRewardsGQL(channel, userToken) : getCustomRewards(broadcasterId, userToken))
    if (cancelledRef.current) return
    if (res.ok) {
      _rewardsCache.set(cacheKey, { ts: Date.now(), data: res.data, balance: res.balance })
      setRewards(res.data)
      if (res.balance !== undefined) setBalance(res.balance)
    } else {
      setError(res.error || 'Error cargando recompensas')
      setRewards([])
    }
    setLoading(false)
  }, [broadcasterId, channel, userToken, cacheTtlMs])

  const fetchMyRedemptions = useCallback(async () => {
    if (!broadcasterId || !userId) {
      setMyRedemptions([])
      return
    }

    const rewardsRes = await (channel ? getCustomRewardsGQL(channel, userToken) : getCustomRewards(broadcasterId, userToken))
    if (cancelledRef.current) return
    if (!rewardsRes.ok || rewardsRes.data.length === 0) {
      setMyRedemptions([])
      return
    }

    const targets = rewardsRes.data.slice(0, 5)
    const all = await pMap(targets, 3, async (r) => {
      if (cancelledRef.current) return []
      const res = await getRedemptions(broadcasterId, r.id, 'FULFILLED', userToken || 'viewer', userId, 20)
      if (cancelledRef.current) return []
      if (res.ok && res.data?.data) {
        return res.data.data
      }
      return []
    })

    const flat = all.flat()
    flat.sort((a, b) => new Date(b.redeemed_at) - new Date(a.redeemed_at))
    setMyRedemptions(flat.slice(0, 50))
  }, [broadcasterId, channel, userId, userToken])

  const refresh = useCallback(async () => {

    if (broadcasterId) _rewardsCache.delete(broadcasterId)
    await Promise.all([fetchRewards(), fetchMyRedemptions()])
  }, [broadcasterId, fetchRewards, fetchMyRedemptions])

  const redeem = useCallback(async (rewardId, userInput) => {
    if (!broadcasterId || !userToken) {
      return { ok: false, error: 'No hay sesion o canal activo' }
    }
    const res = await redeemCustomReward(broadcasterId, rewardId, userInput, userToken)
    if (res.ok) {
      logEvent('channel_points', 'reward.redeemed', { broadcasterId, rewardId })
      return { ok: true }
    }
    logError(new Error(res.error || 'redeem failed'), {
      context: 'useChannelPoints', action: 'redeem', broadcasterId, rewardId, code: res.code,
    })
    return { ok: false, error: res.error, code: res.code }
  }, [broadcasterId, userToken])

  useEffect(() => {
    cancelledRef.current = false

    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRewards()

    fetchMyRedemptions()
    return () => { cancelledRef.current = true }
  }, [fetchRewards, fetchMyRedemptions])

  return {
    rewards,
    myRedemptions,
    balance,
    loading,
    error,
    refresh,
    redeem,
  }
}

export function __clearRewardsCache() {
  _rewardsCache.clear()
}
