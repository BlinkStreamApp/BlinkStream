

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  banUser, unbanUser, deleteChatMessage,
} from '../utils/twitch'
import { logEvent } from '../utils/eventLog'

const AUDIT_MAX = 100
const LS_AUDIT_PREFIX = 'bs.modAudit.'

const _rateWindows = new Map() 

function _auditKey(channelId) {
  return `${LS_AUDIT_PREFIX}${channelId}`
}

function _loadAudit(channelId) {
  try {
    const raw = localStorage.getItem(_auditKey(channelId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(e => e && typeof e.timestamp === 'number' && typeof e.action === 'string')
  } catch { return [] }
}

function _saveAudit(channelId, log) {
  try {
    localStorage.setItem(_auditKey(channelId), JSON.stringify(log.slice(-AUDIT_MAX)))
  } catch {  }
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
  const [auditLog, setAuditLog] = useState([])
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [remainingActions, setRemainingActions] = useState(maxActions)
  const [rateLimitResetMs, setRateLimitResetMs] = useState(0)
  const resetTimerRef = useRef(null)

  useEffect(() => {
    if (!broadcasterId) {

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuditLog([])
      return
    }

    setAuditLog(_loadAudit(broadcasterId))
  }, [broadcasterId])

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
    if (!broadcasterId) return
    const full = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now(), ...entry }
    setAuditLog(prev => {
      const next = [...prev, full].slice(-AUDIT_MAX)
      _saveAudit(broadcasterId, next)
      return next
    })
    logEvent('mod', `${entry.action}.${entry.success ? 'ok' : 'fail'}`, {
      target: entry.targetName,
      reason: entry.reason,
      duration: entry.duration,
      error: entry.error,
    })
  }, [broadcasterId])

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
    if (!broadcasterId) return false

    _appendAudit({ action: 'clear', target: 'channel', targetName: 'channel', success: true })
    return true
  }, [broadcasterId, _appendAudit])

  const setChatMode = useCallback(async (mode, value) => {
    if (!broadcasterId) return false
    if (!_checkAndClaimSlot()) return false
    _recordRate()
    _appendAudit({
      action: 'chat_mode',
      target: mode,
      targetName: mode,
      reason: value != null ? String(value) : undefined,
      success: true,
    })
    return true
  }, [broadcasterId, _checkAndClaimSlot, _recordRate, _appendAudit])

  const clearAuditLog = useCallback(() => {
    if (!broadcasterId) return
    try { localStorage.removeItem(_auditKey(broadcasterId)) } catch {  }
    setAuditLog([])
  }, [broadcasterId])

  const reloadAuditLog = useCallback(() => {
    if (!broadcasterId) return
    setAuditLog(_loadAudit(broadcasterId))
  }, [broadcasterId])

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
