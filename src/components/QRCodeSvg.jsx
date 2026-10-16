import QRCode from 'qrcode'
import { useT } from '../utils/i18n'

export default function QRCodeSvg({ value, size = 220, fgColor = '#000000', bgColor = '#ffffff', className = '' }) {
  const t = useT()
  if (!value || value.length > 2048) return null
  let code
  try { code = QRCode.create(value, { errorCorrectionLevel: 'M' }) }
  catch { return <p role="alert">{t('qr.error')}</p> }
  const matrix = code.modules
  const paths = []
  for (let row = 0; row < matrix.size; row++) {
    for (let column = 0; column < matrix.size; column++) {
      if (matrix.get(row, column)) paths.push(`M${column + 4},${row + 4}h1v1h-1z`)
    }
  }
  return <div className={`flex w-full max-w-full flex-col items-center gap-2 overflow-hidden ${className}`}>
    <div className="rounded-2xl border border-cyan-500/30 bg-white p-2 shadow-lg">
      <svg role="img" aria-label={t('qr.label')} width={size} height={size} viewBox={`0 0 ${matrix.size + 8} ${matrix.size + 8}`} shapeRendering="crispEdges" className="rounded-lg">
        <rect width="100%" height="100%" fill={bgColor} />
        <path d={paths.join('')} fill={fgColor} />
      </svg>
    </div>
    <span className="text-center text-[11px] text-white/60">{t('qr.warning')}</span>
    <a href={/^https?:\/\//i.test(value) ? value : undefined} target="_blank" rel="noopener noreferrer" className="max-w-full truncate text-xs text-cyan-400 underline">{t('qr.open')}</a>
  </div>
}
