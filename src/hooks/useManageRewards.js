/**
 * @file Hook para broadcasters/mod de Channel Points (P2 / WT-20260628-14).
 *
 * Maneja la gestion de recompensas + redenciones pendientes para
 * un canal donde el usuario actual es el broadcaster (o moderador
 * con permisos). Auto-refresca las redenciones pendientes cada
 * 30s hasta que se llame a una accion o el componente se desmonte.
 *
 * Acciones expuestas:
 *   - createReward(data)
 *   - updateReward(id, data)
 *   - toggleReward(id, isEnabled)
 *   - archiveReward(id)        -> delete en Twitch (soft)
 *   - fulfillRedemption(id)
 *   - cancelRedemption(id, reason?)
 *   - bulkFulfill(ids)
 *   - bulkCancel(ids)
 *   - refresh()                -> refetch manual
 *
 * @typedef {object} ManageRewardsState
 * @property {Array<object>} rewards
 * @property {Array<object>} pendingRedemptions
 * @property {boolean} loading
 * @property {string|null} error
 * @property {() => Promise<void>} refresh
 * @property {(data: object) => Promise<{ok: boolean, data?: object, error?: string}>} createReward
 * @property {(id: string, data: object) => Promise<{ok: boolean, data?: object, error?: string}>} updateReward
 * @property {(id: string, isEnabled: boolean) => Promise<{ok: boolean, error?: string}>} toggleReward
 * @property {(id: string) => Promise<{ok: boolean, error?: string}>} archiveReward
 * @property {(id: string) => Promise<{ok: boolean, error?: string}>} fulfillRedemption
 * @property {(id: string, reason?: string) => Promise<{ok: boolean, error?: string}>} cancelRedemption
 * @property {(ids: string[]) => Promise<{ok: boolean, error?: string}>} bulkFulfill
 * @property {(ids: string[]) => Promise<{ok: boolean, error?: string}>} bulkCancel
 *
 * @typedef {object} UseManageRewardsOptions
 * @property {string|null} broadcasterId
 * @property {number}      [pollIntervalMs=30000]
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { logError } from '../utils/errors'
import { logEvent } from '../utils/eventLog'
import {
  getCustomRewards,
  createCustomReward,
  updateCustomReward,
  deleteCustomReward,
  getRedemptions,
  updateRedemptionStatus,
} from '../utils/twitch'

const PENDING_STATUS = 'UNFULFILLED'

/**
 * @param {UseManageRewardsOptions} opts
 * @returns {ManageRewardsState}
 */
