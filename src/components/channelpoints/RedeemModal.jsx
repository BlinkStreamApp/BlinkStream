

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
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

  const [isRewardEnabled] = useState(() => reward?.is_enabled !== false)

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

      setTimeout(() => onClose(), 1200)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200000] bg-black/70 backdrop-blur-md flex items-center justify-center animate-fade-in p-4 pointer-events-auto"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary border border-bg-tertiary/60 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {}
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
            <PhosphorIcon name="Gift" className="w-20 h-20 opacity-40 text-white" />
          )}
        </div>

        {}
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[17px] font-semibold text-text-primary">
              {reward.title || 'Recompensa'}
            </h3>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-medium text-white bg-twitch/20 border border-twitch/40 shrink-0">
              <span className="w-2 h-2 rounded-full bg-twitch" />
              {cost.toLocaleString()}
            </span>
          </div>

          {reward.prompt && (
            <p className="text-[13px] text-text-secondary leading-relaxed">
              {reward.prompt}
            </p>
          )}

          {}
          {userBalance != null && (
            <div className="flex items-center justify-between text-[12px] text-text-secondary border-t border-bg-tertiary/40 pt-3">
              <span>{t('cp.redeem.balance')}:</span>
              <span className={`font-medium ${noBalance ? 'text-red-400 font-semibold' : 'text-text-primary'}`}>
                {userBalance.toLocaleString()} {t('cp.points')}
              </span>
            </div>
          )}

          {}
          {!isRewardEnabled && (
            <div className="text-[12px] text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 text-center">
              {t('cp.redeem.disabled_by_broadcaster')}
            </div>
          )}

          {hasCooldown && (
            <div className="text-[12px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-center">
              {t('cp.redeem.in_cooldown_prefix')} {fmtCooldown(cooldownRemainingSec)}
            </div>
          )}

          {}
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

          {}
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

          {}
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
    </div>,
    document.body
  )
}
