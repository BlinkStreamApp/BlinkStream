import PhosphorIcon from '../icons/PhosphorIcon'

export const ALL_WIDGETS = [
  { id: 'player', title: 'Reproductor en Vivo', icon: 'VideoCamera', desc: 'Stream del canal en directo con controles de calidad y volumen.' },
  { id: 'chat', title: 'Chat de Moderación', icon: 'Chats', desc: 'Chat en vivo con herramientas de moderación, menciones y destacados.' },
  { id: 'inspector', title: 'Inspector & Buscador', icon: 'MagnifyingGlass', desc: 'Buscador rápido de usuarios, historial y botones de sanción.' },
  { id: 'log', title: 'Mod Log de Auditoría', icon: 'ClockCounterClockwise', desc: 'Historial en vivo de acciones de moderación con limpieza local.' },
  { id: 'users', title: 'Espectadores & Mods', icon: 'ChatsCircle', desc: 'Lista de espectadores en tiempo real, moderadores y VIPs del canal.' },
  { id: 'activity', title: 'Fuente de Actividad', icon: 'Lightning', desc: 'Feed cronológico de suscripciones, raids, cheers/bits y canjes.' },
  { id: 'automod', title: 'Cola de AutoMod', icon: 'ShieldCheck', desc: 'Mensajes retenidos por AutoMod para revisión de moderador.' },
  { id: 'unban', title: 'Solicitudes de Unban', icon: 'ChatCircleSlash', desc: 'Apelaciones de usuarios baneados con opción de resolver y añadir nota.' },
  { id: 'predictions', title: 'Predicciones & Encuestas', icon: 'Coins', desc: 'Monitor en vivo de apuestas, votos y control de predicciones.' },
  { id: 'rewards', title: 'Cola de Puntos de Canal', icon: 'Gift', desc: 'Canjes de recompensas personalizadas pendientes de aprobación.' },
]

export function ModViewLayoutDrawer({
  isOpen,
  onClose,
  activeWidgetIds = [],
  onToggleWidget,
  isEditMode,
  onToggleEditMode,
  onResetLayout,
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in font-sans">
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-[#111119] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-twitch/20 border border-twitch/30 flex items-center justify-center text-twitch-glow">
              <PhosphorIcon name="SlidersHorizontal" size={18} weight="duotone" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Personalizar Paneles de Mod View</h2>
              <p className="text-xs text-text-muted">Activa, desactiva o reorganiza tus herramientas según tu flujo de trabajo.</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <PhosphorIcon name="X" size={18} weight="bold" />
          </button>
        </div>

        {/* Toolbar Bar */}
        <div className="p-3 bg-white/[0.02] border-b border-white/5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleEditMode}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isEditMode
                  ? 'bg-twitch text-white shadow-lg shadow-twitch/30 ring-2 ring-twitch/50'
                  : 'bg-white/10 hover:bg-white/15 text-white/80'
              }`}
            >
              <PhosphorIcon name="MagicWand" size={14} weight="bold" />
              <span>{isEditMode ? '✓ Modo Edición Activado' : 'Modo Reorganizar (Drag & Drop)'}</span>
            </button>
            <span className="text-[11px] text-text-muted hidden sm:inline">
              {isEditMode ? 'Arrastra o usa las flechas en cada tarjeta.' : 'Permite mover paneles directamente en la pantalla.'}
            </span>
          </div>

          <button
            onClick={onResetLayout}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 text-xs font-semibold transition-all cursor-pointer shrink-0"
            title="Restablecer a la distribución recomendada"
          >
            <PhosphorIcon name="ArrowsClockwise" size={14} />
            <span>Restablecer Diseño</span>
          </button>
        </div>

        {/* Widget Grid Catalog */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ALL_WIDGETS.map(widget => {
            const isActive = activeWidgetIds.includes(widget.id)
            return (
              <div
                key={widget.id}
                onClick={() => onToggleWidget(widget.id)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                  isActive
                    ? 'bg-twitch/10 border-twitch/40 shadow-sm'
                    : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/10 opacity-70 hover:opacity-100'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    isActive ? 'bg-twitch text-white shadow-md shadow-twitch/30' : 'bg-white/5 text-white/40'
                  }`}
                >
                  <PhosphorIcon name={widget.icon} size={18} weight="duotone" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white truncate">{widget.title}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        isActive ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-white/10 text-white/40'
                      }`}
                    >
                      {isActive ? 'Activo' : 'Oculto'}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-1 leading-snug line-clamp-2">{widget.desc}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-xs text-text-muted">
          <span>Los cambios se guardan automáticamente en tu dispositivo.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
