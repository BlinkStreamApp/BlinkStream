

import { useState, useEffect, useRef, useMemo } from 'react'

const DURATION_PRESETS = [
  { id: '60', label: '1m' },
  { id: '300', label: '5m' },
  { id: '600', label: '10m' },
  { id: '1800', label: '30m' },
  { id: '3600', label: '1h' },
  { id: '86400', label: '24h' },
]

const MAX_TIMEOUT_SECONDS = 1209600 
const MIN_TIMEOUT_SECONDS = 1

const ACTION_META = {
  ban: { title: 'Banear usuario', color: 'red', requiresReason: true, requiresDuration: false, antiFatFinger: true },
  unban: { title: 'Desbanear usuario', color: 'green', requiresReason: false, requiresDuration: false, antiFatFinger: false },
  timeout: { title: 'Timeout de usuario', color: 'orange', requiresReason: true, requiresDuration: true, antiFatFinger: false },
  untimeout: { title: 'Quitar timeout', color: 'green', requiresReason: false, requiresDuration: false, antiFatFinger: false },
  mod: { title: 'Promover a moderador', color: 'green', requiresReason: false, requiresDuration: false, antiFatFinger: false },
  unmod: { title: 'Quitar moderador', color: 'orange', requiresReason: false, requiresDuration: false, antiFatFinger: false },
  vip: { title: 'Añadir VIP', color: 'pink', requiresReason: false, requiresDuration: false, antiFatFinger: false },
  unvip: { title: 'Quitar VIP', color: 'orange', requiresReason: false, requiresDuration: false, antiFatFinger: false },
}

function colorClasses(color) {
  switch (color) {
    case 'red': return 'bg-red-500 hover:bg-red-600 text-white'
    case 'green': return 'bg-green-500 hover:bg-green-600 text-white'
    case 'orange': return 'bg-orange-500 hover:bg-orange-600 text-white'
    case 'pink': return 'bg-pink-500 hover:bg-pink-600 text-white'
    default: return 'bg-twitch hover:bg-twitch-dark text-white'
  }
}

