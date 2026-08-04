/**
 * @file Modal para canjear una recompensa (P1 / WT-20260628-14).
 *
 * @typedef {object} RedeemModalProps
 * @property {object|null} reward
 * @property {number|null} userBalance
 * @property {boolean} submitting
 * @property {string|null} error
 * @property {string|null} success
 * @property {(rewardId: string, userInput?: string) => Promise<{ok: boolean, error?: string}>} onRedeem
 * @property {() => void} onClose
 */

import { useState, useEffect } from 'react'
import { t } from '../../utils/i18n'
import PhosphorIcon from '../icons/PhosphorIcon'

function fmtCooldown(totalSec) {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return ''
  const m = Math.floor(totalSec / 60)
  const s = Math.floor(totalSec % 60)
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function RedeemModal({ reward, userBalance, submitting, error, success, onRedeem, onClose }) {
  const [userInput, setUserInput] = useState('')
  // FIX 2 (WT-20260628-29): si el broadcaster desactiva el reward
  // mid-flow, el viewer no debe quedarse atascado con un error
  // generico. Detectamos el caso al mount y deshabilitamos el submit
  // mostrando un mensaje claro.
  // Por defecto `reward.is_enabled` puede venir `undefined` en
  // rewards antiguas de la API: tratamos eso como "activo" para no
  // romper el flujo normal.
  const [isRewardEnabled] = useState(() => reward?.is_enabled !== false)
  // `now` se refresca cada 1s para que el countdown del cooldown
  // se actualice sin necesidad de re-render por cambio de `reward`.
  // Antes se llamaba Date.now() directamente en el render y la regla
  // `react-hooks/purity` lo marcaba como impure function in render.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!reward) return
    const onKey = (e) => {
      if (e.code === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reward, onClose])

  if (!reward) return null

  const cost = reward.cost || 0
  const noBalance = userBalance != null && userBalance < cost
  const hasCooldown = reward.cooldown_expires_at
    ? new Date(reward.cooldown_expires_at).getTime() > now
    : false
  const cooldownRemainingSec = hasCooldown
    ? Math.max(0, Math.ceil((new Date(reward.cooldown_expires_at).getTime() - now) / 1000))
    : 0

  const inputRequired = !!reward.is_user_input_required
  const canSubmit = isRewardEnabled
    && !submitting
    && !noBalance
    && !hasCooldown
    && (!inputRequired || userInput.trim().length > 0)
    && !success

  const handleSubmit = async () => {
    if (!canSubmit) return
    const res = await onRedeem(reward.id, userInput.trim() || undefined)
    if (res.ok) {
      // Mantenemos el modal abierto 1.2s para mostrar "success"
      setTimeout(() => onClose(), 1200)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100000] bg-black/65 backdrop-blur-md flex items-center justify-center animate-fade-in p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary border border-bg-tertiary/60 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Imagen 200x200 */}
        <div
          className="w-full aspect-square flex items-center justify-center text-6xl font-bold text-white/80"
          style={{ backgroundColor: reward.background_color || '#9146ff' }}
        >
          {reward.image ? (
            <img
              src={reward.image.url_4x || reward.image.url_2x || reward.image.url_1x}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <span>{(reward.title || '?').charAt(0).toUpperCase()}</span>
          )}
        </div>

        <div className="p-5 space-y-4">
          <div>
            <h3 className="text-base font-bold text-text-primary leading-tight">{reward.title}</h3>
            {reward.prompt && (
              <p className="text-[12px] text-text-secondary mt-1 leading-relaxed">{reward.prompt}</p>
            )}
          </div>

          {/* Costo + balance */}
          <div className="flex items-center gap-4 text-[12px]">
            <div className="flex items-center gap-1.5 text-yellow-400 font-bold">
              <PhosphorIcon name="Coins" size={14} weight="duotone" />
              {t('cp.redeem.cost')}: {cost.toLocaleString('es-ES')}
            </div>
            {userBalance != null && (
              <div className="text-text-muted">
                {t('cp.redeem.balance')}: {userBalance.toLocaleString('es-ES')}
              </div>
            )}
          </div>

          {/* Cooldown */}
          {hasCooldown && cooldownRemainingSec > 0 && (
            <div className="text-[11px] text-text-muted">
              ⏱ {t('cp.redeem.cooldown.remaining').replace('{time}', fmtCooldown(cooldownRemainingSec))}
            </div>
          )}

          {/* FIX 2 (WT-20260628-29): banner si el broadcaster deshabilito
              el reward mid-flow. El submit queda deshabilitado por
              canSubmit arriba. */}
          {!isRewardEnabled && (
            <div className="text-[12px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
              {t('cp.redeem.disabled') || 'Esta recompensa ya no esta disponible.'}
            </div>
          )}

          {/* User input */}
          {inputRequired && (
            <div>
              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={t('cp.redeem.input.placeholder')}
                rows={3}
                maxLength={200}
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-[13px] border border-bg-tertiary focus:border-twitch focus:outline-none transition-colors resize-none"
              />
              {inputRequired && userInput.trim().length === 0 && (
                <p className="text-[10px] text-red-400/80 mt-1">{t('cp.redeem.input.required')}</p>
              )}
            </div>
          )}

          {/* Status */}
          {error && (
            <div className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {success && (
            <div className="text-[12px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 text-center font-medium">
              ✓ {t('cp.redeem.success')}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-[12px] text-text-secondary hover:text-text-primary hover:bg-hover cursor-pointer transition-colors"
            >
              {t('cp.redeem.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 px-4 py-2 rounded-lg text-[12px] font-medium text-white bg-twitch hover:bg-twitch-dark disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors btn-press"
            >
              {success ? t('cp.redeem.success') : submitting ? t('cp.redeem.submitting') : t('cp.redeem.submit')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
