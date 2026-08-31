

import { useState, useEffect, useCallback, useRef } from 'react'
import { logError } from '../utils/errors'
import { logEvent } from '../utils/eventLog'
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
  const timerRef = useRef(null)
  const cancelledRef = useRef(false)

  const effectiveToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('blinkstream_twitch_token') : null)

  const rewardsRef = useRef([])
  useEffect(() => {
    rewardsRef.current = rewards
  }, [rewards])

  const fetchRewards = useCallback(async () => {
    if (!broadcasterId) {
      setRewards([])
      return []
    }
    let res = await getCustomRewards(broadcasterId, ...(effectiveToken ? [effectiveToken] : []))
    if (!res.ok || !res.data || res.data.length === 0) {
      if (channel) {
        const gqlRes = await getCustomRewardsGQL(channel, effectiveToken)
        if (gqlRes.ok && gqlRes.data?.length > 0) {
          res = gqlRes
        }
      }
    }
    if (cancelledRef.current) return []
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

    if (cancelledRef.current) return

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
    setPendingRedemptions(pendingAll)

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
    setFulfilledRedemptions(fulfilledAll)
  }, [broadcasterId, effectiveToken])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const fresh = await fetchRewards()
      if (cancelledRef.current) return
      await fetchRedemptions(fresh)
    } finally {
      if (!cancelledRef.current) setLoading(false)
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

  // Real-time PubSub listener for community-points-channel-v1.<broadcasterId>
  useEffect(() => {
    if (!broadcasterId) return

    let isSubscribed = true
    let ws = null
    let pingTimer = null
    let reconnectTimer = null

    const connectPubSub = () => {
      if (!isSubscribed) return
      try {
        ws = new WebSocket('wss://pubsub-edge.twitch.tv/v1')

        ws.onopen = () => {
          if (!isSubscribed) {
            try { ws.close() } catch { /* ignore */ }
            return
          }
          const cleanToken = (effectiveToken || '').replace(/^oauth:/i, '')
          const listenMsg = {
            type: 'LISTEN',
            nonce: 'bs_cp_' + Math.random().toString(36).slice(2, 10),
            data: {
              topics: [`community-points-channel-v1.${broadcasterId}`],
              auth_token: cleanToken || undefined,
            },
          }
          ws.send(JSON.stringify(listenMsg))

          pingTimer = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'PING' }))
            }
          }, 3.5 * 60 * 1000)
        }

        ws.onmessage = (event) => {
          if (!isSubscribed) return
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'MESSAGE' && data.data?.topic?.startsWith('community-points-channel-v1')) {
              const msgData = typeof data.data.message === 'string' ? JSON.parse(data.data.message) : data.data.message
              if (msgData?.type === 'reward-redeemed' && msgData.data?.redemption) {
                const rd = msgData.data.redemption
                const formattedRd = {
                  id: rd.id,
                  user_name: rd.user?.display_name || rd.user?.login || 'Espectador',
                  user_login: rd.user?.login || '',
                  user_id: rd.user?.id || '',
                  user_input: rd.user_input || '',
                  reward_title: rd.reward?.title || 'Recompensa',
                  cost: rd.reward?.cost || 0,
                  status: rd.status || 'FULFILLED',
                  redeemed_at: rd.redeemed_at || new Date().toISOString(),
                  reward: rd.reward,
                }

                if (formattedRd.status === 'UNFULFILLED') {
                  setPendingRedemptions(prev => [formattedRd, ...prev.filter(p => p.id !== rd.id)])
                } else {
                  setFulfilledRedemptions(prev => [formattedRd, ...prev.filter(p => p.id !== rd.id)])
                }

                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('bs:pubsub-redemption', {
                    detail: {
                      id: rd.id,
                      eventType: 'reward',
                      isReward: true,
                      user: formattedRd.user_name,
                      user_id: formattedRd.user_id,
                      eventHeader: `🎁 ${formattedRd.user_name} ha canjeado ${formattedRd.reward_title} (${formattedRd.cost} pts)`,
                      message: formattedRd.user_input ? `"${formattedRd.user_input}"` : `${formattedRd.reward_title} (Canje de Puntos)`,
                      timestamp: Date.now(),
                    },
                  }))
                }
              }
            }
          } catch {
            // ignore malformed pubsub messages
          }
        }

        ws.onclose = () => {
          if (pingTimer) clearInterval(pingTimer)
          if (isSubscribed) {
            reconnectTimer = setTimeout(connectPubSub, 4000)
          }
        }

        ws.onerror = () => {
          // let onclose handle reconnect
        }
      } catch {
        // fallback
      }
    }

    connectPubSub()

    return () => {
      isSubscribed = false
      if (pingTimer) clearInterval(pingTimer)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) {
        try { ws.close() } catch { /* ignore */ }
      }
    }
  }, [broadcasterId, effectiveToken])

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
      setPendingRedemptions(prev => prev.filter(p => p.id !== id))
      logEvent('channel_points', 'redemption.fulfilled', { broadcasterId, rewardId: pending.reward_id })
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }, [broadcasterId, pendingRedemptions, effectiveToken])

  const cancelRedemption = useCallback(async (id, _reason) => {
    void _reason
    const pending = pendingRedemptions.find(p => p.id === id)
    if (!broadcasterId || !pending) return { ok: false, error: 'Redencion no encontrada' }
    const res = await updateRedemptionStatus(broadcasterId, pending.reward_id, [id], 'CANCELED', ...(effectiveToken ? [effectiveToken] : []))
    if (res.ok) {
      setPendingRedemptions(prev => prev.filter(p => p.id !== id))
      logEvent('channel_points', 'redemption.canceled', { broadcasterId, rewardId: pending.reward_id })
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }, [broadcasterId, pendingRedemptions, effectiveToken])

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
      setPendingRedemptions(prev => prev.filter(p => !ids.includes(p.id)))
      logEvent('channel_points', 'redemption.bulkFulfilled', { broadcasterId, count: ids.length })
      return { ok: true }
    }
    const firstErr = results.find(r => !r.ok)
    return { ok: false, error: firstErr?.error }
  }, [broadcasterId, pendingRedemptions, effectiveToken])

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
      setPendingRedemptions(prev => prev.filter(p => !ids.includes(p.id)))
      logEvent('channel_points', 'redemption.bulkCanceled', { broadcasterId, count: ids.length })
      return { ok: true }
    }
    const firstErr = results.find(r => !r.ok)
    return { ok: false, error: firstErr?.error }
  }, [broadcasterId, pendingRedemptions, effectiveToken])

  return {
    rewards,
    pendingRedemptions,
    fulfilledRedemptions,
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
