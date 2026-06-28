// ============================================================
// DiskSpaceIndicator.jsx — Barra fina de espacio en disco (G1 / WT-20260628-16)
// ============================================================
// Bottom bar, fina horizontal, con % usado del disco.
// Colores:
//   - verde: <70%
//   - amarillo: 70-85%
//   - rojo: >85%
//
// Tooltip: "X GB libres de Y GB totales"
// Click: placeholder "Próximamente: settings de grabación"
//
// FIX P1-4: consume el RecordingContext compartido (antes montaba
// su propio polling — ahora 1 polling para los 3 componentes).
//
// En el MVP no conocemos el espacio TOTAL (el backend devuelve solo
// el free). Mostramos una barra con el % usado estimado asumiendo
// 100 GB de disco como baseline. En G2 calcularemos el total real
// y barraremos bien.
// ============================================================

import { useRecordingContext } from './useRecordingContext'
import { t } from '../../utils/i18n'

// Baseline arbitrario para el MVP. En G2 lo reemplazamos por el
// valor real calculado en el backend.
const BASELINE_TOTAL_GB = 100

function getBarColor(pctUsed) {
  if (pctUsed < 70) return 'bg-emerald-500'
  if (pctUsed < 85) return 'bg-yellow-400'
  return 'bg-red-500'
}

export default function DiskSpaceIndicator() {
  // FIX P1-4: lee del context compartido. Cero pollees propios.
  const { diskFreeGb } = useRecordingContext()

  // Si no hay dato, mostramos un placeholder discreto.
  const hasData = typeof diskFreeGb === 'number'
  const free = hasData ? Math.max(0, diskFreeGb) : null
  // Cap a BASELINE_TOTAL_GB para que la barra no se vea "llena" en
  // SSDs grandes. Es un tradeoff de MVP.
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
        // Placeholder: en G2 abrira el tab de settings de grabacion.
        console.info('[DiskSpaceIndicator] Click — settings de grabación (diferido a G2)')
      }}
    >
      <div
        className={`h-full ${color} transition-all duration-500`}
        style={{ width: `${pctUsed}%` }}
      />
      {/* Tooltip custom on hover (CSS-only). El title nativo aparece
          tras 1-2s; este es instantaneo. */}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded bg-bg-primary border border-bg-tertiary/60 text-[10px] text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
        {tooltip}
      </div>
    </div>
  )
}
