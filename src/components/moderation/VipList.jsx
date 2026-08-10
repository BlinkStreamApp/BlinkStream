

export function VipList({ vips, onUnvip, isBroadcaster, loading }) {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-3 py-2 border-b border-bg-tertiary/40 flex items-center justify-between">
        <p className="text-[11px] font-semibold text-text-primary">VIPs</p>
        <span className="text-[10px] text-text-muted/60">{vips.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-3 text-center text-[11px] text-text-muted">
            <span className="inline-block w-3 h-3 border border-twitch border-t-transparent rounded-full animate-spin mr-1.5" />
            Cargando VIPs...
          </div>
        )}
        {!loading && vips.length === 0 && (
          <p className="p-3 text-[11px] text-text-muted/60 text-center">Este canal aún no tiene VIPs.</p>
        )}
        {!loading && vips.length > 0 && (
          <ul className="divide-y divide-bg-tertiary/30">
            {vips.map(v => (
              <li key={v.user_id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-hover/30">
                <div className="w-7 h-7 rounded-full bg-pink-500/20 flex items-center justify-center overflow-hidden shrink-0">
                  {v.avatar ? (
                    <img src={v.avatar} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-pink-400 text-[10px] font-bold">
                      {(v.user_login || v.user_name || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-pink-400 truncate">
                    {v.user_name || v.user_login}
                  </p>
                  {v.created_at && (
                    <p className="text-[9px] text-text-muted/50">desde {new Date(v.created_at).toLocaleDateString()}</p>
                  )}
                </div>
                {isBroadcaster && onUnvip && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onUnvip(v) }}
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
