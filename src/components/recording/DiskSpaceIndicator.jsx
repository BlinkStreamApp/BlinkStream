

import { useRecordingContext } from './useRecordingContext'
import { t } from '../../utils/i18n'

const BASELINE_TOTAL_GB = 100

function getBarColor(pctUsed) {
  if (pctUsed < 70) return 'bg-emerald-500'
  if (pctUsed < 85) return 'bg-yellow-400'
  return 'bg-red-500'
}

export default function DiskSpaceIndicator() {

  const { diskFreeGb } = useRecordingContext()

  const hasData = typeof diskFreeGb === 'number'
  const free = hasData ? Math.max(0, diskFreeGb) : null

  const total = BASELINE_TOTAL_GB
  const used = hasData ? Math.max(0, total - free) : 0
  const pctUsed = hasData ? Math.min(100, (used / total) * 100) : 0
  const color = getBarColor(pctUsed)

  const tooltip = hasData
    ? `${free.toFixed(1)} GB libres de ${total} GB totales`
    : t('rec.disk.unknown')

  return (
    <div
      className="w-full h-1.5 bg-bg-tertiary/40 cursor-pointer relative group"
      title={tooltip}
      role="progressbar"
      aria-label={t('rec.disk.aria')}
      aria-valuenow={hasData ? Math.round(pctUsed) : 0}
      aria-valuemin={0}
      aria-valuemax={100}
      onClick={() => {

        console.info('[DiskSpaceIndicator] Click — settings de grabación (diferido a G2)')
      }}
    >
      <div
        className={`h-full ${color} transition-all duration-500`}
        style={{ width: `${pctUsed}%` }}
      />
      {}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded bg-bg-primary border border-bg-tertiary/60 text-[10px] text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
        {tooltip}
      </div>
    </div>
  )
}
