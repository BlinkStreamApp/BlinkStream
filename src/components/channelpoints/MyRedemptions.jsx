

import { t } from '../../utils/i18n'

const STATUS_STYLES = {
  UNFULFILLED: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', label: 'cp.status.pending' },
  FULFILLED: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'cp.status.fulfilled' },
  CANCELED: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'cp.status.canceled' },
}

function fmtDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

export default function MyRedemptions({ redemptions, loading, error, onRefresh }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-twitch border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-6 text-[12px] text-red-400">
        {error}
        <button onClick={onRefresh} className="block mx-auto mt-2 text-twitch hover:underline">
          {t('retry') || 'Reintentar'}
        </button>
      </div>
    )
  }

  if (!redemptions || redemptions.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-[12px]">
        {t('cp.empty.myRedemptions')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {redemptions.map((rd) => {
        const status = STATUS_STYLES[rd.status] || STATUS_STYLES.UNFULFILLED
        return (
          <div
            key={rd.id}
            className="flex items-center gap-3 p-3 rounded-lg bg-bg-tertiary/30 border border-bg-tertiary/30"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-text-primary truncate">
                {rd.reward_title || rd.reward?.title || 'Reward'}
              </p>
              <p className="text-[10px] text-text-muted">{fmtDate(rd.redeemed_at)}</p>
              {rd.user_input && (
                <p className="text-[11px] text-text-secondary mt-1 line-clamp-1">"{rd.user_input}"</p>
              )}
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${status.bg} ${status.text}`}
            >
              {t(status.label)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
