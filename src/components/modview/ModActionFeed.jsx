import PhosphorIcon from '../icons/PhosphorIcon'
import { useT } from '../../utils/i18n'

export function ModActionFeed({ auditLog = [], onInspectUser }) {
  const t = useT()
  if (auditLog.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-text-muted select-none">
        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-2 text-white/30">
          <PhosphorIcon name="ClockCounterClockwise" size={20} weight="duotone" />
        </div>
        <p className="text-xs font-semibold text-white/70">{t('mod.audit.empty', 'Sin acciones recientes')}</p>
        <p className="text-[10px] text-text-muted mt-0.5">
          {t('mod.audit.emptyDesc', 'Las sanciones y cambios de moderación se registrarán aquí en vivo.')}
        </p>
      </div>
    )
  }

  const formatActionTitle = (entry) => {
    switch (entry.action) {
      case 'ban':
        return { label: 'BAN PERMANENTE', color: 'text-red-400 bg-red-500/10 border-red-500/30' }
      case 'unban':
        return { label: 'DESBANEO / UNBAN', color: 'text-green-400 bg-green-500/10 border-green-500/30' }
      case 'timeout':
        return { label: `TIMEOUT (${entry.duration || 600}s)`, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' }
      case 'delete_message':
        return { label: 'MENSAJE ELIMINADO', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' }
      case 'clear':
        return { label: 'CHAT VACIADO (/clear)', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' }
      case 'chat_mode':
        return { label: `MODO: ${entry.target || 'Actualizado'}`, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' }
      default:
        return { label: entry.action.toUpperCase(), color: 'text-white/70 bg-white/10 border-white/15' }
    }
  }

  return (
    <div className="h-full overflow-y-auto space-y-2 p-3 font-sans">
      {auditLog.slice().reverse().map((entry, index) => {
        const style = formatActionTitle(entry)
        const timeStr = entry.timestamp
          ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : ''

        return (
          <div
            key={entry.id || `mod-entry-${index}`}
            className={`p-2.5 rounded-xl border bg-white/[0.03] transition-all hover:bg-white/[0.06] ${
              entry.success === false ? 'border-red-500/30' : 'border-white/10'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${style.color}`}>
                {style.label}
              </span>
              <span className="text-[10px] text-text-muted/60 font-mono">{timeStr}</span>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0 flex-1">
                {entry.targetName && (
                  <button
                    onClick={() => onInspectUser?.({ username: entry.targetName, userId: entry.target })}
                    className="font-bold text-white hover:text-twitch-glow hover:underline truncate cursor-pointer"
                  >
                    @{entry.targetName}
                  </button>
                )}
                {entry.reason && (
                  <p className="text-[10px] text-text-muted mt-0.5 break-words">
                    Motivo: <span className="text-white/80">{entry.reason}</span>
                  </p>
                )}
                {entry.error && (
                  <p className="text-[10px] text-red-400 mt-0.5 break-words">
                    Error: {entry.error}
                  </p>
                )}
              </div>

              {entry.success !== false ? (
                <PhosphorIcon name="CheckCircle" size={14} weight="fill" className="text-green-400 shrink-0" />
              ) : (
                <PhosphorIcon name="WarningCircle" size={14} weight="fill" className="text-red-400 shrink-0" />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
