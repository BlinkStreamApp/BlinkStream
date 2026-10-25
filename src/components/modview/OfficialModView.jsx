import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri, safeOpenUrl } from '../../utils/tauriEnv'
import { isValidTwitchLogin } from '../../utils/twitch'
import { isDomElementVisible } from '../../utils/keyboard'
import { useT } from '../../utils/i18n'

const VideoPlayer = lazy(() => import('../VideoPlayer'))

export function OfficialModView({ channel, volume, onVolumeChange, quality, onQualityChange, isLoggedIn, twitchToken, twitchUsername, broadcasterId, onLoginWithToken }) {
  const t = useT()
  const containerRef = useRef(null)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  const [videoHeight, setVideoHeight] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('bs.modview.hybrid.height') || 35)
      return Number.isFinite(saved) ? Math.max(20, Math.min(60, saved)) : 35
    } catch { return 35 }
  })
  const cleanChannel = (channel || '').trim().toLowerCase()
  const valid = isValidTwitchLogin(cleanChannel)
  const changeHeight = value => {
    const height = Math.max(20, Math.min(60, Number(value)))
    if (!Number.isFinite(height)) return
    setVideoHeight(height)
    try { localStorage.setItem('bs.modview.hybrid.height', String(height)) } catch { /* storage unavailable */ }
  }

  useEffect(() => {
    if (!isTauri() || !valid) return undefined
    const session = crypto.randomUUID().replaceAll('-', '')
    let disposed = false
    let mounted = false
    let frame = null
    let lastSync = null
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
    const covered = () => document.hidden || Boolean(document.fullscreenElement) || !isDomElementVisible(containerRef.current) ||
      [...document.querySelectorAll('[role="dialog"], [data-modal="true"]')].some(isDomElementVisible)
    const fail = () => { if (!disposed) setFailed(true) }
    const sync = () => {
      if (disposed || !mounted || frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        if (disposed) return
        const current = bounds()
        if (current) lastBounds = current
        const visible = Boolean(current) && !covered()
        const signature = `${lastBounds.x},${lastBounds.y},${lastBounds.width},${lastBounds.height},${visible}`
        if (signature === lastSync) return
        lastSync = signature
        void invoke('update_official_modview_bounds', { session, ...lastBounds, visible }).catch(fail)
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
    document.addEventListener('fullscreenchange', sync)
    return () => {
      disposed = true
      resize.disconnect()
      modals.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
      document.removeEventListener('visibilitychange', sync)
      document.removeEventListener('fullscreenchange', sync)
      // A late mount can only close its own session, never the next channel's view.
      void mounting.finally(() => invoke('unmount_official_modview', { session }).catch(() => {}))
    }
  }, [cleanChannel, valid, attempt])

  return <div className="flex flex-col flex-1 min-h-0 bg-[#0e0e10]">
    <div className="shrink-0 flex flex-wrap items-center gap-3 px-3 py-2 text-xs text-text-muted border-b border-white/10">
      <span className="flex-1">{t('mod.official.session')}</span>
      <button type="button" disabled={!valid} aria-pressed={showVideo} className="px-2 py-1 rounded bg-white/10 aria-pressed:bg-twitch text-white cursor-pointer disabled:opacity-50" onClick={() => setShowVideo(value => !value)}>{t(showVideo ? 'mod.hybrid.hide' : 'mod.hybrid.show')}</button>
      {showVideo && <label className="flex items-center gap-2">
        {t('mod.hybrid.height')}
        <input type="range" min="20" max="60" step="5" value={videoHeight} aria-label={t('mod.hybrid.height')} onChange={event => changeHeight(event.target.value)} className="w-24 accent-twitch cursor-pointer" />
      </label>}
      <button type="button" className="text-white cursor-pointer" onClick={() => { setFailed(false); setAttempt(value => value + 1) }}>{t('mod.official.reload')}</button>
      {valid && <button type="button" className="text-twitch cursor-pointer" onClick={() => safeOpenUrl(`https://www.twitch.tv/moderator/${encodeURIComponent(cleanChannel)}`)}>{t('mod.official.browser')}</button>}
    </div>
    {(failed || !valid || !isTauri()) && <p role="alert" className="px-3 py-2 text-sm text-amber-300">{t(!isTauri() ? 'mod.official.desktop' : 'mod.official.failed')}</p>}
    {showVideo && <p className="shrink-0 px-3 py-1 text-xs text-amber-200 bg-amber-400/5">{t('mod.hybrid.hint')}</p>}
    <div className="flex flex-col flex-1 min-h-0">
      {showVideo && valid && <div data-testid="hybrid-video-panel" className="shrink-0 min-h-0 overflow-hidden bg-black border-b border-white/10" style={{ height: `${videoHeight}%` }}>
        <Suspense fallback={<p role="status" className="p-3 text-sm text-text-muted">{t('mod.hybrid.loading')}</p>}>
          <VideoPlayer channel={cleanChannel} volume={volume} onVolumeChange={onVolumeChange} quality={quality} onQualityChange={onQualityChange}
            isLoggedIn={isLoggedIn} twitchToken={twitchToken} twitchUsername={twitchUsername} broadcasterId={broadcasterId} onLoginWithToken={onLoginWithToken}
            theatreMode={true} onToggleTheatre={() => changeHeight(videoHeight >= 60 ? 35 : 60)} />
        </Suspense>
      </div>}
      <div ref={containerRef} data-testid="official-modview-host" className="flex-1 min-h-0 w-full" />
    </div>
  </div>
}
