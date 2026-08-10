
import { useEffect } from 'react'

export function Toast({ message, channel, logo, onClick, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <button
      onClick={() => { onClick?.(); onDismiss() }}
      className="flex items-center gap-3 bg-bg-secondary/90 backdrop-blur-sm border border-bg-tertiary/60 rounded-xl px-4 py-3 shadow-lg cursor-pointer hover:bg-hover transition-colors animate-slide-right max-w-[360px]"
    >
      {logo ? (
        <img src={logo} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-twitch flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">{channel?.charAt(0).toUpperCase()}</span>
        </div>
      )}
      <div className="min-w-0 flex-1 text-left">
        <p className="text-[13px] font-semibold text-text-primary truncate">{channel} está en vivo</p>
        <p className="text-[11px] text-text-secondary truncate">{message}</p>
      </div>
      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse-dot shrink-0" />
    </button>
  )
}
