/**
 * @file Hook de moderacion (M1 / WT-20260628-13).
 * Centraliza todas las acciones de mod (ban/unban/timeout/untimeout/delete/
 * clear/chat modes), con rate limiting local, audit log persistente y
 * emision de eventos. Pensado para ser consumido por ModPanel y
 * MessageContextMenu.
 *
 * @typedef {object} AuditEntry
 * @property {string} id
 * @property {number} timestamp
 * @property {'ban'|'unban'|'timeout'|'untimeout'|'delete'|'clear'|'chat_mode'} action
 * @property {string} target      - userId o 'channel'
 * @property {string} targetName  - username legible
 * @property {string} [reason]
 * @property {number} [duration]  - segundos (solo timeout)
 * @property {boolean} success
 * @property {string} [error]
 *
 * @typedef {object} UseModerationOptions
 * @property {string|null} broadcasterId   - id del canal actual
 * @property {string|null} userId          - id del viewer (para rate limit per-user)
 * @property {number} [maxActions]         - limite por ventana (default 20)
 * @property {number} [windowMs]           - tamano de la ventana (default 30s)
 *
 * @typedef {object} UseModerationReturn
 * @property {AuditEntry[]} auditLog
 * @property {boolean}     isRateLimited
 * @property {number}      remainingActions
 * @property {number}      rateLimitResetMs   - ms hasta que se libere el rate limit
 * @property {(userId: string, username: string, reason?: string) => Promise<boolean>} ban
 * @property {(userId: string, username: string) => Promise<boolean>} unban
 * @property {(userId: string, username: string, duration: number, reason?: string) => Promise<boolean>} timeout
 * @property {(userId: string, username: string) => Promise<boolean>} untimeout
 * @property {(messageId: string, username?: string) => Promise<boolean>} deleteMessage
 * @property {() => Promise<boolean>} clearChat
 * @property {('slow'|'slowoff'|'followers'|'followersoff'|'subscribers'|'subscribersoff'|'emoteonly'|'emoteonlyoff'|'uniquechat'|'uniquechatoff', value?: number|string) => Promise<boolean>} setChatMode
 * @property {() => void} clearAuditLog
 * @property {() => void} reloadAuditLog
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  banUser, unbanUser, deleteChatMessage,
} from '../utils/twitch'
import { logEvent } from '../utils/eventLog'

const AUDIT_MAX = 100
const LS_AUDIT_PREFIX = 'bs.modAudit.'

// ============================================================
// Rate limit + audit log (modulo-level state compartido entre
// instancias del hook para el mismo canal). Esto evita que dos
// ModPanels en paralelo (caso exotico) se pisen contadores.
// ============================================================
const _rateWindows = new Map() // key=channelId -> { actions: number[], resetTimer: number|null }

function _auditKey(channelId) {
  return `${LS_AUDIT_PREFIX}${channelId}`
}

function _loadAudit(channelId) {
  try {
    const raw = localStorage.getItem(_auditKey(channelId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Validacion blanda: descartar entradas sin timestamp
    return parsed.filter(e => e && typeof e.timestamp === 'number' && typeof e.action === 'string')
  } catch { return [] }
}

function _saveAudit(channelId, log) {
  try {
    localStorage.setItem(_auditKey(channelId), JSON.stringify(log.slice(-AUDIT_MAX)))
  } catch { /* quota exceeded: silencioso */ }
}

function _nowMs() { return Date.now() }

