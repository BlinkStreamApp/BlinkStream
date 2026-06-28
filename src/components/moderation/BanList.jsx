/**
 * @file Lista de baneados permanentes (M-1 / WT-20260628-13).
 * Muestra username, razon y fecha de ban. Accion: Unban con confirm.
 *
 * @typedef {object} BanEntry
 * @property {string} user_id
 * @property {string} user_login
 * @property {string} user_name
 * @property {string} [reason]
 * @property {string} [expires_at]   - ISO (vacio para permanentes)
 * @property {string} [created_at]
 * @property {string} [moderator_login] - quien baneó
 *
 * @typedef {object} BanListProps
 * @property {BanEntry[]} bans
 * @property {(ban: BanEntry) => void} [onUnban]
 * @property {boolean} [loading]
 */

export function BanList({ bans, onUnban, loading }) {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-3 py-2 border-b border-bg-tertiary/40 flex items-center justify-between">
        <p className="text-[11px] font-semibold text-text-primary">Baneados</p>
        <span className="text-[10px] text-text-muted/60">{bans.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-3 text-center text-[11px] text-text-muted">
            <span className="inline-block w-3 h-3 border border-twitch border-t-transparent rounded-full animate-spin mr-1.5" />
            Cargando baneados...
          </div>
        )}
        {!loading && bans.length === 0 && (
          <p className="p-3 text-[11px] text-text-muted/60 text-center">No hay usuarios baneados. ¡Bien!</p>
        )}
        {!loading && bans.length > 0 && (
          <ul className="divide-y divide-bg-tertiary/30">
            {bans.map(b => (
              <li key={b.user_id} className="px-2 py-1.5 hover:bg-hover/30">
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-full bg-red-500/20 flex items-center justify-center overflow-hidden shrink-0">
                    <span className="text-red-400 text-[10px] font-bold">
                      {(b.user_login || b.user_name || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-red-400 truncate">
                      {b.user_name || b.user_login}
                    </p>
                    {b.reason && (
                      <p className="text-[10px] text-text-muted/80 leading-tight mt-0.5 line-clamp-2">
                        "{b.reason}"
                      </p>
                    )}
                    <p className="text-[9px] text-text-muted/50 mt-0.5">
                      {b.created_at && `${new Date(b.created_at).toLocaleDateString()}`}
                      {b.moderator_login && ` · por ${b.moderator_login}`}
                    </p>
                  </div>
                  {onUnban && (
                    <button
                      onClick={() => onUnban(b)}
                      className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 transition-colors cursor-pointer shrink-0"
                    >
                      Unban
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
