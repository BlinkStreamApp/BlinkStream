

import { useEffect, useRef } from 'react'

const ALL_ITEMS = [
  { id: 'whisper', label: 'Enviar susurro', requires: 'always', icon: '💬' },
  { id: 'profile', label: 'Ver perfil', requires: 'always', icon: '👤' },
  { id: 'copy', label: 'Copiar username', requires: 'always', icon: '📋' },
  { id: 'separator1', requires: 'always', separator: true },
  { id: 'ban', label: 'Banear', requires: 'mod', danger: true, icon: '🚫' },
  { id: 'timeout', label: 'Timeout', requires: 'mod', danger: true, icon: '⏱' },
  { id: 'unban', label: 'Desbanear', requires: 'mod', icon: '✓' },
  { id: 'separator2', requires: 'mod', separator: true },
  { id: 'mod', label: 'Promover a mod', requires: 'broadcaster', icon: '🛡' },
  { id: 'unmod', label: 'Quitar mod', requires: 'broadcaster', icon: '🛡' },
  { id: 'vip', label: 'Añadir VIP', requires: 'broadcaster', icon: '⭐' },
  { id: 'unvip', label: 'Quitar VIP', requires: 'broadcaster', icon: '⭐' },
  { id: 'delete', label: 'Borrar mensaje', requires: 'mod', icon: '🗑' },
]

export function MessageContextMenu({ position, target, isModerator, isBroadcaster, viewerLogin, onAction, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!position) return
    const handleOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.()
    }
    const handleEsc = (e) => { if (e.key === 'Escape') onClose?.() }

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [position, onClose])

  if (!position || !target) return null

  const visibleItems = ALL_ITEMS.filter(item => {
    if (item.requires === 'always') return true
    if (item.requires === 'mod') return isModerator
    if (item.requires === 'broadcaster') return isBroadcaster
    return false
  })

  const isSelf = viewerLogin && target.user_login?.toLowerCase() === viewerLogin.toLowerCase()
  const filteredItems = visibleItems.filter(item => {
    if (isSelf && (item.id === 'ban' || item.id === 'timeout' || item.id === 'mod' || item.id === 'vip')) return false
    return true
  })

  const left = Math.min(position.x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 200)
  const top = Math.min(position.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - (filteredItems.length * 30))

  return (
    <div
      ref={ref}
      className="fixed z-[9997] min-w-[180px] bg-bg-secondary/95 backdrop-blur-md border border-bg-tertiary/60 rounded-xl shadow-2xl py-1 animate-fade-in"
      style={{ left, top }}
      role="menu"
      onClick={e => e.stopPropagation()}
    >
      {filteredItems.length === 0 && (
        <p className="px-3 py-2 text-[11px] text-text-muted/60">Sin acciones disponibles</p>
      )}
      {filteredItems.map(item => {
        if (item.separator) {
          return <div key={item.id} className="my-1 border-t border-bg-tertiary/40" />
        }
        return (
          <button
            key={item.id}
            onClick={() => { onAction?.(item.id, target); onClose?.() }}
            className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 transition-colors cursor-pointer ${
              item.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-text-secondary hover:bg-hover hover:text-text-primary'
            }`}
            role="menuitem"
          >
            {item.icon && <span className="w-4 text-center text-[12px]">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
