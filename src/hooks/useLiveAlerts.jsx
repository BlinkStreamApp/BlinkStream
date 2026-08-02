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
import { PUBLIC_CLIENT_ID, sanitizeChannelForGraphQL } from '../utils/twitch'
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
      // FIX WT-20260628-124: la query GQL anterior interpolaba los
      // logins de favoritos directamente en el string de query, lo
      // cual es CWE-94 (Code Injection). Migramos a variables GQL +
      // sanitizeChannelForGraphQL (regex ^[a-z0-9_]{3,25}$). Si un
      // favorito no pasa la validacion, lo descartamos del batch.
      // Importante: el alias GQL usa `a${originalIndex}` (indice en
      // `favorites`, no en el array filtrado) para que los consumers
      // de abajo puedan resolver `json.data.aN` con N = position del
      // favorito en el array ORIGINAL. Esto preserva la compatibilidad
      // con la logica de prevLiveRef.current y con el setAlerts que
      // espera `json.data.a${favorites.indexOf(f)}`.
      const validPairs = favorites
        .map((f, originalIndex) => {
          const login = sanitizeChannelForGraphQL(f)
          return login ? { f, login, originalIndex } : null
        })
        .filter(Boolean)
      if (!validPairs.length) return
      // Map de favoritos validos -> originalIndex, para resolver el
      // alias GQL correcto al consumir la respuesta.
      const aliasByFav = new Map(validPairs.map(p => [p.f, p.originalIndex]))
      try {
        const varDecls = validPairs.map((_, i) => '$login' + i + ': String!').join(', ')
        const aliases = validPairs
          .map((p, i) => 'a' + p.originalIndex + ': user(login: $login' + i + ') { stream { id title game { displayName } } profileImageURL(width: 300) }')
          .join('\n')
        const variablesObj = {}
        validPairs.forEach((p, i) => { variablesObj['login' + i] = p.login })
        const res = await fetch('https://gql.twitch.tv/gql', {
          method: 'POST',
          headers: { 'Client-ID': PUBLIC_CLIENT_ID, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'query(' + varDecls + ') { ' + aliases + ' }',
            variables: variablesObj,
          }),
        })
        if (!res.ok) return
        const json = await res.json()
        if (json?.errors) return

        const current = {}
        favorites.forEach((f) => {
          const aliasIdx = aliasByFav.get(f)
          if (aliasIdx == null) { current[f] = false; return }
          const user = json?.data?.[`a${aliasIdx}`]
          current[f] = !!user?.stream
        })

        const newlyLive = []

        setAlerts(prev => {
          const newAlerts = [...prev]
          favorites.forEach(f => {
            const wasLive = prevLiveRef.current[f]
            const isLive = current[f]
            if (!wasLive && isLive) {
              const aliasIdx = aliasByFav.get(f)
              const userData = aliasIdx != null ? json?.data?.[`a${aliasIdx}`] : null
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
