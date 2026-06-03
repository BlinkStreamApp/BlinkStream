import { useEffect, useRef, useCallback, useState } from 'react'
import { PUBLIC_CLIENT_ID } from '../utils/twitch'

export function Toast({ message, channel, logo, onClick, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <button
      onClick={() => { onClick?.(); onDismiss() }}
      className="flex items-center gap-3 bg-bg-secondary/90 backdrop-blur-sm border border-bg-tertiary/60 rounded-xl px-4 py-3 shadow-lg cursor-pointer hover:bg-hover transition-colors animate-slide-right max-w-[360px]"
    >
      {logo ? (
        <img src={logo} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-twitch flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">{channel?.charAt(0).toUpperCase()}</span>
        </div>
      )}
      <div className="min-w-0 flex-1 text-left">
        <p className="text-[13px] font-semibold text-text-primary truncate">{channel} está en vivo</p>
        <p className="text-[11px] text-text-secondary truncate">{message}</p>
      </div>
      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse-dot shrink-0" />
    </button>
  )
}

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
            }
          })
          return newAlerts
        })

        prevLiveRef.current = current
      } catch { /* ignore */ }
    }

    checkLive()
    const initTimer = setTimeout(() => {
      prevLiveRef.current = {}
      checkLive()
    }, 2000)

    timerRef.current = setInterval(checkLive, intervalMs)

    return () => {
      clearTimeout(initTimer)
      clearInterval(timerRef.current)
    }
  }, [favorites, intervalMs])

  return { alerts, dismissAlert }
}
