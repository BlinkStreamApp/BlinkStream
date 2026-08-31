import { useState, useRef, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../../utils/tauriEnv'
import { openTwitchChatPopoutWindow } from '../../utils/twitchPopout'
import PhosphorIcon from '../icons/PhosphorIcon'

export function TwitchChatPopout({
  channelName = '',
  className = '',
  twitchToken = '',
  twitchUsername = '',
  onClose,
  showControls = true,
}) {
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const [isOpeningWindow, setIsOpeningWindow] = useState(false)
  const containerRef = useRef(null)

  const [isOverlayModalOpen, setIsOverlayModalOpen] = useState(false)
  const isOverlayModalOpenRef = useRef(false)
  useEffect(() => { isOverlayModalOpenRef.current = isOverlayModalOpen }, [isOverlayModalOpen])

  const cleanChannel = (channelName || '').trim().toLowerCase()

  // Native Child Webview Lifecycle in Tauri
  useEffect(() => {
    if (!isTauri() || !cleanChannel) return

    let isMounted = true

    const syncBounds = async (forceMount = false) => {
      if (!containerRef.current || !isMounted) return
      const rect = containerRef.current.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      try {
        if (forceMount) {
          await invoke('mount_embedded_twitch_chat', {
            channel: cleanChannel,
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            authToken: twitchToken || null,
            username: twitchUsername || null,
          })
          if (isOverlayModalOpenRef.current) {
            await invoke('set_embedded_twitch_chat_visible', { visible: false }).catch(() => {})
          }
        } else {
          await invoke('set_embedded_twitch_chat_visible', {
            visible: true,
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          })
        }
      } catch (err) {
        console.warn('[TwitchChatPopout] Child webview error:', err)
      }
    }

    const timer = setTimeout(() => syncBounds(true), 60)

    let observer = null
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      observer = new ResizeObserver(() => syncBounds(false))
      observer.observe(containerRef.current)
    }

    const handleResize = () => syncBounds(false)
    window.addEventListener('resize', handleResize)

    const handleModalEvent = (e) => {
      const open = Boolean(e?.detail?.isModalOpen ?? e?.detail?.open)
      setIsOverlayModalOpen(open)
      if (open) {
        invoke('set_embedded_twitch_chat_visible', { visible: false }).catch(() => {})
      } else {
        syncBounds(false)
      }
    }
    window.addEventListener('bs:modal-state-change', handleModalEvent)

    const checkDomModal = () => {
      const modalElement = document.querySelector('[role="dialog"], .fixed.inset-0.z-50, .fixed.inset-0.z-40')
      const hasModal = Boolean(modalElement)
      setIsOverlayModalOpen(prev => {
        if (prev !== hasModal) {
          if (hasModal) {
            invoke('set_embedded_twitch_chat_visible', { visible: false }).catch(() => {})
          } else {
            setTimeout(() => {
              if (isMounted) syncBounds(false)
            }, 30)
          }
        }
        return hasModal
      })
    }

    const domObserver = new MutationObserver(checkDomModal)
    domObserver.observe(document.body, { childList: true, subtree: true, attributes: true })

    return () => {
      isMounted = false
      clearTimeout(timer)
      if (observer) observer.disconnect()
      domObserver.disconnect()
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('bs:modal-state-change', handleModalEvent)
      if (isTauri()) {
        invoke('unmount_embedded_twitch_chat').catch(() => {})
      }
    }
  }, [cleanChannel, twitchToken, twitchUsername])

  const handleOpenFloating = useCallback(async () => {
    if (!cleanChannel) return
    setIsOpeningWindow(true)
    try {
      if (onClose) onClose()
      await openTwitchChatPopoutWindow(cleanChannel, alwaysOnTop, twitchToken, twitchUsername)
    } finally {
      setIsOpeningWindow(false)
    }
  }, [cleanChannel, alwaysOnTop, onClose, twitchToken, twitchUsername])

  if (!cleanChannel) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center text-text-muted text-xs p-4 ${className}`}>
        <PhosphorIcon name="Chats" size={24} className="mb-2 opacity-50" />
        <span>Sin canal asignado para Twitch Popout</span>
      </div>
    )
  }

  return (
    <div className={`w-full h-full flex flex-col min-h-[340px] bg-bg-primary overflow-hidden select-none ${className}`}>
      {/* Top Header / Action Bar */}
      {showControls && (
        <div className="shrink-0 px-2.5 py-1.5 bg-bg-secondary/95 border-b border-white/10 flex items-center justify-between gap-1.5 backdrop-blur-md text-xs z-10">
          <div className="flex items-center gap-1.5 min-w-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-twitch shrink-0">
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.428l-3 3v-3H6.857V1.714h13.714z" />
            </svg>
            <span className="font-bold text-white tracking-wide truncate">
              Twitch Popout
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isTauri() && (
              <button
                type="button"
                onClick={() => setAlwaysOnTop(p => !p)}
                className={`p-1 rounded-md text-xs transition-all cursor-pointer border ${
                  alwaysOnTop
                    ? 'bg-twitch/20 text-twitch-glow border-twitch/40'
                    : 'text-text-muted hover:text-white bg-white/5 hover:bg-white/10 border-white/5'
                }`}
                title={alwaysOnTop ? 'Siempre encima activado para ventana flotante' : 'Fijar siempre encima al abrir ventana'}
                aria-label="Toggle siempre encima"
              >
                <PhosphorIcon name="PushPin" size={13} weight={alwaysOnTop ? 'fill' : 'regular'} />
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenFloating}
              disabled={isOpeningWindow}
              className="p-1 rounded-md text-text-muted hover:text-cyan-300 hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1"
              title="Abrir en ventana flotante independiente"
              aria-label="Abrir ventana flotante"
            >
              <PhosphorIcon name="ArrowSquareOut" size={13} weight="bold" />
              <span className="text-[10px] font-bold hidden sm:inline">Ventana</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition-colors cursor-pointer"
                title="Volver al chat ligero BlinkStream"
                aria-label="Volver a chat ligero"
              >
                Chat Ligero
              </button>
            )}
          </div>
        </div>
      )}

      {/* Embedded Native Container Area */}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full min-h-0 relative bg-[#0e0e10]"
      >
        {!isTauri() && (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
            <p className="text-xs text-text-muted mb-3">Modo incrustado disponible en la aplicación de escritorio.</p>
            <button
              type="button"
              onClick={handleOpenFloating}
              className="py-2 px-4 rounded-xl bg-twitch hover:bg-twitch-dark text-white font-bold text-xs transition-all"
            >
              Abrir Popout
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default TwitchChatPopout
