import PhosphorIcon from '../icons/PhosphorIcon'

export function ModWidgetWrapper({
  widgetId,
  title,
  icon,
  badge,
  isEditMode,
  canMoveLeft,
  canMoveRight,
  canMoveUp,
  canMoveDown,
  onMoveLeft,
  onMoveRight,
  onMoveUp,
  onMoveDown,
  onClose,
  children,
  className = '',
  headerRight,
  draggable = true,
  onDragStart,
  onDragOver,
  onDrop,
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex flex-col min-h-0 bg-[#111119]/80 border border-white/10 rounded-2xl overflow-hidden shadow-xl backdrop-blur-xl transition-all ${
        isEditMode ? 'ring-2 ring-twitch/50 ring-offset-2 ring-offset-black/50' : ''
      } ${className}`}
      data-widget-id={widgetId}
    >
      {/* Widget Header */}
      <div className="shrink-0 p-2.5 bg-white/5 border-b border-white/10 flex items-center justify-between gap-2 select-none">
        <div className="flex items-center gap-2 min-w-0">
          {isEditMode && (
            <div className="cursor-grab active:cursor-grabbing text-white/40 hover:text-white transition-colors" title="Arrastrar para mover">
              <span className="font-mono text-sm leading-none">⠿</span>
            </div>
          )}
          {icon && (
            <PhosphorIcon name={icon} size={16} className="text-twitch-glow shrink-0" weight="duotone" />
          )}
          <span className="text-xs font-bold text-white uppercase tracking-wider truncate">
            {title}
          </span>
          {badge}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {headerRight}

          {isEditMode && (
            <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-white/10">
              {canMoveLeft && (
                <button
                  onClick={onMoveLeft}
                  className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white text-[11px] cursor-pointer"
                  title="Mover a columna izquierda"
                >
                  ◀
                </button>
              )}
              {canMoveUp && (
                <button
                  onClick={onMoveUp}
                  className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white text-[11px] cursor-pointer"
                  title="Subir"
                >
                  ▲
                </button>
              )}
              {canMoveDown && (
                <button
                  onClick={onMoveDown}
                  className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white text-[11px] cursor-pointer"
                  title="Bajar"
                >
                  ▼
                </button>
              )}
              {canMoveRight && (
                <button
                  onClick={onMoveRight}
                  className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white text-[11px] cursor-pointer"
                  title="Mover a columna derecha"
                >
                  ▶
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-red-500/20 text-white/40 hover:text-red-300 transition-colors cursor-pointer ml-1"
                title="Ocultar panel"
              >
                <PhosphorIcon name="X" size={13} weight="bold" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Widget Content Body */}
      <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
        {children}
      </div>
    </div>
  )
}
