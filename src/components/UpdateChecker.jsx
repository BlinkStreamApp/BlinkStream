import { useEffect, useState } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export default function UpdateChecker() {
  const [update, setUpdate] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let cancelled = false

    const checkUpdate = async () => {
      try {
        const result = await check()
        if (!cancelled) setUpdate(result)
      } catch {
      }
    }

    checkUpdate()
    return () => { cancelled = true }
  }, [])

  const handleUpdate = async () => {
    if (!update?.available) return
    setDownloading(true)
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Progress') setProgress(event.data.progress || 0)
      })
      await relaunch()
    } catch {
      setDownloading(false)
    }
  }

  if (!update?.available) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-bg-secondary/95 backdrop-blur-sm border border-twitch/30 rounded-xl shadow-2xl p-4 max-w-sm animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="text-twitch shrink-0 mt-0.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">Actualización disponible</p>
          <p className="text-xs text-text-muted mt-0.5">
            {update.version ? `v${update.version}` : 'Nueva versión'} — {update.body ? update.body.slice(0, 80) : 'lista para instalar'}
          </p>
          {downloading && (
            <div className="mt-2">
              <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-twitch rounded-full transition-all duration-300"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-text-muted/60 mt-0.5">{Math.round(progress * 100)}%</p>
            </div>
          )}
        </div>
        {!downloading && (
          <button
            onClick={handleUpdate}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-twitch text-white text-xs font-medium cursor-pointer hover:bg-twitch-dark transition-colors"
          >
            Actualizar
          </button>
        )}
      </div>
    </div>
  )
}
