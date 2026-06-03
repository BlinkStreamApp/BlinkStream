export default function LiveBadge({ size = 'sm' }) {
  const sizeClasses = size === 'lg'
    ? 'px-2.5 py-1 text-[11px]'
    : 'px-2 py-0.5 text-[10px]'

  return (
    <span className={`inline-flex items-center gap-1 ${sizeClasses} rounded-full bg-red-500/90 text-white font-bold uppercase tracking-wider shrink-0`}>
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse-dot" />
      LIVE
    </span>
  )
}
