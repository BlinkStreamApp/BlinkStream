

import { useState, useEffect, useCallback, useRef } from 'react'
import { getChannelRole } from '../utils/twitch'

const CACHE_TTL_MS = 5 * 60 * 1000 

const MAX_CACHE_ENTRIES = 100

const _cache = new Map()

function evictOldestIfFull() {
  if (_cache.size <= MAX_CACHE_ENTRIES) return

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

  _cache.set(key, { role, ts: Date.now() })
  evictOldestIfFull()
}

export function useChannelRole({ broadcasterId, userId, channel } = {}) {
  const [role, setRole] = useState( ('unknown'))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const fetchRole = useCallback(async (bId, uId) => {
    if (!bId || !uId) {
      setRole('unknown')
      setLoading(false)
      return
    }

    const cached = getCached(bId, uId)
    if (cached) {
      setRole(cached.role)
      setError(null)
      setLoading(false)
      return
    }

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

      setRole('viewer')
      setError(result.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {

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

export function clearChannelRoleCache() {
  _cache.clear()
}
