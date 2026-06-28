/**
 * @file Card de recompensa para el viewer (P1 / WT-20260628-14).
 * Muestra imagen, titulo, costo y estado disabled. Click -> RedeemModal.
 *
 * @typedef {object} RewardCardProps
 * @property {object} reward             - Custom Reward de Twitch
 * @property {number|null} userBalance    - Balance del viewer (null si desconocido)
 * @property {boolean} [channelLive]     - false => deshabilita card aunque todo OK
 * @property {() => void} onClick
 */

import { useState, useEffect } from 'react'
import PhosphorIcon from '../icons/PhosphorIcon'

/**
 * Convierte segundos a string "Xh Ym" / "Ym Zs" / "Zs".
 * @param {number} totalSec
 */
function fmtCooldown(totalSec) {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return ''
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = Math.floor(totalSec % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function RewardCard({ reward, userBalance, channelLive = true, onClick }) {
  // `now` se refresca cada 1s para que el cooldown se actualice sin
  // re-renders espurios. Antes se llamaba Date.now() en render y la
  // regla `react-hooks/purity` marcaba impure function during render.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!reward) return null

  // Reglas de disabled: Twitch las evalua del lado server, pero
  // pre-evaluamos aqui para dar feedback inmediato al usuario.
  const isPaused = !reward.is_enabled || !reward.is_in_stock
  const cost = reward.cost || 0
  const noBalance = userBalance != null && userBalance < cost
  const hasCooldown = reward.cooldown_expires_at
    ? new Date(reward.cooldown_expires_at).getTime() > now
    : false

  const disabled = isPaused || noBalance || hasCooldown || !channelLive

  let disabledReason = null
  if (!channelLive) disabledReason = 'cp.reward.disabled.offline'
  else if (isPaused && !reward.is_in_stock) disabledReason = 'cp.reward.disabled.stock'
  else if (isPaused) disabledReason = 'cp.reward.disabled.cooldown'
  else if (noBalance) disabledReason = 'cp.reward.disabled.points'
  else if (hasCooldown) disabledReason = 'cp.reward.disabled.cooldown'

  // Cooldown countdown (solo si esta habilitado en la reward y activo)
  const cooldownRemainingSec = hasCooldown
    ? Math.max(0, Math.ceil((new Date(reward.cooldown_expires_at).getTime() - now) / 1000))
    : 0

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`group flex items-center gap-3 w-full text-left p-3 rounded-xl border transition-all
        ${disabled
          ? 'border-bg-tertiary/30 bg-bg-tertiary/20 opacity-60 cursor-not-allowed'
          : 'border-bg-tertiary/40 bg-bg-secondary hover:border-twitch/50 hover:bg-bg-tertiary/40 cursor-pointer btn-press'}`}
      title={disabled && disabledReason ? disabledReason : ''}
    >
      {/* Imagen 80x80 */}
      <div
        className="w-20 h-20 rounded-lg shrink-0 flex items-center justify-center text-2xl overflow-hidden"
        style={{ backgroundColor: reward.background_color || '#9146ff' }}
      >
        {reward.image ? (
          <img
            src={reward.image.url_4x || reward.image.url_2x || reward.image.url_1x}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-white/80 font-bold">
            {(reward.title || '?').charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4
          className="text-[13px] font-semibold text-text-primary leading-tight line-clamp-2"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {reward.title}
        </h4>
        {reward.prompt && (
          <p className="text-[11px] text-text-muted mt-0.5 line-clamp-1">{reward.prompt}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          {/* Coin icon + cost */}
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-yellow-400">
            <PhosphorIcon name="Coins" size={12} weight="duotone" />
            {cost.toLocaleString('es-ES')}
          </span>
          {hasCooldown && cooldownRemainingSec > 0 && (
            <span className="text-[10px] text-text-muted">
              ⏱ {fmtCooldown(cooldownRemainingSec)}
            </span>
          )}
          {disabled && disabledReason && (
            <span className="text-[10px] text-red-400/80 truncate">
              {disabledReason.replace('cp.reward.disabled.', '')}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
