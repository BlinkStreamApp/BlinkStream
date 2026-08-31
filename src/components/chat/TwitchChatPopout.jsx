import { useState, useRef, useCallback } from 'react'
import { isTauri } from '../../utils/tauriEnv'
import { openTwitchChatPopoutWindow } from '../../utils/twitchPopout'
import PhosphorIcon from '../icons/PhosphorIcon'

export function TwitchChatPopout({
  channelName = '',
  className = '',
  onClose,
  showControls = true,
}) {
  const [iframeKey, setIframeKey] = useState(0)
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [isOpeningWindow, setIsOpeningWindow] = useState(false)
  const iframeRef = useRef(null)

  const cleanChannel = (channelName || '').trim().toLowerCase()

  // Build official Twitch embed URL with parent parameters for iframes
  const parentDomains = ['localhost', 'tauri.localhost', '127.0.0.1']
  if (typeof window !== 'undefined' && window.location.hostname && !parentDomains.includes(window.location.hostname)) {
    parentDomains.push(window.location.hostname)
  }
  const parentParams = parentDomains.map(p => `parent=${encodeURIComponent(p)}`).join('&')
  const embedUrl = cleanChannel
    ? `https://www.twitch.tv/embed/${encodeURIComponent(cleanChannel)}/chat?${parentParams}&darkpopout=true`
    : ''

  const handleOpenFloating = useCallback(async () => {
    if (!cleanChannel) return
    setIsOpeningWindow(true)
    try {
      await openTwitchChatPopoutWindow(cleanChannel, alwaysOnTop)
    } finally {
      setIsOpeningWindow(false)
    }
  }, [cleanChannel, alwaysOnTop])

  const handleReload = () => {
    setIframeKey(k => k + 1)
  }

  if (!cleanChannel) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center text-text-muted text-xs p-4 ${className}`}>
        <PhosphorIcon name="Chats" size={24} className="mb-2 opacity-50" />
        <span>Sin canal asignado para Twitch Popout</span>
      </div>
    )
  }

  return (
    <div className={`w-full h-full flex flex-col min-h-[300px] bg-bg-primary overflow-hidden ${className}`}>
      {/* Top Header / Action Bar */}
      {showControls && (
        <div className="shrink-0 px-2.5 py-2 bg-bg-secondary/90 border-b border-white/10 flex items-center justify-between gap-2 backdrop-blur-md select-none text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="text-twitch shrink-0">
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.428l-3 3v-3H6.857V1.714h13.714z" />
            </svg>
            <span className="font-bold text-white tracking-wide truncate">
              Twitch Popout
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isTauri() && (
              <button
                type="button"
                onClick={() => setAlwaysOnTop(p => !p)}
                className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  alwaysOnTop
                    ? 'bg-twitch text-white shadow-sm'
                    : 'text-text-muted hover:text-white bg-white/5 hover:bg-white/10'
                }`}
                title={alwaysOnTop ? 'Siempre encima activado' : 'Fijar siempre encima al abrir ventana'}
                aria-label="Toggle siempre encima"
              >
                <PhosphorIcon name="PushPin" size={13} weight={alwaysOnTop ? 'fill' : 'regular'} />
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenFloating}
              disabled={isOpeningWindow}
              className="px-2 py-1 rounded-lg text-xs font-bold text-twitch-glow hover:text-white bg-twitch/15 hover:bg-twitch/30 border border-twitch/30 transition-all cursor-pointer flex items-center gap-1"
              title="Abrir en ventana flotante nativa independiente (recomendado para puntos y emotes)"
              aria-label="Abrir ventana flotante"
            >
              <PhosphorIcon name="ArrowSquareOut" size={13} weight="bold" />
              <span>Ventana</span>
            </button>

            <button
              type="button"
              onClick={handleReload}
              className="p-1.5 rounded-lg text-text-muted hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              title="Recargar chat popout"
              aria-label="Recargar chat"
            >
              <PhosphorIcon name="ArrowsClockwise" size={13} />
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors cursor-pointer"
                title="Volver al chat ligero BlinkStream"
                aria-label="Volver a chat ligero"
              >
                Chat Ligero
              </button>
            )}
          </div>
        </div>
      )}

      {/* Popout WebView Iframe with Fallback Prompt */}
      <div className="flex-1 w-full h-full min-h-0 relative bg-[#0e0e10]">
        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={embedUrl}
          className="w-full h-full border-0 absolute inset-0"
          title={`Twitch Chat - ${cleanChannel}`}
          allow="autoplay; fullscreen"
          sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        />
      </div>
    </div>
  )
}

export default TwitchChatPopout
