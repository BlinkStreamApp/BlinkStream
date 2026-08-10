

import { useEffect, useState } from 'react'
import { formatRemaining } from '../../hooks/useModeration'

function useTick(intervalMs = 1000) {
  const [, setN] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setN(n => n + 1), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
}

export function TimeoutList({ timeouts, onUntimeout, loading }) {

  useTick(1000)

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-3 py-2 border-b border-bg-tertiary/40 flex items-center justify-between">
        <p className="text-[11px] font-semibold text-text-primary">Timeouts activos</p>
        <span className="text-[10px] text-text-muted/60">{timeouts.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-3 text-center text-[11px] text-text-muted">
            <span className="inline-block w-3 h-3 border border-twitch border-t-transparent rounded-full animate-spin mr-1.5" />
            Cargando timeouts...
          </div>
        )}
        {!loading && timeouts.length === 0 && (
          <p className="p-3 text-[11px] text-text-muted/60 text-center">No hay timeouts activos.</p>
        )}
        {!loading && timeouts.length > 0 && (
          <ul className="divide-y divide-bg-tertiary/30">
            {timeouts.map(t => {

              // eslint-disable-next-line react-hooks/purity
              const now = Date.now()
              const remaining = t.expires_at ? Math.max(0, Math.floor((new Date(t.expires_at).getTime() - now) / 1000)) : 0
              return (
                <li key={t.user_id} className="px-2 py-1.5 hover:bg-hover/30">
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center overflow-hidden shrink-0">
                      <span className="text-orange-400 text-[10px] font-bold">
                        {(t.user_login || t.user_name || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-semibold text-orange-400 truncate">
                          {t.user_name || t.user_login}
                        </p>
                        <span className="text-[10px] font-mono tabular-nums text-text-muted/80 bg-bg-tertiary/50 px-1 rounded">
                          {formatRemaining(remaining)}
                        </span>
                      </div>
                      {t.reason && (
                        <p className="text-[10px] text-text-muted/80 leading-tight mt-0.5 line-clamp-2">
                          "{t.reason}"
                        </p>
                      )}
                    </div>
                    {onUntimeout && (
                      <button
                        onClick={() => onUntimeout(t)}
                        className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 transition-colors cursor-pointer shrink-0"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
