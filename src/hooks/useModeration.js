

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  banUser, unbanUser, deleteChatMessage, clearChatMessages, updateChatSettings, getChatSettings,
} from '../utils/twitch'
import { logEvent } from '../utils/eventLog'

const AUDIT_MAX = 100
const LS_AUDIT_PREFIX = 'bs.modAudit.'

const _rateWindows = new Map() 

// Only mounted scopes retain a fallback when browser storage is unavailable.
const _auditScopes = new Map()

function _auditKey(accountId, channelId) {
  return accountId && channelId
    ? `${LS_AUDIT_PREFIX}v2.${encodeURIComponent(accountId).replaceAll('.', '%2E')}.${encodeURIComponent(channelId).replaceAll('.', '%2E')}`
    : null
}

function _loadAudit(key) {
  if (!key) return []
  const scope = _auditScopes.get(key)
  if (scope?.pendingWrite) return scope.rows
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(e => e && typeof e.timestamp === 'number' && typeof e.action === 'string').slice(-AUDIT_MAX)
  } catch { return _auditScopes.get(key)?.rows || [] }
}

function _publishAudit(key, rows, pendingWrite) {
  const scope = _auditScopes.get(key)
  if (!scope) return
  scope.rows = rows
  if (pendingWrite !== undefined) scope.pendingWrite = pendingWrite
  for (const listener of scope.listeners) listener({ key, rows })
}

function _nowMs() { return Date.now() }

function _checkRate(channelId, maxActions, windowMs) {
  const w = _rateWindows.get(channelId)
  if (!w) return { allowed: true, remaining: maxActions, resetMs: 0 }
  const cutoff = _nowMs() - windowMs

  w.actions = w.actions.filter(ts => ts > cutoff)
  if (w.actions.length >= maxActions) {
    const oldest = w.actions[0]
    return { allowed: false, remaining: 0, resetMs: Math.max(0, windowMs - (_nowMs() - oldest)) }
  }
  return { allowed: true, remaining: maxActions - w.actions.length, resetMs: 0 }
}

function _recordAction(channelId) {
  const w = _rateWindows.get(channelId) || { actions: [], resetTimer: null }
  w.actions.push(_nowMs())
  _rateWindows.set(channelId, w)
}

export function clearRateLimitState(channelId) {
  if (channelId) {
    _rateWindows.delete(channelId)
  } else {
    _rateWindows.clear()
  }
}

