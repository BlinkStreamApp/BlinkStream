import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isTauri, safeOpenUrl } from '../../utils/tauriEnv'
import { isValidTwitchLogin } from '../../utils/twitch'
import { isDomElementVisible } from '../../utils/keyboard'
import PhosphorIcon from '../icons/PhosphorIcon'
import { useT } from '../../utils/i18n'
import { useOfficialVideoSlot } from '../../hooks/useOfficialVideoSlot'

const VideoPlayer = lazy(() => import('../VideoPlayer'))

export function OfficialModView({ channel, volume, onVolumeChange, quality, onQualityChange, isLoggedIn, twitchToken, twitchUsername, broadcasterId, onLoginWithToken }) {
  const t = useT()
  const containerRef = useRef(null)
  const workspaceRef = useRef(null)
  const videoPanelRef = useRef(null)
  const cornerRef = useRef(false)
  const [supportsCorner, setSupportsCorner] = useState(false)
  const [cornerFailed, setCornerFailed] = useState(false)
  const [slotMissing, setSlotMissing] = useState(false)
  const [layout, setLayout] = useState(() => {
    try { return localStorage.getItem('bs.modview.hybrid.layout') === 'corner' ? 'corner' : 'columns' } catch { return 'columns' }
  })
  const gestureRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)
  const [dock, setDock] = useState(() => {
    try { const saved = localStorage.getItem('bs.modview.hybrid.dock'); return ['left', 'right', 'top', 'bottom'].includes(saved) ? saved : 'left' } catch { return 'left' }
  })
  const vertical = dock === 'top' || dock === 'bottom'
  const changeDock = value => {
    if (!['left', 'right', 'top', 'bottom'].includes(value)) return
    setDock(value)
    try { localStorage.setItem('bs.modview.hybrid.dock', value) } catch {}
  }
  const syncRef = useRef(null)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  const [detached, setDetached] = useState(false)
  const [movingTools, setMovingTools] = useState(false)
  const [moveFailed, setMoveFailed] = useState(false)
  const [nativeReady, setNativeReady] = useState(false)
  const [toolsPageRevision, setToolsPageRevision] = useState(0)
  const cornerLayout = supportsCorner && layout === 'corner' && showVideo && !detached
  const sessionRef = useRef(null)
  const moveToolsRef = useRef(null)
  const movePendingRef = useRef(false)
  const [compactVideo, setCompactVideo] = useState(false)
  const [toolsZoom, setToolsZoom] = useState(() => {
    try { const saved = localStorage.getItem('bs.modview.tools.zoom'); return ['1', '0.9', '0.8', '0.7'].includes(saved) ? saved : 'auto' } catch { return 'auto' }
  })
  const zoomRef = useRef(toolsZoom === 'auto' ? null : Number(toolsZoom))
  const [videoWidth, setVideoWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('bs.modview.hybrid.width') || 35)
      return Number.isFinite(saved) ? Math.max(25, Math.min(45, saved)) : 35
    } catch { return 35 }
  })
  const cleanChannel = (channel || '').trim().toLowerCase()
  const valid = isValidTwitchLogin(cleanChannel)
  const slot = useOfficialVideoSlot(cornerLayout && nativeReady, sessionRef, `${cleanChannel}:${attempt}:${toolsZoom}:${toolsPageRevision}`, () => {
    setLayout('columns')
    setSlotMissing(true)
    try { localStorage.setItem('bs.modview.hybrid.layout', 'columns') } catch {}
  })
  const changeWidth = value => {
    const width = Math.max(25, Math.min(45, Number(value)))
    if (!Number.isFinite(width)) return
    setVideoWidth(width)
    try { localStorage.setItem('bs.modview.hybrid.width', String(width)) } catch { /* storage unavailable */ }
  }

  const moveTools = async next => {
    const session = sessionRef.current
    if (!session || movePendingRef.current) return
    movePendingRef.current = true
    setMovingTools(true)
    setMoveFailed(false)
    try {
      await invoke('set_official_modview_detached', { session, detached: next })
      if (sessionRef.current === session) { setDetached(next); setToolsPageRevision(value => value + 1) }
    } catch {
      if (sessionRef.current === session) setMoveFailed(true)
    } finally {
      movePendingRef.current = false
      if (sessionRef.current === session) {
        setMovingTools(false)
        syncRef.current?.(true)
      }
    }
  }
  useEffect(() => { moveToolsRef.current = moveTools })
  useEffect(() => {
    cornerRef.current = cornerLayout && Boolean(slot)
    syncRef.current?.(true)
  }, [cornerLayout, slot])

  const startGesture = (event, kind) => {
    if (event.button !== 0 || !workspaceRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    gestureRef.current = { pointer: event.pointerId, kind }
    draggingRef.current = true
    setDragging(true)
    syncRef.current?.()
  }
  const moveGesture = event => {
    const gesture = gestureRef.current
    const bounds = workspaceRef.current?.getBoundingClientRect()
    if (!gesture || gesture.pointer !== event.pointerId || !bounds?.width || !bounds.height) return
    if (gesture.kind === 'resize') {
      const fraction = vertical ? (event.clientY - bounds.top) / bounds.height : (event.clientX - bounds.left) / bounds.width
      changeWidth((dock === 'right' || dock === 'bottom' ? 1 - fraction : fraction) * 100)
    }
  }
  const endGesture = event => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointer !== event.pointerId) return
    const rect = workspaceRef.current?.getBoundingClientRect()
    if (gesture.kind === 'move' && event.type !== 'pointercancel' && rect?.width && rect.height) {
      const x = (event.clientX - rect.left) / rect.width
      const y = (event.clientY - rect.top) / rect.height
      const nearest = [['left', x], ['right', 1 - x], ['top', y], ['bottom', 1 - y]].sort((a, b) => a[1] - b[1])[0][0]
      changeDock(nearest)
    }
    gestureRef.current = null
    draggingRef.current = false
    setDragging(false)
    syncRef.current?.()
  }

  useEffect(() => {
    syncRef.current?.()
  }, [dock, videoWidth, showVideo, detached])

  useEffect(() => {
    zoomRef.current = toolsZoom === 'auto' ? null : Number(toolsZoom)
    syncRef.current?.()
    try { localStorage.setItem('bs.modview.tools.zoom', toolsZoom) } catch { /* storage unavailable */ }
  }, [toolsZoom])

  useEffect(() => {
    if (!isTauri() || !valid) return undefined
    const session = crypto.randomUUID().replaceAll('-', '')
    sessionRef.current = session
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
    const covered = () => draggingRef.current || document.hidden || Boolean(document.fullscreenElement) || !isDomElementVisible(containerRef.current) ||
      [...document.querySelectorAll('[role="dialog"], [data-modal="true"]')].some(isDomElementVisible)
    const fail = () => { if (!disposed) setFailed(true) }
    const sync = (force = false) => {
      if (force === true) lastSync = null
      if (disposed || !mounted || frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        if (disposed) return
        const current = bounds()
        if (current) lastBounds = current
        const visible = Boolean(current) && !covered()
        const zoom = zoomRef.current
        const panel = cornerRef.current ? videoPanelRef.current?.getBoundingClientRect() : null
        let corner = null
        if (panel && panel.width > 0 && panel.height > 0) {
          const x = Math.max(0, Math.floor(panel.left - lastBounds.x)), y = Math.max(0, Math.floor(panel.top - lastBounds.y))
          corner = { x, y, width: Math.min(lastBounds.width, Math.ceil(panel.right - lastBounds.x)) - x, height: Math.min(lastBounds.height, Math.ceil(panel.bottom - lastBounds.y)) - y }
        }
        const signature = `${lastBounds.x},${lastBounds.y},${lastBounds.width},${lastBounds.height},${visible},${zoom},${corner?.x},${corner?.y},${corner?.width},${corner?.height}`
        if (signature === lastSync) return
        lastSync = signature
        void invoke('update_official_modview_bounds', { session, ...lastBounds, visible, zoom, corner }).catch(() => {
          if (disposed) return
          if (corner) {
            setLayout('columns')
            setCornerFailed(true)
            try { localStorage.setItem('bs.modview.hybrid.layout', 'columns') } catch {}
          } else fail()
        })
      })
    }
    const mounting = (async () => {
      try {
        const initial = bounds()
        if (!initial) throw new Error('No visible bounds')
        lastBounds = initial
        const cornerAvailable = await invoke('mount_official_modview', { session, channel: cleanChannel, ...initial, zoom: zoomRef.current })
        if (disposed) return
        mounted = true
        setSupportsCorner(cornerAvailable === true)
        setNativeReady(true)
        sync()
      } catch { fail() }
    })()
    syncRef.current = sync
    const resize = new ResizeObserver(sync)
    resize.observe(containerRef.current)
    const modals = new MutationObserver(sync)
    modals.observe(document.body, { childList: true, subtree: true, attributes: true })
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    document.addEventListener('visibilitychange', sync)
    document.addEventListener('fullscreenchange', sync)
    const listening = listen('bs:official-modview-dock', event => {
      if (!disposed && event.payload === session) void moveToolsRef.current?.(false)
    }).catch(() => null)
    return () => {
      disposed = true
      if (sessionRef.current === session) sessionRef.current = null
      void listening.then(unlisten => unlisten?.())
      if (syncRef.current === sync) syncRef.current = null
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
      <button type="button" disabled={!nativeReady || movingTools} aria-pressed={detached} className="flex items-center gap-2 px-2 py-1 rounded border border-white/15 bg-white/5 text-white cursor-pointer disabled:opacity-50" onClick={() => moveTools(!detached)}>
        <PhosphorIcon name={detached ? 'ArrowsInSimple' : 'ArrowSquareOut'} size={15} />{t(detached ? 'mod.tools.dock' : 'mod.tools.detach')}
      </button>
      {showVideo && !detached && supportsCorner && <label className="flex items-center gap-2">{t('mod.tools.layout')}
        <select aria-label={t('mod.tools.layout')} value={layout} onChange={event => { setLayout(event.target.value); setCornerFailed(false); setSlotMissing(false); try { localStorage.setItem('bs.modview.hybrid.layout', event.target.value) } catch {} }} className="rounded border border-white/15 bg-bg-secondary px-2 py-1 text-white">
          <option value="columns">{t('mod.tools.columns')}</option><option value="corner">{t('mod.tools.corner')}</option>
        </select>
      </label>}
      {showVideo && !detached && !cornerLayout && <label className="flex items-center gap-2">{t('mod.dock.position')}
        <select aria-label={t('mod.dock.position')} value={dock} onChange={event => changeDock(event.target.value)} className="rounded border border-white/15 bg-bg-secondary px-2 py-1 text-white">
          {['left', 'right', 'top', 'bottom'].map(side => <option key={side} value={side}>{t(`mod.dock.${side}`)}</option>)}
        </select>
      </label>}
      {showVideo && !detached && !cornerLayout && <label className="flex items-center gap-2">
        {t('mod.dock.size')}
        <input type="range" min="25" max="45" step="5" value={videoWidth} aria-label={t('mod.dock.size')} onChange={event => changeWidth(event.target.value)} className="w-24 accent-twitch cursor-pointer" />
      </label>}
      <label className="flex items-center gap-2">{t('mod.official.scale')}
        <select aria-label={t('mod.official.scale')} value={toolsZoom} onChange={event => setToolsZoom(event.target.value)} className="bg-bg-secondary rounded border border-white/15 px-2 py-1 text-white">
          <option value="auto">{t('mod.official.autoScale')}</option>
          {['1', '0.9', '0.8', '0.7'].map(value => <option key={value} value={value}>{Math.round(Number(value) * 100)}%</option>)}
        </select>
      </label>
      <button type="button" disabled={movingTools} className="text-white cursor-pointer disabled:opacity-50" onClick={() => { setFailed(false); setDetached(false); setNativeReady(false); setAttempt(value => value + 1) }}>{t('mod.official.reload')}</button>
      {valid && <button type="button" className="text-twitch cursor-pointer" onClick={() => safeOpenUrl(`https://www.twitch.tv/moderator/${encodeURIComponent(cleanChannel)}`)}>{t('mod.official.browser')}</button>}
    </div>
    {(failed || !valid || !isTauri()) && <p role="alert" className="px-3 py-2 text-sm text-amber-300">{t(!isTauri() ? 'mod.official.desktop' : 'mod.official.failed')}</p>}
    {moveFailed && <p role="alert" className="px-3 py-2 text-sm text-amber-300">{t('mod.tools.moveFailed')}</p>}
    {cornerFailed && <p role="alert" className="px-3 py-2 text-sm text-amber-300">{t('mod.tools.cornerFailed')}</p>}
    {slotMissing && showVideo && !detached && <p role="status" className="shrink-0 px-3 py-1 text-xs text-text-muted">{t('mod.tools.slotMissing')}</p>}
    {cornerLayout && <p role={!slot ? 'status' : undefined} className="shrink-0 px-3 py-1 text-xs text-text-muted">{t(slot ? 'mod.tools.slotHint' : 'mod.tools.slotMissing')}</p>}
    {detached && <p className="shrink-0 px-3 py-1 text-xs text-text-muted">{t('mod.tools.reloadHint')}</p>}
    <div ref={workspaceRef} data-testid="mod-workspace" className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden"
      style={{ flexDirection: vertical ? (dock === 'bottom' ? 'column-reverse' : 'column') : (dock === 'right' ? 'row-reverse' : 'row') }}>
      {showVideo && valid && <div ref={videoPanelRef} data-testid="hybrid-video-panel" className={`flex flex-col shrink-0 min-w-0 min-h-0 overflow-hidden bg-[#0a0a0f] ${cornerLayout ? '' : 'p-1 gap-1'}`} style={detached ? { width: '100%', height: '100%' } : cornerLayout ? { position: 'absolute', top: `${(slot?.y || 0) * 100}%`, left: `${(slot?.x || 0) * 100}%`, width: slot ? `${slot.width * 100}%` : `${videoWidth}%`, height: slot ? `${slot.height * 100}%` : 'auto', visibility: slot ? 'visible' : 'hidden', zIndex: 10 } : vertical ? { height: `${videoWidth}%`, width: '100%' } : { width: `${videoWidth}%` }}>
        <button type="button" hidden={detached || cornerLayout} onPointerDown={event => startGesture(event, 'move')} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture}
          aria-label={t('mod.dock.move')} title={t('mod.dock.move')} className="flex shrink-0 items-center gap-2 rounded bg-white/5 px-2 py-1 text-xs text-text-muted cursor-grab touch-none focus-visible:outline-2 focus-visible:outline-twitch">
          <PhosphorIcon name="SquaresFour" size={16} /><span>{t('mod.dock.move')}</span>
        </button>
        <div className="flex flex-1 min-h-0 min-w-0 items-center justify-center overflow-hidden">
        <div className="aspect-video max-h-full max-w-full overflow-hidden rounded-lg bg-black" style={{ width: vertical && !cornerLayout ? 'auto' : '100%', height: cornerLayout || vertical ? '100%' : 'auto' }}>
          <Suspense fallback={<p role="status" className="p-3 text-sm text-text-muted">{t('mod.hybrid.loading')}</p>}>
          <VideoPlayer channel={cleanChannel} volume={volume} onVolumeChange={onVolumeChange} quality={quality} onQualityChange={onQualityChange}
            isLoggedIn={isLoggedIn} twitchToken={twitchToken} twitchUsername={twitchUsername} broadcasterId={broadcasterId} onLoginWithToken={onLoginWithToken}
            compact={compactVideo} onToggleCompact={() => setCompactVideo(value => !value)} theatreMode={true} onToggleTheatre={() => changeWidth(videoWidth >= 45 ? 35 : 45)} />
          </Suspense>
        </div>
        </div>
        {!compactVideo && !detached && !cornerLayout && <p className="shrink-0 px-2 text-xs leading-relaxed text-text-muted">{t('mod.hybrid.hint')}</p>}
      </div>}
      {showVideo && valid && !detached && !cornerLayout && <div role="separator" tabIndex={0} aria-label={t('mod.dock.resize')} aria-orientation={vertical ? 'horizontal' : 'vertical'} aria-valuemin={25} aria-valuemax={45} aria-valuenow={Math.round(videoWidth)}
        onPointerDown={event => startGesture(event, 'resize')} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture}
        onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); const delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -2 : 2; changeWidth(videoWidth + (dock === 'right' || dock === 'bottom' ? -delta : delta)) } }}
        className={`shrink-0 bg-white/10 hover:bg-twitch focus-visible:bg-twitch outline-none touch-none ${vertical ? 'h-2 w-full cursor-row-resize' : 'w-2 h-full cursor-col-resize'}`} />}
      {dragging && <div aria-hidden="true" className="absolute inset-0 z-40 pointer-events-none border-4 border-dashed border-twitch/60 bg-twitch/5" />}
      <div ref={containerRef} data-testid="official-modview-host" className={detached ? 'hidden' : cornerLayout ? 'absolute inset-0' : 'flex-1 min-w-0 min-h-0 h-full'} />
      {detached && !showVideo && <div className="flex flex-1 items-center justify-center text-text-muted text-sm">{t('mod.tools.separate')}</div>}
    </div>
  </div>
}