export function useManageRewards({ broadcasterId, token, pollIntervalMs = 30000 } = {}) {
  const [rewards, setRewards] = useState([])
  const [pendingRedemptions, setPendingRedemptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)
  const cancelledRef = useRef(false)

  const rewardsRef = useRef([])
  useEffect(() => {
    rewardsRef.current = rewards
  }, [rewards])

  const fetchRewards = useCallback(async () => {
    if (!broadcasterId) {
      setRewards([])
      return []
    }
    const res = await getCustomRewards(broadcasterId, ...(token ? [token] : []))
    if (cancelledRef.current) return []
    if (res.ok) {
      setRewards(res.data)
      return res.data
    }
    setError(res.error || 'Error cargando recompensas')
    return []
  }, [broadcasterId, token])

  const fetchPending = useCallback(async (rewardsList) => {
    const list = rewardsList || []
    if (!broadcasterId || list.length === 0) {
      setPendingRedemptions([])
      return
    }
    const results = await Promise.allSettled(
      list.map(r => getRedemptions(broadcasterId, r.id, PENDING_STATUS, token, undefined, 50))
    )
    if (cancelledRef.current) return
    const all = []
    results.forEach((settled, i) => {
      if (settled.status === 'fulfilled' && settled.value?.ok && settled.value.data?.data) {
        all.push(...settled.value.data.data.map(rd => ({ ...rd, reward_title: list[i]?.title })))
      }
    })
    all.sort((a, b) => new Date(b.redeemed_at) - new Date(a.redeemed_at))
    setPendingRedemptions(all)
  }, [broadcasterId, token])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const fresh = await fetchRewards()
      if (cancelledRef.current) return
      await fetchPending(fresh)
    } finally {
      if (!cancelledRef.current) setLoading(false)
    }
  }, [fetchRewards, fetchPending])

  useEffect(() => {
    if (!broadcasterId || pollIntervalMs <= 0) return
    cancelledRef.current = false
    const tick = async () => {
      if (cancelledRef.current) return
      await fetchPending(rewardsRef.current)
      if (cancelledRef.current) return
      timerRef.current = setTimeout(tick, pollIntervalMs)
    }
    timerRef.current = setTimeout(tick, pollIntervalMs)
    return () => {
      cancelledRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [broadcasterId, pollIntervalMs, fetchPending])

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

  // ─── Acciones ────────────────────────────────────────────────

  const createReward = useCallback(async (data) => {
    if (!broadcasterId) return { ok: false, error: 'No hay broadcaster activo' }
    const res = await createCustomReward(broadcasterId, data, ...(token ? [token] : []))
    if (res.ok) {
      setRewards(prev => [...prev, res.data])
      return { ok: true, data: res.data }
    }
    logError(new Error(res.error || 'create failed'), { context: 'useManageRewards', action: 'createReward' })
    return { ok: false, error: res.error }
  }, [broadcasterId, token])

  const updateReward = useCallback(async (id, data) => {
    if (!broadcasterId) return { ok: false, error: 'No hay broadcaster activo' }
    const res = await updateCustomReward(broadcasterId, id, data, ...(token ? [token] : []))
    if (res.ok) {
      setRewards(prev => prev.map(r => r.id === id ? { ...r, ...res.data } : r))
      return { ok: true, data: res.data }
    }
    logError(new Error(res.error || 'update failed'), { context: 'useManageRewards', action: 'updateReward' })
    return { ok: false, error: res.error }
  }, [broadcasterId, token])

  const toggleReward = useCallback(async (id, isEnabled) => {
    return updateReward(id, { is_enabled: isEnabled })
  }, [updateReward])

  const archiveReward = useCallback(async (id) => {
    if (!broadcasterId) return { ok: false, error: 'No hay broadcaster activo' }
    const res = await deleteCustomReward(broadcasterId, id, ...(token ? [token] : []))
    if (res.ok) {
      setRewards(prev => prev.filter(r => r.id !== id))
      setPendingRedemptions(prev => prev.filter(rd => rd.reward_id !== id))
      return { ok: true }
    }
    logError(new Error(res.error || 'delete failed'), { context: 'useManageRewards', action: 'archiveReward' })
    return { ok: false, error: res.error }
  }, [broadcasterId, token])

  const fulfillRedemption = useCallback(async (id) => {
    const pending = pendingRedemptions.find(p => p.id === id)
    if (!broadcasterId || !pending) return { ok: false, error: 'Redencion no encontrada' }
    const res = await updateRedemptionStatus(broadcasterId, pending.reward_id, [id], 'FULFILLED', ...(token ? [token] : []))
    if (res.ok) {
      setPendingRedemptions(prev => prev.filter(p => p.id !== id))
      logEvent('channel_points', 'redemption.fulfilled', { broadcasterId, rewardId: pending.reward_id })
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }, [broadcasterId, pendingRedemptions, token])

  const cancelRedemption = useCallback(async (id, _reason) => {
    void _reason
    const pending = pendingRedemptions.find(p => p.id === id)
    if (!broadcasterId || !pending) return { ok: false, error: 'Redencion no encontrada' }
    const res = await updateRedemptionStatus(broadcasterId, pending.reward_id, [id], 'CANCELED', ...(token ? [token] : []))
    if (res.ok) {
      setPendingRedemptions(prev => prev.filter(p => p.id !== id))
      logEvent('channel_points', 'redemption.canceled', { broadcasterId, rewardId: pending.reward_id })
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }, [broadcasterId, pendingRedemptions, token])

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
        updateRedemptionStatus(broadcasterId, rewardId, rids, 'FULFILLED', ...(token ? [token] : []))
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
  }, [broadcasterId, pendingRedemptions, token])

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
        updateRedemptionStatus(broadcasterId, rewardId, rids, 'CANCELED', ...(token ? [token] : []))
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
  }, [broadcasterId, pendingRedemptions, token])

  return {
    rewards,
    pendingRedemptions,
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