export function useModeration({ broadcasterId, userId: moderatorId, maxActions = 20, windowMs = 30000 } = {}) {
  const auditKey = _auditKey(moderatorId, broadcasterId)
  const [auditSnapshot, setAuditSnapshot] = useState({ key: null, rows: [] })
  const auditLog = auditKey && auditSnapshot.key === auditKey ? auditSnapshot.rows : []
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [remainingActions, setRemainingActions] = useState(maxActions)
  const [rateLimitResetMs, setRateLimitResetMs] = useState(0)
  const resetTimerRef = useRef(null)

  useEffect(() => {
    if (!auditKey) return
    let scope = _auditScopes.get(auditKey)
    if (!scope) {
      scope = { rows: _loadAudit(auditKey), pendingWrite: false, listeners: new Set() }
      _auditScopes.set(auditKey, scope)
    }
    scope.listeners.add(setAuditSnapshot)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuditSnapshot({ key: auditKey, rows: scope.rows })
    return () => {
      scope.listeners.delete(setAuditSnapshot)
      if (!scope.listeners.size) _auditScopes.delete(auditKey)
    }
  }, [auditKey])

  useEffect(() => {
    if (!broadcasterId) {

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsRateLimited(false)

      setRemainingActions(maxActions)
      return
    }
    const check = () => {
      const r = _checkRate(broadcasterId, maxActions, windowMs)
      setIsRateLimited(!r.allowed)
      setRemainingActions(r.remaining)
      setRateLimitResetMs(r.resetMs)
    }
    check()

    const interval = setInterval(check, 500)
    return () => clearInterval(interval)
  }, [broadcasterId, maxActions, windowMs])

  useEffect(() => {
    if (isRateLimited && rateLimitResetMs > 0 && !resetTimerRef.current) {
      resetTimerRef.current = setTimeout(() => {
        resetTimerRef.current = null
        if (broadcasterId) {
          const r = _checkRate(broadcasterId, maxActions, windowMs)
          setIsRateLimited(!r.allowed)
          setRemainingActions(r.remaining)
          setRateLimitResetMs(r.resetMs)
        }
      }, rateLimitResetMs + 50)
    }
    return () => {
      if (resetTimerRef.current && rateLimitResetMs === 0) {
        clearTimeout(resetTimerRef.current)
        resetTimerRef.current = null
      }
    }
  }, [isRateLimited, rateLimitResetMs, broadcasterId, maxActions, windowMs])

  const _appendAudit = useCallback((entry) => {
    if (!auditKey) return
    const full = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now(), ...entry }
    // Merge synchronously with storage, never with another render's rows.
    const next = [..._loadAudit(auditKey), full].slice(-AUDIT_MAX)
    let pendingWrite = false
    try { localStorage.setItem(auditKey, JSON.stringify(next)) } catch { pendingWrite = true }
    _publishAudit(auditKey, next, pendingWrite)
    logEvent('mod', `${entry.action}.${entry.success ? 'ok' : 'fail'}`, {
      target: entry.targetName,
      reason: entry.reason,
      duration: entry.duration,
      error: entry.error,
    })
  }, [auditKey])

  const _checkAndClaimSlot = useCallback(() => {
    if (!broadcasterId) return false
    const r = _checkRate(broadcasterId, maxActions, windowMs)
    if (!r.allowed) {
      setIsRateLimited(true)
      setRemainingActions(0)
      setRateLimitResetMs(r.resetMs)
      _appendAudit({
        action: 'ban', 
        target: 'rate-limit',
        targetName: 'rate-limit',
        success: false,
        error: 'Rate limit local excedido',
      })
      return false
    }
    return true
  }, [broadcasterId, maxActions, windowMs, _appendAudit])

  const _recordRate = useCallback(() => {
    if (!broadcasterId) return
    _recordAction(broadcasterId)
    const r = _checkRate(broadcasterId, maxActions, windowMs)
    setIsRateLimited(!r.allowed)
    setRemainingActions(r.remaining)
    setRateLimitResetMs(r.resetMs)
  }, [broadcasterId, maxActions, windowMs])

  const ban = useCallback(async (targetUserId, username, reason) => {
    if (!broadcasterId || !moderatorId) return false
    if (!_checkAndClaimSlot()) return false
    const result = await banUser(broadcasterId, moderatorId, targetUserId, reason)
    if (result.success) {

      _recordRate()
      _appendAudit({ action: 'ban', target: targetUserId, targetName: username, reason, success: true })
      return true
    }

    _appendAudit({ action: 'ban', target: targetUserId, targetName: username, reason, success: false, error: result.error?.message })
    return false
  }, [broadcasterId, moderatorId, _checkAndClaimSlot, _recordRate, _appendAudit])

  const unban = useCallback(async (targetUserId, username) => {
    if (!broadcasterId || !moderatorId) return false
    if (!_checkAndClaimSlot()) return false
    const result = await unbanUser(broadcasterId, moderatorId, targetUserId)
    if (result.success) {
      _recordRate()
      _appendAudit({ action: 'unban', target: targetUserId, targetName: username, success: true })
      return true
    }
    _appendAudit({ action: 'unban', target: targetUserId, targetName: username, success: false, error: result.error?.message })
    return false
  }, [broadcasterId, moderatorId, _checkAndClaimSlot, _recordRate, _appendAudit])

  const timeout = useCallback(async (targetUserId, username, duration, reason) => {
    if (!broadcasterId || !moderatorId) return false
    if (!_checkAndClaimSlot()) return false
    const result = await banUser(broadcasterId, moderatorId, targetUserId, reason, duration)
    if (result.success) {
      _recordRate()
      _appendAudit({ action: 'timeout', target: targetUserId, targetName: username, reason, duration, success: true })
      return true
    }
    _appendAudit({ action: 'timeout', target: targetUserId, targetName: username, reason, duration, success: false, error: result.error?.message })
    return false
  }, [broadcasterId, moderatorId, _checkAndClaimSlot, _recordRate, _appendAudit])

  const untimeout = useCallback(async (targetUserId, username) => {

    if (!broadcasterId || !moderatorId) return false
    if (!_checkAndClaimSlot()) return false
    const result = await unbanUser(broadcasterId, moderatorId, targetUserId)
    if (result.success) {
      _recordRate()
      _appendAudit({ action: 'untimeout', target: targetUserId, targetName: username, success: true })
      return true
    }
    _appendAudit({ action: 'untimeout', target: targetUserId, targetName: username, success: false, error: result.error?.message })
    return false
  }, [broadcasterId, moderatorId, _checkAndClaimSlot, _recordRate, _appendAudit])

  const deleteMessage = useCallback(async (messageId, username) => {
    if (!broadcasterId || !moderatorId) return false
    if (!_checkAndClaimSlot()) return false
    const result = await deleteChatMessage(broadcasterId, moderatorId, messageId)
    if (result.success) {
      _recordRate()
      _appendAudit({ action: 'delete', target: messageId, targetName: username || 'msg', success: true })
      return true
    }
    _appendAudit({ action: 'delete', target: messageId, targetName: username || 'msg', success: false, error: result.error?.message })
    return false
  }, [broadcasterId, moderatorId, _checkAndClaimSlot, _recordRate, _appendAudit])

  const clearChat = useCallback(async () => {
    if (!broadcasterId || !moderatorId) return false
    if (!_checkAndClaimSlot()) return false
    const result = await clearChatMessages(broadcasterId, moderatorId)
    if (result.success) {
      _recordRate()
      _appendAudit({ action: 'clear', target: 'channel', targetName: 'channel', success: true })
      return true
    }
    _appendAudit({ action: 'clear', target: 'channel', targetName: 'channel', success: false, error: result.error?.message })
    return false
  }, [broadcasterId, moderatorId, _checkAndClaimSlot, _recordRate, _appendAudit])

  const setChatMode = useCallback(async (mode, value) => {
    if (!broadcasterId || !moderatorId) return false
    if (!_checkAndClaimSlot()) return false

    const settings = {}
    if (mode === 'slow') {
      settings.slow_mode = true
      settings.slow_mode_wait_time = Math.max(3, Math.min(120, Number(value) || 30))
    } else if (mode === 'slowoff') {
      settings.slow_mode = false
    } else if (mode === 'emoteonly') {
      settings.emote_mode = true
    } else if (mode === 'emoteonlyoff') {
      settings.emote_mode = false
    } else if (mode === 'subscribers') {
      settings.subscriber_mode = true
    } else if (mode === 'subscribersoff') {
      settings.subscriber_mode = false
    } else if (mode === 'followers') {
      settings.follower_mode = true
      settings.follower_mode_duration = Math.max(0, Math.min(129600, Number(value) || 0))
    } else if (mode === 'followersoff') {
      settings.follower_mode = false
    } else if (mode === 'uniquechat') {
      settings.unique_chat_mode = true
    } else if (mode === 'uniquechatoff') {
      settings.unique_chat_mode = false
    }

    const result = await updateChatSettings(broadcasterId, moderatorId, settings)
    if (result.success) {
      _recordRate()
      _appendAudit({
        action: 'chat_mode',
        target: mode,
        targetName: mode,
        reason: value != null ? String(value) : undefined,
        success: true,
      })
      return true
    }

    _appendAudit({
      action: 'chat_mode',
      target: mode,
      targetName: mode,
      reason: value != null ? String(value) : undefined,
      success: false,
      error: result.error?.message,
    })
    return false
  }, [broadcasterId, moderatorId, _checkAndClaimSlot, _recordRate, _appendAudit])

  const fetchChatSettings = useCallback(async () => {
    if (!broadcasterId) return null
    const result = await getChatSettings(broadcasterId, moderatorId)
    if (result.success) return result.value
    return null
  }, [broadcasterId, moderatorId])

  const clearAuditLog = useCallback(() => {
    if (!auditKey) return
    let pendingWrite = false
    try { localStorage.removeItem(auditKey) } catch { pendingWrite = true }
    _publishAudit(auditKey, [], pendingWrite)
  }, [auditKey])

  const reloadAuditLog = useCallback(() => {
    if (!auditKey) return
    _publishAudit(auditKey, _loadAudit(auditKey))
  }, [auditKey])

  return {
    auditLog,
    isRateLimited,
    remainingActions,
    rateLimitResetMs,
    ban,
    unban,
    timeout,
    untimeout,
    deleteMessage,
    clearChat,
    setChatMode,
    fetchChatSettings,
    clearAuditLog,
    reloadAuditLog,
  }
}

export function parseDuration(input) {
  if (!input) return null
  const s = String(input).trim().toLowerCase()
  const m = s.match(/^(\d+)\s*(s|m|h|d)$/)
  if (!m) return null
  const n = Number(m[1])
  if (isNaN(n) || n <= 0) return null
  switch (m[2]) {
    case 's': return n
    case 'm': return n * 60
    case 'h': return n * 3600
    case 'd': return n * 86400
    default: return null
  }
}

export function formatRemaining(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds <= 0) return '00:00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
