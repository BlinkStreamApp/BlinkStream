import PhosphorIcon from '../icons/PhosphorIcon'

export const DOCK_TABS = [
  { id: 'audit', title: 'Mod Log', icon: 'ClockCounterClockwise', desc: 'Registro de auditoría de moderación en vivo con limpieza local.' },
  { id: 'users', title: 'Espectadores & Mods', icon: 'ChatsCircle', desc: 'Lista de espectadores activos en el chat, moderadores y VIPs.' },
  { id: 'activity', title: 'Fuente de Actividad', icon: 'Lightning', desc: 'Feed en tiempo real de suscripciones, raids, bits y canjes.' },
  { id: 'automod', title: 'Cola de AutoMod & Bans', icon: 'ShieldCheck', desc: 'Revisión de mensajes retenidos por AutoMod y apelaciones de desbaneo.' },
  { id: 'predictions', title: 'Predicciones & Encuestas', icon: 'Coins', desc: 'Monitor en vivo de apuestas, votos y control de predicciones.' },
  { id: 'rewards', title: 'Recompensas de Puntos', icon: 'Gift', desc: 'Cola de canjes de puntos de canal pendientes de cumplir.' },
]

export const LAYOUT_PRESETS = [
  { id: 'standard', label: 'Estándar (Vídeo | Chat | Herramientas)', desc: 'Distribución óptima de moderación con monitor a la izquierda y chat central.' },
  { id: 'chat_left', label: 'Chat a la Izquierda (Chat | Vídeo | Herramientas)', desc: 'Prioridad de lectura de chat en el lateral izquierdo.' },
  { id: 'no_player', label: 'Modo Solo Chat & Herramientas', desc: 'Oculta el reproductor para ahorrar rendimiento y concentrarse en el chat.' },
]

export function ModViewLayoutDrawer({
  isOpen,
  onClose,
  config,
  onChangeConfig,
  onResetDefaults,
}) {
  if (!isOpen) return null

  const { showPlayer = true, showInspector = true, preset = 'standard', enabledTabs = [] } = config

  const toggleTab = (tabId) => {
    const isEnabled = enabledTabs.includes(tabId)
    if (isEnabled) {
      if (enabledTabs.length <= 1) return // Mínimo una pestaña
      onChangeConfig({
        ...config,
        enabledTabs: enabledTabs.filter(t => t !== tabId),
      })
    } else {
      onChangeConfig({
        ...config,
        enabledTabs: [...enabledTabs, tabId],
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in font-sans">
      <div
        className="w-full max-w-xl max-h-[90vh] bg-[#111119] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.03]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-twitch/20 border border-twitch/30 flex items-center justify-center text-twitch-glow">
              <PhosphorIcon name="SlidersHorizontal" size={18} weight="duotone" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Personalizar Vista de Moderación</h2>
              <p className="text-xs text-text-muted">Ajusta la distribución de columnas y activa las herramientas que necesitas.</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <PhosphorIcon name="X" size={18} weight="bold" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Section 1: Presets de Distribución */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-twitch-glow">
              Distribución de Columnas
            </label>
            <div className="grid grid-cols-1 gap-2">
              {LAYOUT_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => onChangeConfig({ ...config, preset: p.id, showPlayer: p.id !== 'no_player' })}
                  className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                    preset === p.id
                      ? 'bg-twitch/15 border-twitch text-white ring-1 ring-twitch shadow-sm'
                      : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/10 text-white/80'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center ${
                    preset === p.id ? 'border-twitch bg-twitch' : 'border-white/30'
                  }`}>
                    {preset === p.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-xs font-bold">{p.label}</p>
                    <p className="text-[11px] text-text-muted mt-0.5">{p.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Paneles Laterales Visibles */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-twitch-glow">
              Elementos del Lateral Izquierdo
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onChangeConfig({ ...config, showPlayer: !showPlayer })}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                  showPlayer ? 'bg-twitch/10 border-twitch/40 text-white' : 'bg-white/[0.02] border-white/10 text-white/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <PhosphorIcon name="VideoCamera" size={16} />
                  <span className="text-xs font-semibold">Reproductor de Vídeo</span>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${showPlayer ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/40'}`}>
                  {showPlayer ? 'ON' : 'OFF'}
                </span>
              </button>

              <button
                onClick={() => onChangeConfig({ ...config, showInspector: !showInspector })}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                  showInspector ? 'bg-twitch/10 border-twitch/40 text-white' : 'bg-white/[0.02] border-white/10 text-white/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <PhosphorIcon name="MagnifyingGlass" size={16} />
                  <span className="text-xs font-semibold">Inspector de Usuario</span>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${showInspector ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/40'}`}>
                  {showInspector ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>

          {/* Section 3: Pestañas de Herramientas (Panel Derecho) */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-twitch-glow">
              Pestañas de Herramientas Activas (Panel Derecho)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DOCK_TABS.map(tab => {
                const isEnabled = enabledTabs.includes(tab.id)
                return (
                  <div
                    key={tab.id}
                    onClick={() => toggleTab(tab.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-2.5 select-none ${
                      isEnabled
                        ? 'bg-twitch/10 border-twitch/40 text-white shadow-sm'
                        : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/10 text-white/50 opacity-60'
                    }`}
                  >
                    <div className={`p-1.5 rounded-xl shrink-0 ${isEnabled ? 'bg-twitch text-white' : 'bg-white/5 text-white/40'}`}>
                      <PhosphorIcon name={tab.icon} size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold truncate">{tab.title}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${isEnabled ? 'text-green-300 bg-green-500/20' : 'text-white/40 bg-white/10'}`}>
                          {isEnabled ? 'Activo' : 'Oculto'}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-muted mt-0.5 line-clamp-2 leading-tight">{tab.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          <button
            onClick={onResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-all cursor-pointer"
          >
            <PhosphorIcon name="ArrowsClockwise" size={14} />
            <span>Restablecer Todo</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-twitch hover:bg-twitch-glow text-white font-bold text-xs rounded-xl shadow-lg shadow-twitch/30 transition-all cursor-pointer"
          >
            Guardar & Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
