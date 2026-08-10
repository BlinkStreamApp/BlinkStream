

import ToggleSwitch from '../ToggleSwitch'

const CHAT_MODES = [
  { id: 'slow', label: 'Slow mode', desc: 'Limita la frecuencia de mensajes' },
  { id: 'followers', label: 'Followers-only', desc: 'Solo seguidores pueden escribir' },
  { id: 'subscribers', label: 'Subscribers-only', desc: 'Solo suscriptores pueden escribir' },
  { id: 'emoteonly', label: 'Emote-only', desc: 'Solo emotes permitidos' },
  { id: 'uniquechat', label: 'Unique chat', desc: 'Bloquea mensajes repetidos' },
]

export function ChatSettings({ isModerator, onSetMode, activeModes = {} }) {
  if (!isModerator) {
    return (
      <p className="p-3 text-[11px] text-text-muted/60 text-center">
        No tienes permisos para cambiar los ajustes del chat.
      </p>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-3 py-2 border-b border-bg-tertiary/40">
        <p className="text-[11px] font-semibold text-text-primary">Ajustes del chat</p>
        <p className="text-[9px] text-text-muted/60 mt-0.5">Los cambios se aplican al canal en vivo.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {CHAT_MODES.map(mode => {
          const active = !!activeModes[mode.id]
          return (
            <div key={mode.id} className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-hover/30">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-text-primary font-medium">{mode.label}</p>
                <p className="text-[10px] text-text-muted/60 leading-tight">{mode.desc}</p>
              </div>
              <ToggleSwitch
                active={active}
                onClick={() => onSetMode?.(active ? `${mode.id}off` : mode.id)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
