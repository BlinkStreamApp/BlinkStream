/**
 * @file Hook que detecta el rol del viewer en el canal actual (M1 / WT-20260628-13).
 * Resuelve via Helix si el user logueado es broadcaster, mod, vip, viewer o
 * "unknown" (sin sesion / sin scopes). Cachea el resultado en memoria 5 min
 * por canal para no martillear la API al cambiar de tab o re-renderizar.
 *
 * @typedef {'broadcaster'|'mod'|'vip'|'viewer'|'unknown'} ChannelRole
 *
 * @typedef {object} UseChannelRoleOptions
 * @property {string|null} broadcasterId  - id numerico del broadcaster del canal actual
 * @property {string|null} userId         - id numerico del viewer logueado (o null)
 * @property {string} [channel]           - canal (login) — opcional, se usa de fallback
 *
 * @typedef {object} UseChannelRoleReturn
 * @property {ChannelRole} role
 * @property {boolean}     loading
 * @property {Error|null}  error
 * @property {boolean}     isModerator  - true si role === 'broadcaster' || 'mod'
 * @property {boolean}     isBroadcaster
 * @property {boolean}     isVip
 * @property {() => void}  refresh
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getChannelRole } from '../utils/twitch'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutos

// FIX P1-1: cap del cache para evitar crecimiento indefinido cuando el
// usuario salta entre muchos canales en una sesion larga. Usamos LRU
// simple: al insertar, si el Map supera MAX_CACHE_ENTRIES, evictamos
// la entrada mas antigua (primer key del iterador, que es orden de
// insercion en Map). 100 entradas * 5 min TTL = cubre el caso normal
// de un broadcaster navegando sus propios canales + mods revisando
// varios canales seguidos, sin que el modulo retenga datos de canales
// que el usuario ya no visita.
const MAX_CACHE_ENTRIES = 100

// Cache de modulo: { key: { role, ts } }
// Key = `${broadcasterId}:${userId}` para invalidar por canal+user.
const _cache = new Map()

function evictOldestIfFull() {
  if (_cache.size <= MAX_CACHE_ENTRIES) return
  // Map preserva orden de insercion, asi que el primer key es el LRU.
  const oldestKey = _cache.keys().next().value
  if (oldestKey !== undefined) _cache.delete(oldestKey)
}

function getCached(broadcasterId, userId) {
  const key = `${broadcasterId}:${userId}`
  const entry = _cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _cache.delete(key)
    return null
  }
  return entry
}

function setCached(broadcasterId, userId, role) {
  const key = `${broadcasterId}:${userId}`
  // FIX P1-1: insertamos primero y luego evictamos si hace falta. Esto
  // garantiza que la entrada recien escrita NUNCA sea la victima del
  // eviction (siempre sera la mas reciente del Map).
  _cache.set(key, { role, ts: Date.now() })
  evictOldestIfFull()
}

/**
 * Hook que devuelve el rol del viewer en el canal. Si el broadcasterId o
 * userId son null (no hay sesion), devuelve 'unknown' sin llamar a la API.
 *
 * Si la API falla, asume 'viewer' como fallback conservador y expone un
 * mensaje en `error` para que la UI pueda mostrar "Verificando permisos...".
 *
 * @param {UseChannelRoleOptions} opts
 * @returns {UseChannelRoleReturn}
 */
export function useChannelRole({ broadcasterId, userId, channel } = {}) {
  const [role, setRole] = useState(/** @type {ChannelRole} */ ('unknown'))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const fetchRole = useCallback(async (bId, uId) => {
    if (!bId || !uId) {
      setRole('unknown')
      setLoading(false)
      return
    }
    // Cache hit: devolvemos sin re-fetch
    const cached = getCached(bId, uId)
    if (cached) {
      setRole(cached.role)
      setError(null)
      setLoading(false)
      return
    }
    // FIX P0-1: AbortController propagado al fetch real para evitar
    // que un fetch viejo sobrescriba el state de un canal mas nuevo.
    // Antes el AbortController era decorativo: `getChannelRole` no
    // aceptaba signal, asi que cambiar de canal rapido podia dejar
    // state inconsistente (race condition).
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError(null)
    const result = await getChannelRole(bId, uId, ac.signal)
    if (ac.signal.aborted) return
    if (result.success) {
      setRole(result.value)
      setCached(bId, uId, result.value)
      setError(null)
    } else {
      // Fallback conservador: si falla, asumimos 'viewer' para no exponer
      // acciones de mod accidentalmente. La UI vera `loading=false` y
      // `error` poblada.
      setRole('viewer')
      setError(result.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // fetchRole dispara setState al resolver la API. Es el patron
    // "fetch on deps change" — no es cascading render: el effect
    // se re-monta solo cuando cambian broadcasterId/userId/channel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRole(broadcasterId, userId)
    return () => abortRef.current?.abort()
  }, [broadcasterId, userId, channel, fetchRole])

  const refresh = useCallback(() => {
    if (broadcasterId && userId) {
      const key = `${broadcasterId}:${userId}`
      _cache.delete(key)
      fetchRole(broadcasterId, userId)
    }
  }, [broadcasterId, userId, fetchRole])

  return {
    role,
    loading,
    error,
    isModerator: role === 'broadcaster' || role === 'mod',
    isBroadcaster: role === 'broadcaster',
    isVip: role === 'vip',
    refresh,
  }
}

/**
 * Helper exportado para limpiar el cache de modulo (util en tests o
 * tras logout). En produccion normalmente no hace falta.
 */
export function clearChannelRoleCache() {
  _cache.clear()
}
