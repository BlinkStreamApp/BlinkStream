import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri, safeOpenUrl } from '../../utils/tauriEnv'
import { isValidTwitchLogin } from '../../utils/twitch'
import { isDomElementVisible } from '../../utils/keyboard'
import { useT } from '../../utils/i18n'

export function OfficialModView({ channel }) {
  const t = useT()
  const containerRef = useRef(null)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const cleanChannel = (channel || '').trim().toLowerCase()
  const valid = isValidTwitchLogin(cleanChannel)

  useEffect(() => {
    if (!isTauri() || !valid) return undefined
    const session = crypto.randomUUID().replaceAll('-', '')
    let disposed = false
    let mounted = false
    let frame = null
    let lastBounds = { x: 0, y: 0, width: 1, height: 1 }
    const bounds = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return null
      const x = Math.max(0, Math.ceil(rect.left))
      const y = Math.max(0, Math.ceil(rect.top))
      const width = Math.floor(Math.min(rect.right, window.innerWidth)) - x
      const height = Math.floor(Math.min(rect.bottom, window.innerHeight)) - y
      return width > 0 && height > 0 ? { x, y, width, height } : null
    }
    const covered = () => document.hidden || !isDomElementVisible(containerRef.current) ||
      [...document.querySelectorAll('[role="dialog"], [data-modal="true"]')].some(isDomElementVisible)
    const fail = () => { if (!disposed) setFailed(true) }
    const sync = () => {
      if (disposed || !mounted || frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        if (disposed) return
        const current = bounds()
        if (current) lastBounds = current
        void invoke('update_official_modview_bounds', { session, ...lastBounds, visible: Boolean(current) && !covered() }).catch(fail)
      })
    }
    const mounting = (async () => {
      try {
        const initial = bounds()
        if (!initial) throw new Error('No visible bounds')
        lastBounds = initial
        await invoke('mount_official_modview', { session, channel: cleanChannel, ...initial })
        if (disposed) return
        mounted = true
        sync()
      } catch { fail() }
    })()
    const resize = new ResizeObserver(sync)
    resize.observe(containerRef.current)
    const modals = new MutationObserver(sync)
    modals.observe(document.body, { childList: true, subtree: true, attributes: true })
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    document.addEventListener('visibilitychange', sync)
    return () => {
      disposed = true
      resize.disconnect()
      modals.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
      document.removeEventListener('visibilitychange', sync)
      // A late mount can only close its own session, never the next channel's view.
      void mounting.finally(() => invoke('unmount_official_modview', { session }).catch(() => {}))
    }
  }, [cleanChannel, valid, attempt])

  return <div className="flex flex-col flex-1 min-h-0 bg-[#0e0e10]">
    <div className="shrink-0 flex flex-wrap items-center gap-3 px-3 py-2 text-xs text-text-muted border-b border-white/10">
      <span className="flex-1">{t('mod.official.session')}</span>
      <button type="button" className="text-white cursor-pointer" onClick={() => { setFailed(false); setAttempt(value => value + 1) }}>{t('mod.official.reload')}</button>
      {valid && <button type="button" className="text-twitch cursor-pointer" onClick={() => safeOpenUrl(`https://www.twitch.tv/moderator/${encodeURIComponent(cleanChannel)}`)}>{t('mod.official.browser')}</button>}
    </div>
    {(failed || !valid || !isTauri()) && <p role="alert" className="px-3 py-2 text-sm text-amber-300">{t(!isTauri() ? 'mod.official.desktop' : 'mod.official.failed')}</p>}
    <div ref={containerRef} data-testid="official-modview-host" className="flex-1 min-h-0 w-full" />
  </div>
}
