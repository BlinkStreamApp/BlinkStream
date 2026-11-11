

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

function getCached(broadcasterId, userId, channel) {
  const key = `${broadcasterId || ''}:${userId || ''}:${channel || ''}`
  const entry = _cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _cache.delete(key)
    return null
  }
  return entry
}

function setCached(broadcasterId, userId, channel, role) {
  const key = `${broadcasterId || ''}:${userId || ''}:${channel || ''}`
  _cache.set(key, { role, ts: Date.now() })
  evictOldestIfFull()
}

export function useChannelRole({ broadcasterId, userId, channel } = {}) {
  const [resolvedRole, setResolvedRole] = useState(null)
  const role = resolvedRole && resolvedRole.broadcasterId === broadcasterId && resolvedRole?.userId === userId && resolvedRole?.channel === channel ? resolvedRole.role : 'unknown'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const fetchRole = useCallback(async (bId, uId, ch) => {
    abortRef.current?.abort()
    const setRole = role => setResolvedRole({ broadcasterId: bId, userId: uId, channel: ch, role })
    if (!ch && !bId) {
      setRole('unknown')
      setLoading(false)
      return
    }

    const cached = getCached(bId, uId, ch)
    if (cached) {
      setRole(cached.role)
      setError(null)
      setLoading(false)
      return
    }

    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError(null)
    const result = await getChannelRole(bId, uId, ac.signal, ch)
    if (ac.signal.aborted) return
    if (result.success) {
      setRole(result.value)
      setCached(bId, uId, ch, result.value)
      setError(null)
    } else {
      setRole('viewer')
      setError(result.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRole(broadcasterId, userId, channel)
    return () => abortRef.current?.abort()
  }, [broadcasterId, userId, channel, fetchRole])

  // Real-time role listener (fired from IRC USERSTATE on chat connect)
  useEffect(() => {
    const handleRoleEvent = (e) => {
      const detail = e?.detail
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return
      if (typeof userId !== 'string' || !/^[1-9][0-9]*$/.test(userId)) return
      if (typeof detail.userId !== 'string' || detail.userId !== userId) return
      if (typeof channel !== 'string' || typeof detail.channel !== 'string') return
      if (!/^[a-zA-Z0-9_]{1,25}$/.test(detail.channel) || detail.channel.toLowerCase() !== channel.toLowerCase()) return
      if (!['viewer', 'vip', 'mod', 'broadcaster'].includes(detail.role)) return
      abortRef.current?.abort()
      setLoading(false)
      setError(null)
      setResolvedRole({ broadcasterId, userId, channel, role: detail.role })
      setCached(broadcasterId, userId, channel, detail.role)
    }
    window.addEventListener('bs:user-role-detected', handleRoleEvent)
    return () => window.removeEventListener('bs:user-role-detected', handleRoleEvent)
  }, [channel, broadcasterId, userId])

  const refresh = useCallback(() => {
    if (channel || broadcasterId) {
      const key = `${broadcasterId || ''}:${userId || ''}:${channel || ''}`
      _cache.delete(key)
      fetchRole(broadcasterId, userId, channel)
    }
  }, [broadcasterId, userId, channel, fetchRole])

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
