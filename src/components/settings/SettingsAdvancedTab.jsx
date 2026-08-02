/**
 * @file Tab "Avanzado" del modal de Settings (M-1 / WT-20260628-13).
 * Opciones tecnicas: Client-ID personalizado, reset de caches, debug.
 */

import { useState } from 'react'

function loadCustomClientId() {
  try { return localStorage.getItem('blinkstream_custom_client_id') || '' } catch { return '' }
}

export function SettingsAdvancedTab() {
  const [customClientId, setCustomClientId] = useState(loadCustomClientId)

  const handleClearCaches = () => {
    if (typeof window === 'undefined') return
    if (!window.confirm('¿Limpiar todos los caches locales (favoritos, recientes, ajustes)? La app se recargará.')) return
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('blinkstream_') || k.startsWith('bs.')) localStorage.removeItem(k)
      })
    } catch { /* ignore */ }
    window.location.reload()
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-medium text-text-secondary mb-1.5 block">Client-ID personalizado de Twitch</label>
        <p className="text-[11px] text-text-muted/70 leading-relaxed mb-2">
          Si registraste tu propia app en <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noopener noreferrer" className="text-twitch hover:underline">dev.twitch.tv</a>, pega aquí tu Client-ID. Déjalo vacío para usar el por defecto.
        </p>
        <input
          type="text"
          value={customClientId}
          onChange={e => {
            setCustomClientId(e.target.value)
            try { localStorage.setItem('blinkstream_custom_client_id', e.target.value) } catch { /* ignore */ }
          }}
          placeholder="abc123def456..."
          className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary placeholder-text-muted/40 text-[12px] border border-bg-tertiary focus:border-twitch focus:outline-none transition-colors"
        />
      </div>

      <div className="border-t border-bg-tertiary/50 pt-4">
        <label className="text-xs font-medium text-text-secondary mb-2 block">Mantenimiento</label>
        <button
          onClick={handleClearCaches}
          className="w-full text-sm py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors cursor-pointer"
        >
          Limpiar caches locales y reiniciar
        </button>
      </div>

      <div className="border-t border-bg-tertiary/50 pt-4">
        <p className="text-[11px] text-text-muted/50 leading-relaxed">
          Versión: 1.1.0 — Suite completa con Moderación avanzada y Grabada HD.
        </p>
      </div>
    </div>
  )
}
