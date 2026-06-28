/**
 * @file Tab "Moderación" del modal de Settings (M-1 / WT-20260628-13).
 * Configuraciones del panel de mod: mostrar/ocultar al inicio, alertas
 * toast, rate limit local, etc. No incluye el panel en si (eso vive
 * en ModPanel.jsx, anclado a la topbar).
 */

import { useState, useEffect } from 'react'
import ToggleSwitch from '../ToggleSwitch'

const LS_AUTOSHOW = 'bs.modPanel.autoShow'
const LS_RATE_MAX = 'bs.modPanel.rateMax'
const LS_RATE_WINDOW = 'bs.modPanel.rateWindowSec'

/**
 * Tab de configuracion de moderacion. Las prefs se persisten en
 * localStorage con prefijo `bs.modPanel.*` para que ModPanel las
 * consuma al montar.
 */
export function SettingsModerationTab() {
  const [autoShow, setAutoShow] = useState(() => {
    try { return localStorage.getItem(LS_AUTOSHOW) === '1' } catch { return false }
  })
  const [rateMax, setRateMax] = useState(() => {
    try {
      const v = Number(localStorage.getItem(LS_RATE_MAX))
      return v > 0 ? v : 20
    } catch { return 20 }
  })
  const [rateWindow, setRateWindow] = useState(() => {
    try {
      const v = Number(localStorage.getItem(LS_RATE_WINDOW))
      return v > 0 ? v : 30
    } catch { return 30 }
  })

  useEffect(() => {
    try { localStorage.setItem(LS_AUTOSHOW, autoShow ? '1' : '0') } catch { /* ignore */ }
  }, [autoShow])

  useEffect(() => {
    try { localStorage.setItem(LS_RATE_MAX, String(rateMax)) } catch { /* ignore */ }
  }, [rateMax])

  useEffect(() => {
    try { localStorage.setItem(LS_RATE_WINDOW, String(rateWindow)) } catch { /* ignore */ }
  }, [rateWindow])

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-medium text-text-secondary mb-1.5 block">Panel de moderación</label>
        <p className="text-[11px] text-text-muted/70 leading-relaxed mb-3">
          Visible solo si eres moderador o broadcaster del canal actual. Se abre desde el icono Shield en la barra superior.
        </p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-text-primary">Mostrar automáticamente al ver mi canal</span>
          <ToggleSwitch active={autoShow} onClick={() => setAutoShow(p => !p)} />
        </div>
      </div>

      <div className="border-t border-bg-tertiary/50 pt-4">
        <label className="text-xs font-medium text-text-secondary mb-2 block">Rate limit local (anti-spam de clicks)</label>
        <p className="text-[11px] text-text-muted/70 leading-relaxed mb-3">
          Limita cuántas acciones de moderación puedes ejecutar en una ventana de tiempo. Útil para evitar bans accidentales por clicks repetidos.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-text-muted mb-1 block">Máx. acciones: {rateMax}</label>
            <input
              type="range"
              min="5"
              max="50"
              step="1"
              value={rateMax}
              onChange={e => setRateMax(Number(e.target.value))}
              className="w-full accent-twitch"
            />
          </div>
          <div>
            <label className="text-[11px] text-text-muted mb-1 block">Ventana: {rateWindow}s</label>
            <input
              type="range"
              min="10"
              max="120"
              step="5"
              value={rateWindow}
              onChange={e => setRateWindow(Number(e.target.value))}
              className="w-full accent-twitch"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-bg-tertiary/50 pt-4">
        <p className="text-[11px] text-text-muted/50 leading-relaxed">
          El audit log de acciones se guarda localmente por canal (clave <code>bs.modAudit.&lt;channelId&gt;</code>) y nunca abandona tu dispositivo.
        </p>
      </div>
    </div>
  )
}
