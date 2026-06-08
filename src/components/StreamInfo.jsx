import { useState, useEffect } from 'react'
import { PUBLIC_CLIENT_ID, getHeaders } from '../utils/twitch'
import timerIcon from '../assets/timer.png'
import LiveBadge from './LiveBadge'

function exactViewers(n) {
  if (n == null) return null
  if (n >= 1000) return `${(n/1000).toFixed(1)}k`
  return String(n)
}

function PingDot() {
  return (
    <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-bg-primary" />
    </span>
  )
}

function buildGqlQuery(channel) {
  const login = channel.toLowerCase()
  return `{
    user(login: "${login}") {
      profileImageURL(width: 70)
      stream {
        id
        title
        viewersCount
        createdAt
        game { displayName }
        tags { id localizedName }
        type
      }
    }
  }`
}

export default function StreamInfo({ channel, isFavorite, onToggleFavorite }) {
  const [info, setInfo] = useState(null)
  const [avatar, setAvatar] = useState(null)
  const [tags, setTags] = useState([])
  const [streamType, setStreamType] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!channel) return
    let cancelled = false
    setLoading(true)
    setAvatar(null)
    setTags([])
    setStreamType(null)

    ;(async () => {
      const helixHeaders = await getHeaders()
      const [helixData, gqlData] = await Promise.all([
        fetch(`https://api.twitch.tv/helix/streams?user_login=${channel}`, {
          headers: helixHeaders,
          signal: AbortSignal.timeout(6000),
        }).then(res => res.ok ? res.json() : null).catch(() => null),
        fetch('https://gql.twitch.tv/gql', {
          method: 'POST',
          headers: { 'Client-ID': PUBLIC_CLIENT_ID, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: buildGqlQuery(channel) }),
          signal: AbortSignal.timeout(6000),
        }).then(res => res.ok ? res.json() : null).catch(() => null),
      ])
      if (cancelled) return

      const gqlUser = gqlData?.data?.user
      setAvatar(gqlUser?.profileImageURL || null)

      const helixStream = helixData?.data?.[0] || null
      const gqlStream = gqlUser?.stream || null

      if (helixStream) {
        setInfo({
          title: helixStream.title || '',
          game_name: helixStream.game_name || '',
          viewer_count: helixStream.viewer_count,
          started_at: helixStream.started_at || null,
        })
        setStreamType(helixStream.type || 'live')
        setTags([])
      } else if (gqlStream) {
        setInfo({
          title: gqlStream.title || '',
          game_name: gqlStream.game?.displayName || '',
          viewer_count: gqlStream.viewersCount,
          started_at: gqlStream.createdAt || null,
        })
        setStreamType(gqlStream.type || 'live')
      } else {
        setInfo(null)
        setStreamType(null)
      }

      if (gqlStream?.tags?.length) {
        setTags(gqlStream.tags.map(t => t.localizedName).filter(Boolean))
      }

      setLoading(false)
    })().catch(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [channel])

  const isLive = !!info
  const isRerun = streamType === 'rerun'

  const [uptime, setUptime] = useState('')
  useEffect(() => {
    if (!info?.started_at) { setUptime(''); return }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(info.started_at).getTime()) / 1000)
      if (elapsed < 0) { setUptime(''); return }
      const h = Math.floor(elapsed / 3600)
      const m = Math.floor((elapsed % 3600) / 60)
      const s = elapsed % 60
      setUptime(h > 0 ? `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}` : `${m}:${s.toString().padStart(2,'0')}`)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [info?.started_at])

  return (
    <div className="shrink-0 px-4 py-2.5 bg-bg-secondary/20 backdrop-blur-sm border-b border-white/[0.04] flex items-center gap-3 select-none">
      <div className="relative shrink-0">
        <div className="h-9 w-9 rounded-full border-2 border-twitch/30 overflow-hidden bg-bg-tertiary flex items-center justify-center">
          {avatar ? (
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-twitch/50 text-sm font-bold uppercase">{channel.charAt(0)}</span>
          )}
        </div>
        {isLive && !isRerun && <PingDot />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {isLive && <LiveBadge size="sm" />}
          {isRerun && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/90 text-white text-[10px] font-bold uppercase tracking-wider shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
              RERUN
            </span>
          )}
          <h2 className="text-sm font-bold text-text-primary truncate">{channel}</h2>
          {info?.game_name && (
            <span className="text-[10px] font-medium text-twitch bg-twitch/10 px-1.5 py-0.5 rounded border border-twitch/20 shrink-0 hidden sm:inline">
              {info.game_name}
            </span>
          )}
        </div>

        {info?.title && (
          <p className="text-[13px] text-white/85 font-medium truncate mt-0.5">{info.title}</p>
        )}

        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {info?.viewer_count != null && (
            <span className="text-[12px] text-text-secondary font-medium tabular-nums whitespace-nowrap">
              {exactViewers(info.viewer_count)} viewers
            </span>
          )}
          {uptime && (
            <span className="flex items-center gap-1 text-[12px] text-twitch/80 font-mono tabular-nums whitespace-nowrap">
              <img src={timerIcon} alt="" className="w-3.5 h-3.5 opacity-70" />
              {uptime}
            </span>
          )}
          {tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {tags.slice(0, 3).map(tag => (
                <span key={tag} className="text-[10px] text-text-muted bg-bg-tertiary/60 px-1.5 py-0.5 rounded-full whitespace-nowrap border border-white/[0.04]">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {onToggleFavorite && (
        <button onClick={onToggleFavorite}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors btn-press shrink-0 ${
            isFavorite
              ? 'border-yellow-400/30 bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20'
              : 'border-bg-tertiary bg-bg-tertiary/30 text-text-muted/40 hover:text-yellow-400 hover:border-yellow-400/30'
          }`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
          </svg>
        </button>
      )}
    </div>
  )
}
