

export function ModList({ mods, onUnmod, isBroadcaster, loading }) {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-3 py-2 border-b border-bg-tertiary/40 flex items-center justify-between">
        <p className="text-[11px] font-semibold text-text-primary">Moderadores</p>
        <span className="text-[10px] text-text-muted/60">{mods.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-3 text-center text-[11px] text-text-muted">
            <span className="inline-block w-3 h-3 border border-twitch border-t-transparent rounded-full animate-spin mr-1.5" />
            Cargando mods...
          </div>
        )}
        {!loading && mods.length === 0 && (
          <p className="p-3 text-[11px] text-text-muted/60 text-center">Este canal aún no tiene moderadores.</p>
        )}
        {!loading && mods.length > 0 && (
          <ul className="divide-y divide-bg-tertiary/30">
            {mods.map(m => (
              <li key={m.user_id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-hover/30">
                <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center overflow-hidden shrink-0">
                  {m.avatar ? (
                    <img src={m.avatar} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-green-400 text-[10px] font-bold">
                      {(m.user_login || m.user_name || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-green-400 truncate">
                    {m.user_name || m.user_login}
                  </p>
                  {m.created_at && (
                    <p className="text-[9px] text-text-muted/50">desde {new Date(m.created_at).toLocaleDateString()}</p>
                  )}
                </div>
                {isBroadcaster && onUnmod && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onUnmod(m) }}
                    className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
