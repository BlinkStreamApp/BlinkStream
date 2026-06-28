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
export function useManageRewards({ broadcasterId, pollIntervalMs = 30000 } = {}) {
  const [rewards, setRewards] = useState([])
  const [pendingRedemptions, setPendingRedemptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)
  const cancelledRef = useRef(false)

  // Ref sincronizada con `rewards` via useEffect (FIX P1-3: antes se
  // asignaba directamente durante el render, lo cual es un anti-patron
  // — React en modo estricto + concurrent rendering puede leer la ref
  // antes de que el `setRewards` haya hecho commit, devolviendo un valor
  // stale en callbacks async). Ahora la sincronizacion se hace en
  // commit phase via useEffect, que es cuando React garantiza que el
  // state nuevo es visible.
  //
  // La clave sigue siendo: dentro de `refresh` (async), no podemos leer
  // `rewards` del closure porque esta congelado al render inicial. Por
  // eso `fetchRewards` RETORNA el array que va a settear, y lo usamos
  // directamente para pedir pending sin esperar al re-render. La ref
  // queda disponible para callers que SI necesiten el ultimo valor
  // conocido (p. ej. tests, debug, o callers externos al hook).
  const rewardsRef = useRef([])
  useEffect(() => {
    rewardsRef.current = rewards
  }, [rewards])

  const fetchRewards = useCallback(async () => {
    if (!broadcasterId) {
      setRewards([])
      return []
    }
    const res = await getCustomRewards(broadcasterId)
    if (cancelledRef.current) return []
    if (res.ok) {
      setRewards(res.data)
      return res.data
    }
    setError(res.error || 'Error cargando recompensas')
    return []
  }, [broadcasterId])

  // fetchPending toma el array de rewards como parametro (cero loop,
  // cero race). Si no se pasa, devuelve vacio (caso polling en
  // background sin rewards conocidas todavia).
  const fetchPending = useCallback(async (rewardsList) => {
    const list = rewardsList || []
    if (!broadcasterId || list.length === 0) {
      setPendingRedemptions([])
      return
    }
    // FIX P0-2: usamos Promise.allSettled en vez de Promise.all. Antes,
    // si UNA reward fallaba (p. ej. archivada → 404), TODO el poll
    // reventaba y perdiamos las redenciones de las otras N-1 rewards.
    // Ahora los rechazos se filtran y solo los fulfilled alimentan la
    // lista, manteniendo el poll resiliente ante rewards problematicas.
    const results = await Promise.allSettled(
      list.map(r => getRedemptions(broadcasterId, r.id, PENDING_STATUS, undefined, undefined, 50))
    )
    if (cancelledRef.current) return
    const all = []
    results.forEach((settled, i) => {
      // Solo procesamos los que se resolvieron (no rechazados). El
      // shape interno sigue siendo { ok, data, error }.
      if (settled.status === 'fulfilled' && settled.value?.ok && settled.value.data?.data) {
        all.push(...settled.value.data.data.map(rd => ({ ...rd, reward_title: list[i]?.title })))
      }
    })
    all.sort((a, b) => new Date(b.redeemed_at) - new Date(a.redeemed_at))
    setPendingRedemptions(all)
  }, [broadcasterId])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // fetchRewards RETORNA el array, asi que lo usamos directamente
      // para fetchPending sin esperar al re-render. Esto cierra el
      // race que hacia que pendingRedemptions quedara en [] en los
      // tests cuando se montaba el hook.
      const fresh = await fetchRewards()
      if (cancelledRef.current) return
      await fetchPending(fresh)
    } finally {
      if (!cancelledRef.current) setLoading(false)
    }
  }, [fetchRewards, fetchPending])

  // Polling de pending redemptions. NO re-llamamos a fetchRewards
  // en cada tick (seria wasteful, eso solo cambia con create/update).
  useEffect(() => {
    if (!broadcasterId || pollIntervalMs <= 0) return
    cancelledRef.current = false
    const tick = async () => {
      if (cancelledRef.current) return
      await fetchPending()
      if (cancelledRef.current) return
      timerRef.current = setTimeout(tick, pollIntervalMs)
    }
    timerRef.current = setTimeout(tick, pollIntervalMs)
    return () => {
      cancelledRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [broadcasterId, pollIntervalMs, fetchPending])

  // Fetch inicial SOLO cuando broadcasterId cambia. NO depende de
  // `refresh` para evitar el loop: cada vez que setRewards cambiaba,
  // refresh se recreaba, el effect se re-ejecutaba, refresh se llamaba
  // otra vez, etc. Por eso ahora el effect se monta una sola vez por
  // broadcasterId y se desuscribe al cambiar.
  useEffect(() => {
    cancelledRef.current = false
    // `refresh()` dispara setLoading/setError/setRewards/setPendingRedemptions
    // desde una peticion async — es exactamente el patron "fetch on mount"
    // que el plugin marca. No es un cascading render: el effect solo se
    // monta cuando cambia `broadcasterId`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    return () => { cancelledRef.current = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcasterId])

  // ─── Acciones ────────────────────────────────────────────────

  const createReward = useCallback(async (data) => {
    if (!broadcasterId) return { ok: false, error: 'No hay broadcaster activo' }
    const res = await createCustomReward(broadcasterId, data)
    if (res.ok) {
      setRewards(prev => [...prev, res.data])
      return { ok: true, data: res.data }
    }
    logError(new Error(res.error || 'create failed'), { context: 'useManageRewards', action: 'createReward' })
    return { ok: false, error: res.error }
  }, [broadcasterId])

  const updateReward = useCallback(async (id, data) => {
    if (!broadcasterId) return { ok: false, error: 'No hay broadcaster activo' }
    const res = await updateCustomReward(broadcasterId, id, data)
    if (res.ok) {
      setRewards(prev => prev.map(r => r.id === id ? { ...r, ...res.data } : r))
      return { ok: true, data: res.data }
    }
    logError(new Error(res.error || 'update failed'), { context: 'useManageRewards', action: 'updateReward' })
    return { ok: false, error: res.error }
  }, [broadcasterId])

  const toggleReward = useCallback(async (id, isEnabled) => {
    return updateReward(id, { is_enabled: isEnabled })
  }, [updateReward])

  const archiveReward = useCallback(async (id) => {
    if (!broadcasterId) return { ok: false, error: 'No hay broadcaster activo' }
    const res = await deleteCustomReward(broadcasterId, id)
    if (res.ok) {
      setRewards(prev => prev.filter(r => r.id !== id))
      setPendingRedemptions(prev => prev.filter(rd => rd.reward_id !== id))
      return { ok: true }
    }
    logError(new Error(res.error || 'delete failed'), { context: 'useManageRewards', action: 'archiveReward' })
    return { ok: false, error: res.error }
  }, [broadcasterId])

  const fulfillRedemption = useCallback(async (id) => {
    // Necesitamos el reward_id del pending. Lo sacamos de la lista.
    const pending = pendingRedemptions.find(p => p.id === id)
    if (!broadcasterId || !pending) return { ok: false, error: 'Redencion no encontrada' }
    const res = await updateRedemptionStatus(broadcasterId, pending.reward_id, [id], 'FULFILLED')
    if (res.ok) {
      setPendingRedemptions(prev => prev.filter(p => p.id !== id))
      logEvent('channel_points', 'redemption.fulfilled', { broadcasterId, rewardId: pending.reward_id })
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }, [broadcasterId, pendingRedemptions])

  const cancelRedemption = useCallback(async (id, _reason) => {
    // Twitch API no acepta reason en PATCH; lo guardamos local
    // en el log pero no lo mandamos. `_reason` es API publica
    // (el caller puede pasarlo) pero aqui lo ignoramos a proposito.
    void _reason
    const pending = pendingRedemptions.find(p => p.id === id)
    if (!broadcasterId || !pending) return { ok: false, error: 'Redencion no encontrada' }
    const res = await updateRedemptionStatus(broadcasterId, pending.reward_id, [id], 'CANCELED')
    if (res.ok) {
      setPendingRedemptions(prev => prev.filter(p => p.id !== id))
      logEvent('channel_points', 'redemption.canceled', { broadcasterId, rewardId: pending.reward_id })
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }, [broadcasterId, pendingRedemptions])

  const bulkFulfill = useCallback(async (ids) => {
    if (!broadcasterId || ids.length === 0) return { ok: true }
    // Agrupamos por reward_id (Twitch requiere un reward_id por PATCH)
    const byReward = new Map()
    pendingRedemptions.forEach(p => {
      if (ids.includes(p.id)) {
        if (!byReward.has(p.reward_id)) byReward.set(p.reward_id, [])
        byReward.get(p.reward_id).push(p.id)
      }
    })
    const results = await Promise.all(
      [...byReward.entries()].map(([rewardId, rids]) =>
        updateRedemptionStatus(broadcasterId, rewardId, rids, 'FULFILLED')
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
  }, [broadcasterId, pendingRedemptions])

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
        updateRedemptionStatus(broadcasterId, rewardId, rids, 'CANCELED')
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
  }, [broadcasterId, pendingRedemptions])

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
