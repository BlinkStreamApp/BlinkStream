import { useState, useRef, useEffect } from 'react'
import PhosphorIcon from '../icons/PhosphorIcon'
import { useT } from '../../utils/i18n'

export function ModQuickActionsBar({
  channel,
  _isModerator,
  _isBroadcaster,
  activeModes = {},
  onSetMode,
  onClearChat,
  onExit,
  remainingActions = 20,
  isRateLimited = false,
  onOpenLayoutDrawer,
}) {
  const t = useT()
  const [activeMenu, setActiveMenu] = useState(null) // 'slow' | 'followers' | null
  const [confirmClear, setConfirmClear] = useState(false)
  const [shieldActive, setShieldActive] = useState(false)
  const menuContainerRef = useRef(null)

  // Notify Webview to hide when a dropdown menu is open, and restore when closed
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bs:modal-state-change', {
        detail: { open: Boolean(activeMenu) }
      }))
    }
  }, [activeMenu])

  // Close menus on click outside or escape key
  useEffect(() => {
    if (!activeMenu && !confirmClear) return

    const handlePointerDown = (e) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target)) {
        setActiveMenu(null)
        setConfirmClear(false)
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveMenu(null)
        setConfirmClear(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeMenu, confirmClear])

  const handleSlowSelect = (secs) => {
    setActiveMenu(null)
    if (secs === 0) {
      onSetMode?.('slowoff')
    } else {
      onSetMode?.('slow', String(secs))
    }
  }

  const handleFollowersSelect = (mins) => {
    setActiveMenu(null)
    if (mins === -1) {
      onSetMode?.('followersoff')
    } else {
      onSetMode?.('followers', String(mins))
    }
  }

  const toggleEmoteOnly = () => {
    setActiveMenu(null)
    const active = !!activeModes.emoteonly
    onSetMode?.(active ? 'emoteonlyoff' : 'emoteonly')
  }

  const toggleSubOnly = () => {
    setActiveMenu(null)
    const active = !!activeModes.subscribers
    onSetMode?.(active ? 'subscribersoff' : 'subscribers')
  }

  const handleShieldToggle = () => {
    setActiveMenu(null)
    if (!shieldActive) {
      // Enable extreme protection: Emote-only + Sub-only + Slow 30s
      onSetMode?.('emoteonly')
      onSetMode?.('subscribers')
      onSetMode?.('slow', '30')
      setShieldActive(true)
    } else {
      onSetMode?.('emoteonlyoff')
      onSetMode?.('subscribersoff')
      onSetMode?.('slowoff')
      setShieldActive(false)
    }
  }

  return (
    <div className="shrink-0 bg-[#0e0e14]/95 border-b border-white/10 px-4 py-2.5 flex items-center justify-between gap-3 select-none backdrop-blur-xl z-20">
      {/* Left: Channel and Mode Title */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex items-center gap-1.5 bg-twitch/15 text-twitch-glow border border-twitch/30 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
          <PhosphorIcon name="ShieldCheck" size={16} weight="fill" className="text-twitch animate-pulse" />
          <span>{t('mod.title', 'Mod View')}</span>
        </div>
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-xs font-bold text-white truncate">{channel}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        </div>
      </div>

      {/* Center: Quick Channel Actions */}
      <div ref={menuContainerRef} className="flex items-center gap-2 flex-wrap justify-center">
        {/* Shield Mode */}
        <button
          onClick={handleShieldToggle}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all border ${
            shieldActive
              ? 'bg-red-500/20 border-red-500/60 text-red-300 shadow-lg shadow-red-500/20 animate-pulse'
              : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white'
          }`}
          title={shieldActive ? t('mod.quick.shieldTipOff', 'Desactivar Modo Escudo') : t('mod.quick.shieldTipOn', 'Activar Modo Escudo (Anti-Raid)')}
        >
          <PhosphorIcon name="Shield" size={15} weight={shieldActive ? 'fill' : 'bold'} />
          <span>{shieldActive ? t('mod.quick.shieldActive', 'Escudo Activo') : t('mod.quick.shield', 'Modo Escudo')}</span>
        </button>

        {/* Emote Only Toggle */}
        <button
          onClick={toggleEmoteOnly}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${
            activeModes.emoteonly
              ? 'bg-purple-500/20 border-purple-500/60 text-purple-300 shadow-sm shadow-purple-500/20'
              : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
          }`}
          title={t('mod.quick.emotes', 'Solo Emotes')}
        >
          <PhosphorIcon name="Smiley" size={15} weight={activeModes.emoteonly ? 'fill' : 'regular'} />
          <span>{t('mod.quick.emotes', 'Solo Emotes')}</span>
        </button>

        {/* Subscribers Only Toggle */}
        <button
          onClick={toggleSubOnly}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${
            activeModes.subscribers
              ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm shadow-amber-500/20'
              : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
          }`}
          title={t('mod.quick.subs', 'Solo Subs')}
        >
          <PhosphorIcon name="Sparkle" size={15} weight={activeModes.subscribers ? 'fill' : 'regular'} />
          <span>{t('mod.quick.subs', 'Solo Subs')}</span>
        </button>

        {/* Slow Mode Inline Selector */}
        {activeMenu === 'slow' ? (
          <div className="flex items-center gap-1 bg-cyan-950/60 border border-cyan-500/50 rounded-lg p-0.5 animate-fade-in shadow-lg shadow-cyan-950/40">
            <div className="flex items-center gap-1 text-cyan-300 px-1.5 py-0.5 text-xs font-semibold">
              <PhosphorIcon name="ClockCounterClockwise" size={14} />
              <span>{t('mod.quick.slow', 'Lento')}:</span>
            </div>
            <button onClick={() => handleSlowSelect(0)} className={`px-1.5 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${!activeModes.slow ? 'bg-cyan-500 text-black font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>{t('mod.quick.slowOff', 'Off')}</button>
            <button onClick={() => handleSlowSelect(3)} className={`px-1.5 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${activeModes.slow === '3' ? 'bg-cyan-500 text-black font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>3s</button>
            <button onClick={() => handleSlowSelect(10)} className={`px-1.5 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${activeModes.slow === '10' ? 'bg-cyan-500 text-black font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>10s</button>
            <button onClick={() => handleSlowSelect(30)} className={`px-1.5 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${activeModes.slow === '30' ? 'bg-cyan-500 text-black font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>30s</button>
            <button onClick={() => handleSlowSelect(60)} className={`px-1.5 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${activeModes.slow === '60' ? 'bg-cyan-500 text-black font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>60s</button>
            <button onClick={() => handleSlowSelect(120)} className={`px-1.5 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${activeModes.slow === '120' ? 'bg-cyan-500 text-black font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>120s</button>
            <button onClick={() => setActiveMenu(null)} className="px-1.5 py-0.5 text-white/40 hover:text-white text-xs cursor-pointer ml-0.5" title="Cerrar"><PhosphorIcon name="X" size={12} /></button>
          </div>
        ) : (
          <button
            onClick={() => setActiveMenu('slow')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${
              activeModes.slow
                ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300'
                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            title={t('mod.quick.slow', 'Modo Lento')}
          >
            <PhosphorIcon name="ClockCounterClockwise" size={15} />
            <span>{activeModes.slow ? `${t('mod.quick.slow', 'Lento')} (${activeModes.slow}s)` : t('mod.quick.slow', 'Modo Lento')}</span>
            <PhosphorIcon name="CaretDoubleRight" size={10} className="rotate-90 text-white/40" />
          </button>
        )}

        {/* Followers Mode Inline Selector */}
        {activeMenu === 'followers' ? (
          <div className="flex items-center gap-1 bg-blue-950/60 border border-blue-500/50 rounded-lg p-0.5 animate-fade-in shadow-lg shadow-blue-950/40">
            <div className="flex items-center gap-1 text-blue-300 px-1.5 py-0.5 text-xs font-semibold">
              <PhosphorIcon name="Heart" size={14} />
              <span>{t('mod.quick.followers', 'Seguidores')}:</span>
            </div>
            <button onClick={() => handleFollowersSelect(-1)} className={`px-1.5 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${(activeModes.followers === undefined || activeModes.followers === null || activeModes.followers === false || activeModes.followers === -1) ? 'bg-blue-500 text-black font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>{t('mod.quick.followersOff', 'Todos')}</button>
            <button onClick={() => handleFollowersSelect(0)} className={`px-1.5 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${activeModes.followers === '0' || activeModes.followers === 0 ? 'bg-blue-500 text-black font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>{t('mod.quick.followers0m', 'Seguidores')}</button>
            <button onClick={() => handleFollowersSelect(10)} className={`px-1.5 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${activeModes.followers === '10' || activeModes.followers === 10 ? 'bg-blue-500 text-black font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>10m</button>
            <button onClick={() => handleFollowersSelect(30)} className={`px-1.5 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${activeModes.followers === '30' || activeModes.followers === 30 ? 'bg-blue-500 text-black font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>30m</button>
            <button onClick={() => handleFollowersSelect(1440)} className={`px-1.5 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${activeModes.followers === '1440' || activeModes.followers === 1440 ? 'bg-blue-500 text-black font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>1d</button>
            <button onClick={() => setActiveMenu(null)} className="px-1.5 py-0.5 text-white/40 hover:text-white text-xs cursor-pointer ml-0.5" title="Cerrar"><PhosphorIcon name="X" size={12} /></button>
          </div>
        ) : (
          <button
            onClick={() => setActiveMenu('followers')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${
              (activeModes.followers !== undefined && activeModes.followers !== null && activeModes.followers !== false)
                ? 'bg-blue-500/20 border-blue-500/60 text-blue-300'
                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            title={t('mod.quick.followers', 'Seguidores')}
          >
            <PhosphorIcon name="Heart" size={15} />
            <span>{t('mod.quick.followers', 'Seguidores')}</span>
            <PhosphorIcon name="CaretDoubleRight" size={10} className="rotate-90 text-white/40" />
          </button>
        )}

        {/* Clear Chat */}
        {confirmClear ? (
          <div className="flex items-center gap-1 bg-red-500/20 border border-red-500/40 rounded-lg p-0.5">
            <span className="text-[11px] text-red-300 font-semibold px-1.5">{t('mod.quick.clearConfirm', '¿Vaciar?')}</span>
            <button
              onClick={() => { setConfirmClear(false); onClearChat?.() }}
              className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold rounded cursor-pointer transition-colors"
            >
              {t('mod.quick.confirm', 'Sí')}
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="px-1.5 py-1 text-white/60 hover:text-white text-[10px] cursor-pointer"
            >
              {t('mod.quick.cancel', 'No')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmClear(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-red-400 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 cursor-pointer transition-all"
            title={t('mod.quick.clearTitle', 'Vaciar Chat del Canal')}
          >
            <PhosphorIcon name="Trash" size={15} />
            <span>{t('mod.quick.clear', 'Limpiar')}</span>
          </button>
        )}
      </div>

      {/* Right: Telemetry, Layout Customize & Exit Button */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="hidden xl:flex items-center gap-1.5 text-[11px] text-text-muted font-mono bg-white/5 border border-white/10 px-2 py-1 rounded-lg">
          <span className={isRateLimited ? 'text-red-400 font-bold' : 'text-green-400 font-semibold'}>⚡ {remainingActions}/20</span>
          <span className="text-white/40">{t('mod.quick.actions', 'acciones')}</span>
        </div>

        <button
          onClick={onOpenLayoutDrawer}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-twitch/20 hover:bg-twitch/30 border border-twitch/40 hover:border-twitch/60 cursor-pointer transition-all shadow-sm"
          title="Personalizar paneles y distribución de Mod View"
        >
          <PhosphorIcon name="SlidersHorizontal" size={14} weight="bold" className="text-twitch-glow" />
          <span>{t('mod.quick.panels', 'Paneles')}</span>
        </button>

        <button
          onClick={onExit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/25 cursor-pointer transition-all"
          title="Salir de la Vista de Moderador (Esc / Ctrl+M)"
        >
          <PhosphorIcon name="X" size={14} weight="bold" />
          <span>{t('mod.quick.exit', 'Salir')}</span>
        </button>
      </div>
    </div>
  )
}
