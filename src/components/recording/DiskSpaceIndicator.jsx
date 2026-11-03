import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getLanguage, useT } from '../../utils/i18n'

export default function DiskSpaceIndicator({ directory = '' }) {
  const t = useT()
  const folder = directory.trim() ? directory : ''
  const [result, setResult] = useState(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!folder) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const data = await invoke('recorder_get_global_state', { directory: folder })
        const free = data?.diskFreeGb, total = data?.diskTotalGb
        const valid = Number.isFinite(free) && free >= 0 && Number.isFinite(total) && total > 0 && free <= total
        if (!cancelled) setResult({ folder, revision, status: valid ? 'ok' : 'unknown', free, total })
      } catch {
        if (!cancelled) setResult({ folder, revision, status: 'unknown' })
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [folder, revision])
  const current = result?.folder === folder && result?.revision === revision ? result : null
  const format = value => new Intl.NumberFormat(getLanguage(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
  const message = !folder ? t('rec.disk.selectFolder', 'Selecciona una carpeta para consultar su espacio disponible.')
    : !current ? t('rec.disk.checking', 'Consultando espacio disponible…')
      : current.status !== 'ok' ? t('rec.disk.unknown', 'Espacio en disco desconocido')
        : t('rec.disk.available', '{free} GiB disponibles de {total} GiB').replace('{free}', format(current.free)).replace('{total}', format(current.total))
  return <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-text-muted">
    <span role="status">{message}</span>
    {folder && <button type="button" onClick={() => setRevision(value => value + 1)} className="shrink-0 text-twitch-light hover:underline cursor-pointer">{t('rec.disk.refresh', 'Actualizar')}</button>}
  </div>
}
