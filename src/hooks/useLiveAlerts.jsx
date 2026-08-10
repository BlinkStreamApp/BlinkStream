

import { useEffect, useRef, useCallback, useState } from 'react'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { PUBLIC_CLIENT_ID, sanitizeChannelForGraphQL } from '../utils/twitch'
import { logError } from '../utils/errors'
import { isTauri } from '../utils/tauriEnv'

export function useLiveAlerts(favorites, intervalMs = 30000) {
  const [alerts, setAlerts] = useState([])
  const [liveFavorites, setLiveFavorites] = useState([])
  const prevLiveRef = useRef({})
  const timerRef = useRef(null)

  const dismissAlert = useCallback((channel) => {
    setAlerts(prev => prev.filter(a => a.channel !== channel))
  }, [])

  useEffect(() => {
    if (!favorites.length) return

    const checkLive = async () => {

      const validPairs = favorites
        .map((f, originalIndex) => {
          const login = sanitizeChannelForGraphQL(f)
          return login ? { f, login, originalIndex } : null
        })
        .filter(Boolean)
      if (!validPairs.length) return

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
        const favsInfo = favorites.map((f) => {
          const aliasIdx = aliasByFav.get(f)
          const user = aliasIdx != null ? json?.data?.[`a${aliasIdx}`] : null
          const isLive = !!user?.stream
          current[f] = isLive
          return {
            name: f,
            live: isLive,
            avatar: user?.profileImageURL || '',
            game: user?.stream?.game?.displayName || '',
          }
        })

        favsInfo.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0))
        setLiveFavorites(favsInfo)

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

        if (newlyLive.length > 0) {
          try {

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
      } catch {  }
    }

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

  return { alerts, dismissAlert, liveFavorites }
}
