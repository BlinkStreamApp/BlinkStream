

import { useState, useEffect, useCallback, useRef } from 'react'
import { logError } from '../utils/errors'
import { logEvent } from '../utils/eventLog'
import { startRewardEventSub } from '../utils/twitchEventSub'
import {
  getCustomRewards,
  getCustomRewardsGQL,
  createCustomReward,
  updateCustomReward,
  deleteCustomReward,
  getRedemptions,
  updateRedemptionStatus,
} from '../utils/twitch'

const PENDING_STATUS = 'UNFULFILLED'

export function useManageRewards({ broadcasterId, channel, token, pollIntervalMs = 15000 } = {}) {
  const [rewards, setRewards] = useState([])
  const [pendingRedemptions, setPendingRedemptions] = useState([])
  const [fulfilledRedemptions, setFulfilledRedemptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [realtime, setRealtime] = useState({ state: 'idle', message: '' })
  const liveRedemptionsRef = useRef(new Map())
  const timerRef = useRef(null)
  const cancelledRef = useRef(false)
  const generationRef = useRef(0)

  const effectiveToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('blinkstream_twitch_token') : null)

  useEffect(() => {
    const generation = ++generationRef.current
    liveRedemptionsRef.current.clear()
    return () => {
      generationRef.current = generation + 1
    }
  }, [broadcasterId, effectiveToken])

  const rewardsRef = useRef([])
  useEffect(() => {
    rewardsRef.current = rewards
  }, [rewards])

  const applyRedemption = useCallback((rd) => {
    liveRedemptionsRef.current.set(rd.id, rd)
    if (liveRedemptionsRef.current.size > 500) {
      liveRedemptionsRef.current.delete(liveRedemptionsRef.current.keys().next().value)
    }
    const updateList = (previous, status) => (
      rd.status === status ? [rd, ...previous.filter(item => item.id !== rd.id)] : previous.filter(item => item.id !== rd.id)
    ).slice(0, 500)
    setPendingRedemptions(previous => updateList(previous, PENDING_STATUS))
    setFulfilledRedemptions(previous => updateList(previous, 'FULFILLED'))
  }, [])

  const fetchRewards = useCallback(async () => {
    const generation = generationRef.current
    if (!broadcasterId) {
      setRewards([])
      return []
    }
    let res = await getCustomRewards(broadcasterId, ...(effectiveToken ? [effectiveToken] : []))
    if (cancelledRef.current || generation !== generationRef.current) return []
    if (!res.ok || !res.data || res.data.length === 0) {
      if (channel) {
        const gqlRes = await getCustomRewardsGQL(channel, effectiveToken)
        if (gqlRes.ok && gqlRes.data?.length > 0) {
          res = gqlRes
        }
      }
    }
    if (cancelledRef.current || generation !== generationRef.current) return []
    if (res.ok) {
      setRewards(res.data || [])
      return res.data || []
    }
    setError(res.error || 'Error cargando recompensas')
    return []
  }, [broadcasterId, channel, effectiveToken])

  const helixForbiddenRef = useRef(false)
  useEffect(() => {
    helixForbiddenRef.current = false
  }, [broadcasterId, effectiveToken])

  const fetchRedemptions = useCallback(async (rewardsList) => {
    const generation = generationRef.current
    const list = rewardsList || []
    if (!broadcasterId || list.length === 0 || helixForbiddenRef.current) {
      return
    }

    const [pendingResults, fulfilledResults] = await Promise.all([
      Promise.allSettled(
        list.map(r => getRedemptions(broadcasterId, r.id, PENDING_STATUS, effectiveToken, undefined, 50))
      ),
      Promise.allSettled(
        list.map(r => getRedemptions(broadcasterId, r.id, 'FULFILLED', effectiveToken, undefined, 20))
      ),
    ])

    if (cancelledRef.current || generation !== generationRef.current) return

    const isForbidden = pendingResults.some(r => r.status === 'fulfilled' && (r.value?.error?.includes?.('403') || r.value?.code === 'FORBIDDEN')) ||
      fulfilledResults.some(r => r.status === 'fulfilled' && (r.value?.error?.includes?.('403') || r.value?.code === 'FORBIDDEN'))
    if (isForbidden) {
      helixForbiddenRef.current = true
    }

    const pendingAll = []
    pendingResults.forEach((settled, i) => {
      if (settled.status === 'fulfilled' && settled.value?.ok && settled.value.data?.data) {
        pendingAll.push(...settled.value.data.data.map(rd => ({
          ...rd,
          reward_title: list[i]?.title || rd.reward?.title,
          cost: list[i]?.cost || rd.reward?.cost || 0,
        })))
      }
    })
    pendingAll.sort((a, b) => new Date(b.redeemed_at) - new Date(a.redeemed_at))
    const liveIds = liveRedemptionsRef.current
    setPendingRedemptions([
      ...pendingAll.filter(rd => !liveIds.has(rd.id)),
      ...[...liveIds.values()].filter(rd => rd.status === PENDING_STATUS),
    ].sort((a, b) => new Date(b.redeemed_at) - new Date(a.redeemed_at)).slice(0, 500))

    const fulfilledAll = []
    fulfilledResults.forEach((settled, i) => {
      if (settled.status === 'fulfilled' && settled.value?.ok && settled.value.data?.data) {
        fulfilledAll.push(...settled.value.data.data.map(rd => ({
          ...rd,
          reward_title: list[i]?.title || rd.reward?.title,
          cost: list[i]?.cost || rd.reward?.cost || 0,
        })))
      }
    })
    fulfilledAll.sort((a, b) => new Date(b.redeemed_at) - new Date(a.redeemed_at))
    setFulfilledRedemptions([
      ...fulfilledAll.filter(rd => !liveIds.has(rd.id)),
      ...[...liveIds.values()].filter(rd => rd.status === 'FULFILLED'),
    ].sort((a, b) => new Date(b.redeemed_at) - new Date(a.redeemed_at)).slice(0, 500))
  }, [broadcasterId, effectiveToken])

  const refresh = useCallback(async () => {
    const generation = generationRef.current
    setLoading(true)
    setError(null)
    try {
      const fresh = await fetchRewards()
      if (cancelledRef.current || generation !== generationRef.current) return
      await fetchRedemptions(fresh)
    } finally {
      if (!cancelledRef.current && generation === generationRef.current) setLoading(false)
    }
  }, [fetchRewards, fetchRedemptions])

  useEffect(() => {
    if (!broadcasterId || pollIntervalMs <= 0) return
    cancelledRef.current = false
    const tick = async () => {
      if (cancelledRef.current) return
      await fetchRedemptions(rewardsRef.current)
      if (cancelledRef.current) return
      timerRef.current = setTimeout(tick, pollIntervalMs)
    }
    timerRef.current = setTimeout(tick, pollIntervalMs)
    return () => {
      cancelledRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [broadcasterId, pollIntervalMs, fetchRedemptions])

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      cancelledRef.current = false
      refresh()
    }, 0)
    return () => {
      window.clearTimeout(refreshTimer)
      cancelledRef.current = true
    }
  }, [broadcasterId, refresh])

  // EventSub is available only with the broadcaster's authorization.
  useEffect(() => {
    if (!broadcasterId) return
    return startRewardEventSub({
      broadcasterId,
      token: effectiveToken,
      onStatus: setRealtime,
      onRedemption: (rd, isNew) => {
        applyRedemption(rd)
        if (isNew) {
          window.dispatchEvent(new CustomEvent('bs:reward-redemption', {
            detail: {
              id: rd.id, broadcaster_id: String(broadcasterId), eventType: 'reward', isReward: true,
              user: rd.user_name || rd.user_login, user_id: rd.user_id,
              reward_title: rd.reward_title, cost: rd.cost,
              eventHeader: `🎁 ${rd.user_name || rd.user_login} ha canjeado ${rd.reward_title} (${rd.cost} pts)`,
              message: rd.user_input || '', text: rd.user_input || '',
              timestamp: new Date(rd.redeemed_at).getTime() || Date.now(),
            },
          }))
        }
      },
    })
  }, [broadcasterId, effectiveToken, applyRedemption])

  const createReward = useCallback(async (data) => {
    if (!broadcasterId) return { ok: false, error: 'No hay broadcaster activo' }
    const res = await createCustomReward(broadcasterId, data, ...(effectiveToken ? [effectiveToken] : []))
    if (res.ok) {
      setRewards(prev => [...prev, res.data])
      return { ok: true, data: res.data }
    }
    logError(new Error(res.error || 'create failed'), { context: 'useManageRewards', action: 'createReward' })
    return { ok: false, error: res.error }
  }, [broadcasterId, effectiveToken])

  const updateReward = useCallback(async (id, data) => {
    if (!broadcasterId) return { ok: false, error: 'No hay broadcaster activo' }
    const res = await updateCustomReward(broadcasterId, id, data, ...(effectiveToken ? [effectiveToken] : []))
    if (res.ok) {
      setRewards(prev => prev.map(r => r.id === id ? { ...r, ...res.data } : r))
      return { ok: true, data: res.data }
    }
    logError(new Error(res.error || 'update failed'), { context: 'useManageRewards', action: 'updateReward' })
    return { ok: false, error: res.error }
  }, [broadcasterId, effectiveToken])

  const toggleReward = useCallback(async (id, isEnabled) => {
    return updateReward(id, { is_enabled: isEnabled })
  }, [updateReward])

  const archiveReward = useCallback(async (id) => {
    if (!broadcasterId) return { ok: false, error: 'No hay broadcaster activo' }
    const res = await deleteCustomReward(broadcasterId, id, ...(effectiveToken ? [effectiveToken] : []))
    if (res.ok) {
      setRewards(prev => prev.filter(r => r.id !== id))
      setPendingRedemptions(prev => prev.filter(rd => rd.reward_id !== id))
      return { ok: true }
    }
    logError(new Error(res.error || 'delete failed'), { context: 'useManageRewards', action: 'archiveReward' })
    return { ok: false, error: res.error }
  }, [broadcasterId, effectiveToken])

  const fulfillRedemption = useCallback(async (id) => {
    const pending = pendingRedemptions.find(p => p.id === id)
    if (!broadcasterId || !pending) return { ok: false, error: 'Redencion no encontrada' }
    const res = await updateRedemptionStatus(broadcasterId, pending.reward_id, [id], 'FULFILLED', ...(effectiveToken ? [effectiveToken] : []))
    if (res.ok) {
      applyRedemption({ ...pending, status: 'FULFILLED' })
      logEvent('channel_points', 'redemption.fulfilled', { broadcasterId, rewardId: pending.reward_id })
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }, [broadcasterId, pendingRedemptions, effectiveToken, applyRedemption])

  const cancelRedemption = useCallback(async (id, _reason) => {
    void _reason
    const pending = pendingRedemptions.find(p => p.id === id)
    if (!broadcasterId || !pending) return { ok: false, error: 'Redencion no encontrada' }
    const res = await updateRedemptionStatus(broadcasterId, pending.reward_id, [id], 'CANCELED', ...(effectiveToken ? [effectiveToken] : []))
    if (res.ok) {
      applyRedemption({ ...pending, status: 'CANCELED' })
      logEvent('channel_points', 'redemption.canceled', { broadcasterId, rewardId: pending.reward_id })
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }, [broadcasterId, pendingRedemptions, effectiveToken, applyRedemption])

  const bulkFulfill = useCallback(async (ids) => {
    if (!broadcasterId || ids.length === 0) return { ok: true }
    const byReward = new Map()
    pendingRedemptions.forEach(p => {
      if (ids.includes(p.id)) {
        if (!byReward.has(p.reward_id)) byReward.set(p.reward_id, [])
        byReward.get(p.reward_id).push(p.id)
      }
    })
    const results = await Promise.all(
      [...byReward.entries()].map(([rewardId, rids]) =>
        updateRedemptionStatus(broadcasterId, rewardId, rids, 'FULFILLED', ...(effectiveToken ? [effectiveToken] : []))
      )
    )
    const allOk = results.every(r => r.ok)
    if (allOk) {
      pendingRedemptions.filter(p => ids.includes(p.id)).forEach(p => applyRedemption({ ...p, status: 'FULFILLED' }))
      logEvent('channel_points', 'redemption.bulkFulfilled', { broadcasterId, count: ids.length })
      return { ok: true }
    }
    const firstErr = results.find(r => !r.ok)
    return { ok: false, error: firstErr?.error }
  }, [broadcasterId, pendingRedemptions, effectiveToken, applyRedemption])

  const bulkCancel = useCallback(async (ids) => {
    if (!broadcasterId || ids.length === 0) return { ok: true }
    const byReward = new Map()
    pendingRedemptions.forEach(p => {
      if (ids.includes(p.id)) {
        if (!byReward.has(p.reward_id)) byReward.set(p.reward_id, [])
        byReward.get(p.reward_id).push(p.id)
      }
    })
    const results = await Promise.all(
      [...byReward.entries()].map(([rewardId, rids]) =>
        updateRedemptionStatus(broadcasterId, rewardId, rids, 'CANCELED', ...(effectiveToken ? [effectiveToken] : []))
      )
    )
    const allOk = results.every(r => r.ok)
    if (allOk) {
      pendingRedemptions.filter(p => ids.includes(p.id)).forEach(p => applyRedemption({ ...p, status: 'CANCELED' }))
      logEvent('channel_points', 'redemption.bulkCanceled', { broadcasterId, count: ids.length })
      return { ok: true }
    }
    const firstErr = results.find(r => !r.ok)
    return { ok: false, error: firstErr?.error }
  }, [broadcasterId, pendingRedemptions, effectiveToken, applyRedemption])

  return {
    rewards,
    pendingRedemptions,
    fulfilledRedemptions,
    realtime,
    loading,
    error,
    refresh,
    createReward,
    updateReward,
    toggleReward,
    archiveReward,
    fulfillRedemption,
    cancelRedemption,
    bulkFulfill,
    bulkCancel,
  }
}
