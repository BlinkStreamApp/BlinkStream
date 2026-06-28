/**
 * @file Hook para viewers de Channel Points (P1 / WT-20260628-14).
 *
 * Maneja el fetch + cache de rewards del canal donde esta mirando
 * el usuario, y expone `redeem()` para que la UI pueda canjear
 * con el token del usuario. Tambien expone `myRedemptions` con
 * las redenciones recientes del viewer.
 *
 * Estado expuesto:
 *   - rewards:         lista de custom rewards del canal actual
 *   - myRedemptions:   redenciones recientes del viewer (limit 50)
 *   - balance:         null | number (Twitch no expone balance publico)
 *   - loading:         true durante fetch inicial
 *   - error:           ultimo error de la API
 *   - refresh():       refetch manual
 *   - redeem(id, ?input): canjea y devuelve {ok, error?}
 *
 * Cache:
 *   - rewards se cachea 5 min en memoria (Map keyed por broadcasterId)
 *   - myRedemptions NO se cachea: siempre fresco al refrescar
 *
 * @typedef {object} ChannelPointsState
 * @property {Array<object>} rewards
 * @property {Array<object>} myRedemptions
 * @property {number|null} balance
 * @property {string|null} error
 * @property {boolean} loading
 * @property {() => Promise<void>} refresh
 * @property {(rewardId: string, userInput?: string) => Promise<{ok: boolean, error?: string}>} redeem
 *
 * @typedef {object} UseChannelPointsOptions
 * @property {string|null} broadcasterId
 * @property {string|null} userToken       - OAuth token del viewer (necesario para redeem)
 * @property {string|null} userId          - user_id del viewer (necesario para myRedemptions)
 * @property {number}      [cacheTtlMs=300000]
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { logError } from '../utils/errors'
import { logEvent } from '../utils/eventLog'
import {
  getCustomRewards,
  getRedemptions,
  redeemCustomReward,
} from '../utils/twitch'

// Cache de rewards en modulo-level. Se comparte entre todos los
// mounts del hook (un mismo canal en N componentes = un solo fetch).
const _rewardsCache = new Map() // broadcasterId -> { ts: number, data: [] }

/**
 * Worker pool con concurrencia limitada. Procesa un array de items
 * llamando `fn(item)` con como mucho `concurrency` ejecuciones en
 * paralelo. Devuelve un array con los resultados en el mismo orden
 * de entrada. Si el caller aborta (flag externo), `fn` puede
 * devolver `[]` para cooperar — el propio flag se chequea dentro
 * de `fn`, no aqui, porque no queremos acoplar este helper a la
 * logica del hook.
 *
 * Lo usamos para no saturar la rate-limit de Twitch: en lugar de
 * hacer 5 awaits en serie (1 + 5 calls en cascada), paralelizamos
 * hasta 3 a la vez. Promedio 5/rewards por canal: ~2 batches en
 * vez de 5 awaits.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency  - maximo de ejecuciones en paralelo
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
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

/**
 * @param {UseChannelPointsOptions} opts
 * @returns {ChannelPointsState}
 */
export function useChannelPoints({ broadcasterId, userToken, userId, cacheTtlMs = 5 * 60 * 1000 } = {}) {
  const [rewards, setRewards] = useState([])
  const [myRedemptions, setMyRedemptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // balance: Twitch no expone balance publico por API. Mantenemos
  // `balance: null` en el return para que la API del hook no rompa
  // consumidores existentes (CPPanel.jsx ya lo lee como `viewer.balance`).
  // Cuando se anada el endpoint, mover a useState.
  const balance = null
  const cancelledRef = useRef(false)

  const fetchRewards = useCallback(async () => {
    if (!broadcasterId) {
      setRewards([])
      return
    }
    setLoading(true)
    setError(null)

    // 1) Cache: si tenemos uno fresco, lo devolvemos sin red.
    const cached = _rewardsCache.get(broadcasterId)
    if (cached && (Date.now() - cached.ts) < cacheTtlMs) {
      setRewards(cached.data)
      setLoading(false)
      return
    }

    const res = await getCustomRewards(broadcasterId)
    if (cancelledRef.current) return
    if (res.ok) {
      _rewardsCache.set(broadcasterId, { ts: Date.now(), data: res.data })
      setRewards(res.data)
    } else {
      setError(res.error || 'Error cargando recompensas')
      setRewards([])
    }
    setLoading(false)
  }, [broadcasterId, cacheTtlMs])

  const fetchMyRedemptions = useCallback(async () => {
    if (!broadcasterId || !userId) {
      setMyRedemptions([])
      return
    }
    // Twitch no expone un endpoint dedicado a "mis redenciones".
    // Lo que hacemos: traer las redenciones (FULFILLED) de la primera
    // reward visible y filtrar por user_id. Limit 50.
    // Esto es suficiente para mostrar historial reciente.
    // Si no hay rewards, devolvemos vacio.
    const rewardsRes = await getCustomRewards(broadcasterId)
    if (cancelledRef.current) return
    if (!rewardsRes.ok || rewardsRes.data.length === 0) {
      setMyRedemptions([])
      return
    }
    // Iteramos las primeras 5 rewards (las mas populares suelen
    // estar arriba). Suficiente para historial.
    // FIX 1 (WT-20260628-29): antes era un loop secuencial con `await` —
    // 1 + 5 calls a Helix, todos en serie. Ahora usamos un worker pool
    // con concurrency=3 para paralelizar sin saturar la rate-limit de
    // Twitch (800 req/min para endpoints publicos).
    const targets = rewardsRes.data.slice(0, 5)
    const all = await pMap(targets, 3, async (r) => {
      if (cancelledRef.current) return []
      const res = await getRedemptions(broadcasterId, r.id, 'FULFILLED', undefined, userId, 20)
      if (cancelledRef.current) return []
      if (res.ok && res.data?.data) {
        return res.data.data
      }
      return []
    })
    // Aplanamos y ordenamos por redeemed_at desc, cap 50.
    const flat = all.flat()
    flat.sort((a, b) => new Date(b.redeemed_at) - new Date(a.redeemed_at))
    setMyRedemptions(flat.slice(0, 50))
  }, [broadcasterId, userId])

  const refresh = useCallback(async () => {
    // Invalidamos cache de rewards para forzar refetch.
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
    // El lint marca esto como "setState in effect" porque fetchRewards/
    // fetchMyRedemptions terminan llamando a setRewards/setMyRedemptions.
    // Es el patrón canónico para "fetch on mount/update" — se justifica
    // por el comentario de "fetch inicial" arriba.
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

/**
 * Helper exportado para tests: permite limpiar la cache entre
 * casos de prueba sin tener que recargar el módulo.
 */
export function __clearRewardsCache() {
  _rewardsCache.clear()
}
