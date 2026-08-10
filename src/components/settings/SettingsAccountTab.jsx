

import { useT } from '../../utils/i18n'
import { useAuth } from '../../hooks/useAuth'

export function SettingsAccountTab() {
  const t = useT()
  const { user, avatar, logout } = useAuth()

  const twitchUsername = user?.username
    || user?.identities?.[0]?.identity_data?.login
    || null
  const twitchAvatar = avatar
  const logged = !!twitchUsername

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-text-secondary mb-2 block">Cuenta de Twitch</label>
        {logged ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-tertiary/50 border border-bg-tertiary/60">
            <div className="w-12 h-12 rounded-full bg-twitch flex items-center justify-center overflow-hidden shrink-0">
              {twitchAvatar ? (
                <img src={twitchAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-lg font-bold">{(twitchUsername || 'U').charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-primary truncate">{twitchUsername}</p>
              <p className="text-[11px] text-green-400/80">✓ {t('connected')}</p>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-text-muted">No has iniciado sesión.</p>
        )}
      </div>

      {logged && (
        <button
          onClick={logout}
          className="w-full text-sm py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors cursor-pointer"
        >
          {t('logout')}
        </button>
      )}

      <div className="border-t border-bg-tertiary/50 pt-4">
        <p className="text-[11px] text-text-muted/50 leading-relaxed">
          Tus datos de sesión se guardan localmente. BlinkStream nunca comparte tu información con terceros.
        </p>
      </div>
    </div>
  )
}
