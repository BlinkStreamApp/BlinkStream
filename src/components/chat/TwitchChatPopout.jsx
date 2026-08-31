import { useState, useCallback } from 'react'
import { isTauri } from '../../utils/tauriEnv'
import { openTwitchChatPopoutWindow } from '../../utils/twitchPopout'
import PhosphorIcon from '../icons/PhosphorIcon'

export function TwitchChatPopout({
  channelName = '',
  className = '',
  onClose,
  showControls = true,
}) {
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const [isOpeningWindow, setIsOpeningWindow] = useState(false)

  const cleanChannel = (channelName || '').trim().toLowerCase()

  const handleOpenFloating = useCallback(async () => {
    if (!cleanChannel) return
    setIsOpeningWindow(true)
    try {
      await openTwitchChatPopoutWindow(cleanChannel, alwaysOnTop)
    } finally {
      setIsOpeningWindow(false)
    }
  }, [cleanChannel, alwaysOnTop])

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
        <div className="shrink-0 px-3 py-2 bg-bg-secondary/90 border-b border-white/10 flex items-center justify-between gap-2 backdrop-blur-md text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="text-twitch shrink-0">
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.428l-3 3v-3H6.857V1.714h13.714z" />
            </svg>
            <span className="font-bold text-white tracking-wide truncate">
              Twitch Popout
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors cursor-pointer"
                title="Volver al chat ligero BlinkStream"
                aria-label="Volver a chat ligero"
              >
                Volver a Chat Ligero
              </button>
            )}
          </div>
        </div>
      )}

      {/* Popout Launcher Hub */}
      <div className="flex-1 w-full h-full flex flex-col items-center justify-center p-5 text-center bg-gradient-to-b from-[#181824] to-[#0d0e14] overflow-y-auto">
        <div className="relative mb-3 flex items-center justify-center">
          <div className="absolute w-20 h-20 bg-twitch/20 rounded-full blur-xl animate-pulse" />
          <div className="w-14 h-14 rounded-2xl bg-twitch/15 border border-twitch/40 flex items-center justify-center text-twitch shadow-lg shadow-twitch/20 relative z-10">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.428l-3 3v-3H6.857V1.714h13.714z" />
            </svg>
          </div>
        </div>

        <h3 className="text-base font-extrabold text-white mb-1 tracking-wide">
          Chat Oficial de Twitch
        </h3>
        <p className="text-xs text-twitch-glow font-bold mb-4">
          Canal: #{cleanChannel}
        </p>

        <p className="text-xs text-text-muted max-w-[280px] mb-5 leading-relaxed">
          Abre el chat nativo de Twitch en ventana flotante independiente para interactuar con tus puntos de canal, recompensas y predicciones.
        </p>

        {/* Action Button */}
        <div className="w-full max-w-[280px] flex flex-col gap-2.5 mb-5">
          <button
            type="button"
            onClick={handleOpenFloating}
            disabled={isOpeningWindow}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-twitch via-purple-600 to-indigo-600 hover:from-twitch-dark hover:via-purple-700 hover:to-indigo-700 text-white font-bold text-xs shadow-lg shadow-twitch/30 hover:shadow-twitch/50 hover:scale-[1.02] active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            aria-label="Abrir ventana flotante"
          >
            <PhosphorIcon name="ArrowSquareOut" size={16} weight="bold" />
            <span>{isOpeningWindow ? 'Abriendo ventana…' : 'Abrir Ventana Popout'}</span>
          </button>

          {isTauri() && (
            <button
              type="button"
              onClick={() => setAlwaysOnTop(p => !p)}
              className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                alwaysOnTop
                  ? 'bg-twitch/15 text-twitch-glow border-twitch/40 shadow-sm'
                  : 'bg-white/5 text-text-muted border-white/10 hover:border-white/20'
              }`}
            >
              <PhosphorIcon name="PushPin" size={13} weight={alwaysOnTop ? 'fill' : 'regular'} />
              <span>{alwaysOnTop ? 'Always on Top: Activado' : 'Always on Top: Desactivado'}</span>
            </button>
          )}
        </div>

        {/* Features Checklist */}
        <div className="w-full max-w-[280px] bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 text-left flex flex-col gap-2 text-[11px] text-text-muted">
          <div className="flex items-center gap-2 text-text-primary font-medium">
            <span className="text-amber-400">🪙</span>
            <span>Puntos de canal y cofres de bonificación</span>
          </div>
          <div className="flex items-center gap-2 text-text-primary font-medium">
            <span className="text-purple-400">🎯</span>
            <span>Predicciones y encuestas en directo</span>
          </div>
          <div className="flex items-center gap-2 text-text-primary font-medium">
            <span className="text-cyan-400">💎</span>
            <span>Emotes oficiales y suscripciones</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TwitchChatPopout
