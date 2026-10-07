export function RedemptionConnectionNotice({ connection }) {
  if (!connection || connection.state === 'idle') return null
  const connected = connection.state === 'connected'
  return (
    <p role="status" className={`shrink-0 px-3 py-2 text-[11px] border-b border-white/10 ${connected ? 'text-emerald-400' : 'text-text-muted'}`}>
      {connected ? 'Avisos de canjes conectados' : connection.message}
    </p>
  )
}
