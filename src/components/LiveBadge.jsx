export default function LiveBadge({ size = 'sm', onClick, title }) {
  const sizeClasses = size === 'lg'
    ? 'px-2.5 py-1 text-[11px]'
    : 'px-2 py-0.5 text-[10px]'

  const Tag = onClick ? 'button' : 'span'

  return (
    <Tag
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1 ${sizeClasses} rounded-full bg-red-500/90 text-white font-bold uppercase tracking-wider shrink-0 select-none ${onClick ? 'cursor-pointer hover:bg-red-600 hover:scale-105 active:scale-95 transition-all shadow-sm' : ''}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse-dot" />
      LIVE
    </Tag>
  )
}
