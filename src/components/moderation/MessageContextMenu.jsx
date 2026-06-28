/**
 * @file Menu contextual (click derecho) sobre un mensaje del chat
 * (M-1 / WT-20260628-13). Items segun rol: whisper, view profile,
 * copy username, ban, timeout, mod, vip, etc. Solo acciones de mod
 * para mods.
 *
 * @typedef {object} MessageContextMenuProps
 * @property {{x: number, y: number} | null} position
 * @property {{user_id?: string, user_login: string, user_name: string, message_id?: string}} target
 * @property {boolean} isModerator
 * @property {boolean} isBroadcaster
 * @property {string|null} viewerLogin
 * @property {(action: string, target: object) => void} onAction
 * @property {() => void} onClose
 */

import { useEffect, useRef } from 'react'

/**
 * Definicion de items. Cada item tiene:
 *   - id: accion a ejecutar
 *   - label: texto
 *   - danger: si true, color rojo
 *   - requires: 'mod' | 'broadcaster' | 'always' (gating)
 */
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

/**
 * @param {MessageContextMenuProps} props
 */
export function MessageContextMenu({ position, target, isModerator, isBroadcaster, viewerLogin, onAction, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!position) return
    const handleOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.()
    }
    const handleEsc = (e) => { if (e.key === 'Escape') onClose?.() }
    // Mousedown (no click) para que se cierre antes de que el click llegue al item
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

  // Evitar acciones sobre uno mismo
  const isSelf = viewerLogin && target.user_login?.toLowerCase() === viewerLogin.toLowerCase()
  const filteredItems = visibleItems.filter(item => {
    if (isSelf && (item.id === 'ban' || item.id === 'timeout' || item.id === 'mod' || item.id === 'vip')) return false
    return true
  })

  // Clamp position al viewport
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
