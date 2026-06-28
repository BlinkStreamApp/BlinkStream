/**
 * @file Hook que vigila una lista de favoritos y emite un toast + notificacion
 * nativa cuando uno se pone en vivo (M-2 / Auditoria WT-20260628-01).
 *
 * El componente Toast se movio a useLiveAlerts.Toast.jsx para evitar el
 * warning de fast-refresh (un archivo no debe mezclar componentes con
 * hooks/constantes).
 *
 * @typedef {object} LiveAlert
 * @property {number} id        - timestamp + random, para key de React
 * @property {string} channel   - login del canal
 * @property {string} message   - categoria/juego o fallback
 * @property {string} logo      - URL del logo del canal
 *
 * @typedef {object} UseLiveAlertsReturn
 * @property {LiveAlert[]} alerts
 * @property {(channel: string) => void} dismissAlert
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { PUBLIC_CLIENT_ID } from '../utils/twitch'
import { logError } from '../utils/errors'
import { isTauri } from '../utils/tauriEnv'

/**
 * Polling de estado en vivo de los canales favoritos. Solo notifica
 * cuando un canal PASA de offline a live (no spam al iniciar la app).
 *
 * @param {string[]} favorites  - logins de Twitch
 * @param {number}   [intervalMs=30000]  - periodo entre checks
 * @returns {UseLiveAlertsReturn}
 */
export function useLiveAlerts(favorites, intervalMs = 30000) {
  const [alerts, setAlerts] = useState([])
  const prevLiveRef = useRef({})
  const timerRef = useRef(null)

  const dismissAlert = useCallback((channel) => {
    setAlerts(prev => prev.filter(a => a.channel !== channel))
  }, [])

  useEffect(() => {
    if (!favorites.length) return

    const checkLive = async () => {
      try {
        const res = await fetch('https://gql.twitch.tv/gql', {
          method: 'POST',
          headers: { 'Client-ID': PUBLIC_CLIENT_ID, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `{ ${favorites.map((f, i) =>
              `a${i}: user(login: "${f.toLowerCase()}") { stream { id title game { displayName } } profileImageURL(width: 300) }`
            ).join('\n')} }`,
          }),
        })
        if (!res.ok) return
        const json = await res.json()
        if (json?.errors) return

        const current = {}
        favorites.forEach((f, i) => {
          const user = json?.data?.[`a${i}`]
          current[f] = !!user?.stream
        })

        const newlyLive = []

        setAlerts(prev => {
          const newAlerts = [...prev]
          favorites.forEach(f => {
            const wasLive = prevLiveRef.current[f]
            const isLive = current[f]
            if (!wasLive && isLive) {
              const userData = json?.data?.[`a${favorites.indexOf(f)}`]
              const game = userData?.stream?.game?.displayName || ''
              const logo = userData?.profileImageURL || ''
              if (!newAlerts.find(a => a.channel === f)) {
                newAlerts.push({
                  id: Date.now() + Math.random(),
                  channel: f,
                  message: game || 'Empezó a transmitir',
                  logo,
                })
              }
              newlyLive.push({ channel: f, game, logo })
            }
          })
          return newAlerts
        })

        // Notificación nativa SOLO si la ventana no está enfocada
        if (newlyLive.length > 0) {
          try {
            // FIX WT-20260628-34: getCurrentWindow() falla fuera de Tauri
            // porque accede a `window.__TAURI_INTERNALS__.metadata`. Saltamos
            // el bloque nativo completo si no hay runtime Tauri.
            if (!isTauri()) return
            const win = getCurrentWindow()
            const focused = await win.isFocused()
            if (!focused) {
              let granted = await isPermissionGranted()
              if (!granted) {
                const permission = await requestPermission()
                granted = permission === 'granted'
              }
              if (granted) {
                for (const { channel, game, logo } of newlyLive) {
                  sendNotification({
                    title: `${channel} está en vivo!`,
                    body: game || 'Empezó a transmitir',
                    icon: logo,
                  })
                }
              }
            }
          } catch (e) {
            logError(e, { component: 'useLiveAlerts', action: 'nativeNotification' })
          }
        }

        prevLiveRef.current = current
      } catch { /* ignore */ }
    }

    // Primera verificación: establece prevLiveRef con el estado actual.
    // NO se hace un segundo check a los 2s con el ref vacío: eso provocaba
    // que CADA canal en vivo disparase una alerta al iniciar la app, porque
    // `wasLive` era undefined para todos y la condición `!wasLive && isLive`
    // se cumplía siempre. (Auditoría WT-20260628-01 / B-1)
    checkLive()

    let cancelled = false
    const schedulePoll = () => {
      timerRef.current = setTimeout(() => {
        if (cancelled) return
        checkLive()
        if (!cancelled) schedulePoll()
      }, intervalMs)
    }
    schedulePoll()

    return () => {
      cancelled = true
      clearTimeout(timerRef.current)
    }
  }, [favorites, intervalMs])

  return { alerts, dismissAlert }
}