function _checkRate(channelId, maxActions, windowMs) {
  const w = _rateWindows.get(channelId)
  if (!w) return { allowed: true, remaining: maxActions, resetMs: 0 }
  const cutoff = _nowMs() - windowMs
  // Filtramos acciones dentro de la ventana
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

/**
 * Helper exportado: limpia el state de rate limit por canal (util en tests).
 * En produccion normalmente no hace falta.
 * @param {string} [channelId] - si se omite, limpia todos los canales
 */
export function clearRateLimitState(channelId) {
  if (channelId) {
    _rateWindows.delete(channelId)
  } else {
    _rateWindows.clear()
  }
}

/**
 * Hook principal de moderacion. Mantiene audit log por canal, rate limit
 * local y expone acciones wrapper. Si broadcasterId es null, todas las
 * acciones devuelven false sin llamar a Helix.
 *
 * @param {UseModerationOptions} opts
 * @returns {UseModerationReturn}
 */
export function useModeration({ broadcasterId, maxActions = 20, windowMs = 30000 } = {}) {
  const [auditLog, setAuditLog] = useState([])
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [remainingActions, setRemainingActions] = useState(maxActions)
  const [rateLimitResetMs, setRateLimitResetMs] = useState(0)
  const resetTimerRef = useRef(null)

  // Cargar audit log al cambiar de canal
  useEffect(() => {
    if (!broadcasterId) {
      // Reset explicito: sin canal, no hay audit log. setState dentro
      // del effect es legitimo aqui (cleanup de estado dependiente de
      // broadcasterId).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuditLog([])
      return
    }
    // Carga inicial sincrona desde localStorage. setState en effect
    // es el patron "estado desde fuente externa" que el plugin acepta.
    setAuditLog(_loadAudit(broadcasterId))
  }, [broadcasterId])

  // Recalcular rate limit al montar y cada vez que cambie el canal
  useEffect(() => {
    if (!broadcasterId) {
      // Reset del rate limit al desmontar/cambiar canal: estado
      // derivado de broadcasterId, no es un cascading render.
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
    // Loop para que el countdown se actualice mientras estamos rate limited
    const interval = setInterval(check, 500)
    return () => clearInterval(interval)
  }, [broadcasterId, maxActions, windowMs])

  // Auto-clear del timer cuando expira el rate limit
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

  /**
   * Helper interno: persiste una entrada de audit log y emite evento.
   * @param {Omit<AuditEntry, 'id' | 'timestamp'>} entry
   */
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

  /**
   * Helper interno: rate check previo a la accion. Solo verifica si hay
   * cupo; NO consume. El consumo real se hace con `_recordRate` DESPUES
   * de un await exitoso, para que un 403/timeout/error de red no gaste
   * cupo del rate limit local.
   *
   * FIX P0-3: separacion de check vs record. Antes `_consumeRate`
   * grababa la accion antes del await; si Twitch devolvia 403, la
   * ventana quedaba con un slot consumido y bloqueaba futuras
   * acciones legitimas hasta que expirara.
   *
   * @returns {boolean} true si OK para proceder
   */
  const _checkAndClaimSlot = useCallback(() => {
    if (!broadcasterId) return false
    const r = _checkRate(broadcasterId, maxActions, windowMs)
    if (!r.allowed) {
      setIsRateLimited(true)
      setRemainingActions(0)
      setRateLimitResetMs(r.resetMs)
      _appendAudit({
        action: 'ban', // generico
        target: 'rate-limit',
        targetName: 'rate-limit',
        success: false,
        error: 'Rate limit local excedido',
      })
      return false
    }
    return true
  }, [broadcasterId, maxActions, windowMs, _appendAudit])

  /**
   * Helper interno: consume el slot en la ventana de rate limit.
   * Se llama DESPUES de que el await de la accion (banUser/etc)
   * retorne exito. Si la accion fallo, NO llamar a este helper.
   */
  const _recordRate = useCallback(() => {
    if (!broadcasterId) return
    _recordAction(broadcasterId)
    const r = _checkRate(broadcasterId, maxActions, windowMs)
    setIsRateLimited(!r.allowed)
    setRemainingActions(r.remaining)
    setRateLimitResetMs(r.resetMs)
  }, [broadcasterId, maxActions, windowMs])

  // Acciones ----------------------------------------------------------

  const ban = useCallback(async (targetUserId, username, reason) => {
    if (!broadcasterId) return false
    if (!_checkAndClaimSlot()) return false
    const result = await banUser(broadcasterId, targetUserId, reason)
    if (result.success) {
      // Solo consumimos rate limit si la accion fue exitosa.
      _recordRate()
      _appendAudit({ action: 'ban', target: targetUserId, targetName: username, reason, success: true })
      return true
    }
    // Falla: NO consumimos rate limit (FIX P0-3).
    _appendAudit({ action: 'ban', target: targetUserId, targetName: username, reason, success: false, error: result.error?.message })
    return false
  }, [broadcasterId, _checkAndClaimSlot, _recordRate, _appendAudit])

  const unban = useCallback(async (targetUserId, username) => {
    if (!broadcasterId) return false
    if (!_checkAndClaimSlot()) return false
    const result = await unbanUser(broadcasterId, targetUserId)
    if (result.success) {
      _recordRate()
      _appendAudit({ action: 'unban', target: targetUserId, targetName: username, success: true })
      return true
    }
    _appendAudit({ action: 'unban', target: targetUserId, targetName: username, success: false, error: result.error?.message })
    return false
  }, [broadcasterId, _checkAndClaimSlot, _recordRate, _appendAudit])

  /**
   * Timeout wrapper: usa banUser con duration. banUser ya soporta
   * `duration` en segundos; reusamos el helper para no duplicar logica.
   */
  const timeout = useCallback(async (targetUserId, username, duration, reason) => {
    if (!broadcasterId) return false
    if (!_checkAndClaimSlot()) return false
    const result = await banUser(broadcasterId, targetUserId, reason, duration)
    if (result.success) {
      _recordRate()
      _appendAudit({ action: 'timeout', target: targetUserId, targetName: username, reason, duration, success: true })
      return true
    }
    _appendAudit({ action: 'timeout', target: targetUserId, targetName: username, reason, duration, success: false, error: result.error?.message })
    return false
  }, [broadcasterId, _checkAndClaimSlot, _recordRate, _appendAudit])

  const untimeout = useCallback(async (targetUserId, username) => {
    // Twitch: untimeout = unban. Mismo endpoint.
    if (!broadcasterId) return false
    if (!_checkAndClaimSlot()) return false
    const result = await unbanUser(broadcasterId, targetUserId)
    if (result.success) {
      _recordRate()
      _appendAudit({ action: 'untimeout', target: targetUserId, targetName: username, success: true })
      return true
    }
    _appendAudit({ action: 'untimeout', target: targetUserId, targetName: username, success: false, error: result.error?.message })
    return false
  }, [broadcasterId, _checkAndClaimSlot, _recordRate, _appendAudit])

  const deleteMessage = useCallback(async (messageId, username) => {
    if (!broadcasterId) return false
    if (!_checkAndClaimSlot()) return false
    const result = await deleteChatMessage(broadcasterId, messageId)
    if (result.success) {
      _recordRate()
      _appendAudit({ action: 'delete', target: messageId, targetName: username || 'msg', success: true })
      return true
    }
    _appendAudit({ action: 'delete', target: messageId, targetName: username || 'msg', success: false, error: result.error?.message })
    return false
  }, [broadcasterId, _checkAndClaimSlot, _recordRate, _appendAudit])

  /**
   * /clear via IRC: mandamos el comando por el WebSocket del chat. Aqui
   * solo auditamos: la llamada real al WS la hace el consumidor pasando
   * el `wsSend` o ejecutandolo en el callback. Para no acoplar el hook
   * al WS del chat, exponemos el audit sin envio directo. El caller
   * (Chat.jsx) hara el sendMessage('/clear') y luego llamara a esto
   * SOLO si el WS acuso OK. Asi evitamos un doble path.
   *
   * Implementacion alternativa: usar el endpoint Helix de ban con
   * "razon vacia + duracion 1" para borrar todo... NO, eso borraria
   * a un user. La forma correcta es via IRC `/clear`.
   *
   * @returns {Promise<boolean>} siempre true si broadcasterId presente (es accion local-only)
   */
  const clearChat = useCallback(async () => {
    if (!broadcasterId) return false
    // Sin rate-limit check: /clear es una sola operacion, no 20.
    _appendAudit({ action: 'clear', target: 'channel', targetName: 'channel', success: true })
    return true
  }, [broadcasterId, _appendAudit])

  /**
   * Cambia modos de chat (slow/followers/subscribers/emoteonly/uniquechat).
   * Implementacion: delega en la edge function o en el WS IRC. Aqui
   * auditamos + emitimos evento. El send real lo hace el caller.
   *
   * @param {string} mode
   * @param {string|number} [value]
   */
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
    try { localStorage.removeItem(_auditKey(broadcasterId)) } catch { /* ignore */ }
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

/**
 * Helper exportado: parsea una duracion humana (e.g. "1h", "30m") a segundos.
 * Usado por ActionModal. Si el input no encaja en los presets, devuelve null
 * para que la UI muestre un input custom.
 *
 * @param {string} input
 * @returns {number|null}
 */
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

/**
 * Helper exportado: formatea segundos restantes a HH:MM:SS para el countdown
 * de TimeoutList. Si < 0, devuelve '00:00:00'.
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatRemaining(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds <= 0) return '00:00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
