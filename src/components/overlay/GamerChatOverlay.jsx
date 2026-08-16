import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '../../utils/tauriEnv'
import PhosphorIcon from '../icons/PhosphorIcon'
import Chat from '../Chat'

export default function GamerChatOverlay({ initialChannel = '' }) {
  const [channel, setChannel] = useState(() => {
    const urlCh = new URLSearchParams(window.location.search).get('channel')
    return urlCh || initialChannel || ''
  })
  const [opacity, setOpacity] = useState(75) // 0 - 100
  const [isClickThrough, setIsClickThrough] = useState(false)
  const [showConfig, setShowConfig] = useState(true)

  // Listen for channel changes from main window
  useEffect(() => {
    if (!isTauri()) return
    let unlisten = null
    listen('overlay_channel_change', (event) => {
      if (typeof event.payload === 'string' && event.payload) {
        setChannel(event.payload)
      }
    }).then(u => { unlisten = u })

    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  const toggleClickThrough = useCallback(async () => {
    const next = !isClickThrough
    setIsClickThrough(next)
    if (next) setShowConfig(false)

    if (isTauri()) {
      try {
        await invoke('set_click_through', {
          label: 'gamer_overlay',
          ignore: next,
        })
      } catch (err) {
        console.warn('[GamerChatOverlay] set_click_through failed:', err)
      }
    }
  }, [isClickThrough])

  // Global hotkey F9 to toggle Click-Through
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F9') {
        e.preventDefault()
        toggleClickThrough()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleClickThrough])

  const handleClose = () => {
    if (isTauri()) {
      try {
        getCurrentWindow().close()
      } catch {
        // Ignorar
      }
    }
  }

  const bgAlpha = opacity / 100

  return (
    <div
      className="w-screen h-screen flex flex-col overflow-hidden select-none transition-colors duration-200"
      style={{
        backgroundColor: `rgba(13, 14, 20, ${bgAlpha})`,
      }}
    >
      {/* Top Drag & Config Bar */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-3 py-2 bg-black/60 border-b border-white/10 backdrop-blur-md shrink-0 cursor-move"
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-black text-white tracking-wider truncate">
            HUD: {channel || 'Chat'}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-text-muted font-mono">
            F9 Lock
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowConfig(p => !p)}
            className={`p-1 rounded-lg text-xs transition-colors cursor-pointer ${
              showConfig ? 'bg-twitch text-white' : 'text-text-muted hover:text-white bg-white/5'
            }`}
            title="Ajustes de transparencia"
            aria-label="Ajustes de transparencia"
          >
            <PhosphorIcon name="SlidersHorizontal" size={14} weight="bold" />
          </button>

          <button
            type="button"
            onClick={toggleClickThrough}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
              isClickThrough
                ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.6)]'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            title="Activar modo Click-Through (ignorar clics para jugar)"
          >
            <PhosphorIcon name="Lightning" size={12} weight="fill" />
            <span>{isClickThrough ? 'Click-Through ON' : 'Lock (F9)'}</span>
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/15 transition-colors cursor-pointer"
            aria-label="Cerrar overlay"
          >
            <PhosphorIcon name="X" size={14} weight="bold" />
          </button>
        </div>
      </div>

      {/* Quick Opacity settings drawer */}
      {showConfig && (
        <div className="px-3 py-2 bg-black/80 border-b border-white/10 flex items-center justify-between text-xs text-text-muted gap-3 animate-fade-in shrink-0">
          <span className="text-[11px]">Opacidad Fondo:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="flex-1 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            aria-label="Opacidad de fondo"
          />
          <span className="font-mono text-white text-[11px] w-8 text-right">{opacity}%</span>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {channel ? (
          <Chat channel={channel} isOverlay={true} />
        ) : (
          <div className="flex-1 h-full flex items-center justify-center text-text-muted text-xs">
            Sin canal asignado
          </div>
        )}
      </div>
    </div>
  )
}