export function ActionModal({ open, onClose, onConfirm, action, targetUser, defaultReason, busy }) {
  const meta = ACTION_META[action] || ACTION_META.ban
  const [reason, setReason] = useState(defaultReason || '')
  const [duration, setDuration] = useState('600')
  const [customDuration, setCustomDuration] = useState('')
  const [confirmTyped, setConfirmTyped] = useState('')
  const firstInputRef = useRef(null)

  useEffect(() => {
    if (open) {

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReason(defaultReason || '')

      setDuration('600')

      setCustomDuration('')

      setConfirmTyped('')

      setTimeout(() => firstInputRef.current?.focus(), 30)
    }
  }, [open, defaultReason, targetUser?.user_id])

  useEffect(() => {
    if (!open) return
    const handle = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [open, onClose])

  const effectiveDuration = useMemo(() => {
    if (duration === 'custom') {
      const n = Number(customDuration) || 0

      return Math.max(MIN_TIMEOUT_SECONDS, Math.min(MAX_TIMEOUT_SECONDS, n))
    }
    return Number(duration)
  }, [duration, customDuration])

  const customDurationError = useMemo(() => {
    if (duration !== 'custom') return ''
    const n = Number(customDuration) || 0
    if (n < MIN_TIMEOUT_SECONDS) return ''
    if (n > MAX_TIMEOUT_SECONDS) {
      return `Twitch permite máximo 14 días (${MAX_TIMEOUT_SECONDS}s).`
    }
    return ''
  }, [duration, customDuration])

  const canConfirm = useMemo(() => {
    if (busy) return false
    if (meta.requiresReason && !reason.trim()) return false
    if (meta.requiresDuration && effectiveDuration <= 0) return false

    if (meta.requiresDuration && duration === 'custom') {
      const n = Number(customDuration) || 0
      if (n > MAX_TIMEOUT_SECONDS || n < MIN_TIMEOUT_SECONDS) return false
    }
    if (meta.antiFatFinger && confirmTyped.trim().toLowerCase() !== (targetUser?.user_login || '').toLowerCase()) return false
    return true
  }, [busy, reason, effectiveDuration, duration, customDuration, confirmTyped, meta, targetUser])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/65 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-bg-tertiary/60 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-modal-title"
      >
        <div className="px-4 py-3 border-b border-bg-tertiary/50">
          <h3 id="action-modal-title" className="text-sm font-bold text-text-primary">{meta.title}</h3>
          <p className="text-[11px] text-text-muted/80 mt-0.5">
            <span className="font-semibold text-text-secondary">{targetUser?.user_name || targetUser?.user_login}</span>
            {targetUser?.user_login && targetUser.user_login !== targetUser.user_name && (
              <span className="ml-1 text-text-muted/60">@{targetUser.user_login}</span>
            )}
          </p>
        </div>

        <div className="px-4 py-3 space-y-3">
          {meta.requiresReason && (
            <div>
              <label className="text-[11px] font-medium text-text-secondary mb-1 block">
                Razón {meta.antiFatFinger ? '(obligatoria)' : '(opcional)'}
              </label>
              <textarea
                ref={firstInputRef}
                value={reason}
                onChange={e => setReason(e.target.value.slice(0, 500))}
                rows={3}
                maxLength={500}
                placeholder="Describe el motivo..."
                className="w-full px-2.5 py-1.5 rounded-lg bg-bg-tertiary text-text-primary placeholder-text-muted/40 text-[12px] border border-transparent focus:border-twitch focus:outline-none resize-none"
              />
              <p className="text-[9px] text-text-muted/50 text-right">{reason.length}/500</p>
            </div>
          )}

          {meta.requiresDuration && (
            <div>
              <label className="text-[11px] font-medium text-text-secondary mb-1 block">Duración</label>
              <div className="flex gap-1 flex-wrap mb-1.5">
                {DURATION_PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setDuration(p.id)}
                    className={`text-[11px] px-2 py-1 rounded-md cursor-pointer transition-colors ${
                      duration === p.id ? 'bg-twitch/20 text-twitch border border-twitch/30' : 'bg-bg-tertiary text-text-muted hover:bg-hover border border-transparent'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => setDuration('custom')}
                  className={`text-[11px] px-2 py-1 rounded-md cursor-pointer transition-colors ${
                    duration === 'custom' ? 'bg-twitch/20 text-twitch border border-twitch/30' : 'bg-bg-tertiary text-text-muted hover:bg-hover border border-transparent'
                  }`}
                >
                  Custom
                </button>
              </div>
              {duration === 'custom' && (
                <div>
                  <input
                    type="number"
                    min={MIN_TIMEOUT_SECONDS}
                    max={MAX_TIMEOUT_SECONDS}
                    value={customDuration}

                    onChange={e => setCustomDuration(e.target.value)}
                    placeholder="Segundos (máx 14 días)..."
                    aria-invalid={customDurationError ? 'true' : 'false'}
                    className={`w-full px-2.5 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-[12px] border focus:outline-none ${
                      customDurationError
                        ? 'border-red-500/60 focus:border-red-500'
                        : 'border-transparent focus:border-twitch'
                    }`}
                  />
                  {customDurationError && (
                    <p className="text-[10px] text-red-400 mt-1" role="alert">
                      {customDurationError}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {meta.antiFatFinger && (
            <div>
              <label className="text-[11px] font-medium text-orange-400 mb-1 block">
                ⚠ Confirmación anti-fat-finger
              </label>
              <p className="text-[10px] text-text-muted/80 mb-1.5 leading-relaxed">
                Escribe <code className="bg-bg-tertiary px-1 rounded text-orange-300">{targetUser?.user_login}</code> para confirmar.
              </p>
              <input
                ref={meta.requiresReason ? null : firstInputRef}
                type="text"
                value={confirmTyped}
                onChange={e => setConfirmTyped(e.target.value)}
                placeholder={targetUser?.user_login || ''}
                className="w-full px-2.5 py-1.5 rounded-lg bg-bg-tertiary text-text-primary placeholder-text-muted/30 text-[12px] border border-transparent focus:border-orange-400 focus:outline-none"
              />
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-bg-tertiary/50 flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={busy}
            className="text-[12px] px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-secondary hover:bg-hover transition-colors cursor-pointer disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={() => canConfirm && onConfirm?.({ reason: reason.trim() || undefined, duration: meta.requiresDuration ? effectiveDuration : undefined })}
            disabled={!canConfirm}
            className={`text-[12px] px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${colorClasses(meta.color)}`}
          >
            {busy ? 'Aplicando…' : meta.title}
          </button>
        </div>
      </div>
    </div>
  )
}
