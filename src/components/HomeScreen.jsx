import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import { PUBLIC_CLIENT_ID, getHeaders } from '../utils/twitch'
import LiveBadge from './LiveBadge'

function exactViewers(n) {
  if (n == null) return null
  return Number(n).toLocaleString()
}

const CACHE_KEY_STATUS = 'blinkstream_live_status_v1'
const CACHE_KEY_LOGOS  = 'blinkstream_logos_v1'
const STATUS_TTL_MS = 30_000
const LOGOS_TTL_MS  = 86_400_000

function cacheGet(key, ttlMs) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > ttlMs) {
      sessionStorage.removeItem(key)
      return null
    }
    return data
  } catch { return null }
}

function cacheSet(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch { /* quota exceeded — silencio */ }
}

async function fetchAvatarsViaGQL(logins) {
  if (!logins.length) return null
  try {
    const aliases = logins.map((l, i) =>
      `a${i}: user(login: "${l.toLowerCase()}") { profileImageURL(width: 300) }`
    ).join('\n')
    const res = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { 'Client-ID': PUBLIC_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ ${aliases} }` }),
    })
    if (!res.ok) return null
    const json = await res.json()
    if (json?.errors) return null
    const result = {}
    logins.forEach((l, i) => {
      const url = json?.data?.[`a${i}`]?.profileImageURL
      if (url) result[l.toLowerCase()] = url
    })
    return Object.keys(result).length ? result : null
  } catch { return null }
}

async function fetchStreamsViaGQL(logins) {
  if (!logins.length) return null
  try {
    const aliases = logins.map((l, i) =>
      `a${i}: user(login: "${l.toLowerCase()}") { stream { id title game { displayName } viewersCount createdAt } }`
    ).join('\n')
    const res = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { 'Client-ID': PUBLIC_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ ${aliases} }` }),
    })
    if (!res.ok) return null
    const json = await res.json()
    if (json?.errors) return null
    const result = {}
    logins.forEach((l, i) => {
      const stream = json?.data?.[`a${i}`]?.stream
      if (stream) {
        const key = l.toLowerCase()
        result[key] = {
          user_login: l,
          title: stream.title,
          game_name: stream.game?.displayName || '',
          viewer_count: stream.viewersCount,
          created_at: stream.createdAt || null,
        }
      }
    })
    return Object.keys(result).length ? result : null
  } catch { return null }
}

function Skeleton({ className = '' }) {
  return (
    <div className={`skeleton-shimmer rounded ${className}`} />
  )
}

function Avatar({ name, size = 8, src }) {
  const colors = ['#9146ff', '#772ce8', '#5a1ec0', '#3b82f6', '#06b6d4', '#10b981']
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length]
  const px = size * 4
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0 overflow-hidden"
      style={{ background: src ? 'transparent' : color, fontSize: px * 0.375, width: px, height: px }}
    >
      {src
        ? <img src={src} alt={name} className="w-full h-full object-cover" />
        : (name?.[0]?.toUpperCase() || '?')
      }
    </div>
  )
}

const SidebarChannel = memo(function SidebarChannel({ name, status, onSelect, onRemove }) {
  const isLive = status?.live
  const isOffline = status && !status.live
  return (
    <div className={`relative group animate-slide-up sidebar-channel ${isOffline ? '[&_.ch-name]:text-[#6b6b80] [&_.ch-game]:text-[#48485a]' : ''}`}>
      <button
        onClick={() => onSelect(name)}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-hover rounded-lg cursor-pointer transition-all duration-150 text-left"
      >
        <Avatar name={name} size={8} src={status?.logo} />

      <div className="min-w-0 flex-1">
        <p className="ch-name text-[13px] font-semibold text-text-primary truncate leading-tight">{name}</p>
        <p className="ch-game text-[12px] text-text-muted truncate leading-tight">
          {isOffline ? 'Offline' : (status?.game || 'En vivo')}
        </p>
      </div>

      {isLive && status?.viewers != null && (
        <span className="text-[12px] text-red-400 font-medium shrink-0 flex items-center gap-1 tabular-nums">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          {exactViewers(status.viewers)}
        </span>
      )}
      {isOffline && (
        <span className="text-[12px] text-text-secondary/60 shrink-0 tabular-nums">—</span>
      )}
      </button>

      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(name) }}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full text-text-muted/30 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer btn-press"
          title="Eliminar de favoritos"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      )}
    </div>
  )
})

const StreamCard = memo(function StreamCard({ stream, onSelect, logo }) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const thumb = stream.thumbnail_url?.replace('{width}', '440').replace('{height}', '248') || ''

  return (
    <button
      onClick={() => onSelect(stream.user_login)}
      className="text-left group cursor-pointer w-full card-hover stream-card-hover animate-slide-up"
    >
      <div className="relative aspect-video rounded-md overflow-hidden bg-bg-tertiary mb-2">
        {!imgLoaded && <div className="absolute inset-0 skeleton-shimmer" />}
        <img
          src={thumb}
          alt=""
          className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
        />
        <div className="absolute top-1.5 left-1.5">
          <LiveBadge />
        </div>
        {stream.viewer_count != null && (
          <div className="absolute bottom-1.5 left-1.5 bg-black/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-[12px] text-white/90 leading-none">
            {exactViewers(stream.viewer_count)} viewers
          </div>
        )}
        <div className="absolute bottom-1.5 right-1.5 bg-black/80 backdrop-blur-sm px-1 py-0.5 rounded text-[11px] text-white/60 leading-none">
          EN VIVO
        </div>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200" />
      </div>

      <div className="flex gap-2">
        <Avatar name={stream.user_login} size={8} src={logo} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-text-primary truncate leading-tight">
            {stream.title}
          </p>
          <p className="text-[12px] text-text-secondary truncate leading-tight mt-0.5">
            {stream.user_name || stream.user_login}
          </p>
          <p className="text-[12px] text-text-muted truncate leading-tight mt-0.5">
            {stream.game_name}
          </p>
          {stream.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {stream.tags.slice(0, 2).map(tag => (
                <span key={tag} className="text-[11px] bg-bg-tertiary text-text-muted px-1.5 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
})

const SectionHeader = memo(function SectionHeader({ title, onVerTodo }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[15px] font-bold text-text-primary">{title}</h2>
      {onVerTodo && (
        <button
          onClick={onVerTodo}
          className="text-[12px] text-twitch hover:text-twitch-light cursor-pointer transition-colors"
        >
          Ver todo
        </button>
      )}
    </div>
  )
})

const HeroCarousel = memo(function HeroCarousel({ streams, onSelect, logos, currentIndex, onIndexChange }) {
  if (!streams.length) {
    return (
      <div className="relative w-full rounded-xl overflow-hidden bg-bg-tertiary mb-6" style={{ aspectRatio: '16/5', maxWidth: '1400px', margin: '0 auto 1.5rem' }}>
        <Skeleton className="w-full h-full rounded-none" />
      </div>
    )
  }

  const stream = streams[currentIndex % streams.length] || streams[0]

  const goNext = (e) => { e.stopPropagation(); onIndexChange((currentIndex + 1) % streams.length) }
  const goPrev = (e) => { e.stopPropagation(); onIndexChange((currentIndex - 1 + streams.length) % streams.length) }

  const thumb = stream.thumbnail_url?.replace('{width}', '1280').replace('{height}', '720') || ''

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden cursor-pointer group mb-6"
      style={{ aspectRatio: '16/5', maxWidth: '1400px', margin: '0 auto 1.5rem' }}
      onClick={() => onSelect(stream.user_login)}
    >
      <img key={stream.id} src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover transition-all duration-500 animate-fade-in" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />

      <div className="absolute inset-0 flex flex-col justify-end p-6 pb-5" onClick={() => onSelect(stream.user_login)}>
        <div className="flex items-center gap-2 mb-2">
          <LiveBadge />
          <span className="text-white/80 text-[12px] font-medium">
            {exactViewers(stream.viewer_count)} Viewers
          </span>
        </div>
        <h1 className="text-white font-extrabold text-2xl sm:text-3xl leading-tight mb-2 drop-shadow-2xl max-w-lg">
          {stream.title}
        </h1>
        {stream.game_name && (
          <p className="text-white/70 text-[13px] mb-4 max-w-md line-clamp-2">
            {stream.game_name}
          </p>
        )}
        <button
          onClick={e => { e.stopPropagation(); onSelect(stream.user_login) }}
          className="flex items-center gap-2 bg-gradient-to-r from-twitch to-purple-600 hover:from-twitch-dark hover:to-purple-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg cursor-pointer transition-all shadow-lg shadow-twitch/20 hover:shadow-twitch/40 w-fit"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>
          Ver ahora
        </button>

        <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2">
          <Avatar name={stream.user_login} size={6} src={logos?.[stream.user_login?.toLowerCase()]} />
          <div>
            <p className="text-white text-[12px] font-semibold leading-tight">{stream.user_name || stream.user_login}</p>
            <p className="text-white/50 text-[11px] leading-tight">
              {stream.game_name ? `Jugando a ${stream.game_name}` : 'En vivo'}
            </p>
          </div>
        </div>
      </div>

      {streams.length > 1 && (
        <>
          <button onClick={goPrev} className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center cursor-pointer opacity-60 hover:opacity-100 transition-opacity z-20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button onClick={goNext} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center cursor-pointer opacity-60 hover:opacity-100 transition-opacity z-20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </>
      )}

      {streams.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <div className="flex gap-1.5 bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-full">
          {streams.slice(0, 5).map((_, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); onIndexChange(i) }}
              className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                i === (currentIndex % streams.length) ? 'bg-white w-4' : 'bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
          </div>
        </div>
      )}
    </div>
  )
})

export default function HomeScreen({ onSelect, onToggleFavorite, onShowAbout, favorites, recentChannels = [], onRemoveRecent }) {
  const [liveStatus, setLiveStatus] = useState({})
  const [channelLogos, setChannelLogos] = useState({})
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [recentExpanded, setRecentExpanded] = useState(false)
  const [heroIndex, setHeroIndex] = useState(0)
  const [sortMode, setSortMode] = useState(() => {
    return window.__blinkstream_sortMode || 0
  })
  const cachedStatusRef = useRef({})
  const cachedLogosRef = useRef({})
  const [topGames, setTopGames] = useState([])
  const [activeGameId, setActiveGameId] = useState(null)
  const [gameStreams, setGameStreams] = useState([])
  const [gameLoading, setGameLoading] = useState(false)

  const fetchLiveStatus = useCallback(async () => {
    const allNames = [...new Set([...favorites, ...recentChannels])]
    if (!allNames.length) {
      setLiveStatus({})
      setChannelLogos({})
      return
    }

    const BATCH = 100
    const batches = []
    for (let i = 0; i < allNames.length; i += BATCH) {
      batches.push(allNames.slice(i, i + BATCH))
    }

    const headers = await getHeaders()

    const [streamResults, userResults] = await Promise.all([
      Promise.all(batches.map(async (batch) => {
        try {
          const res = await fetch(
            `https://api.twitch.tv/helix/streams?${batch.map(n => `user_login=${encodeURIComponent(n)}`).join('&')}`,
            { headers }
          )
          if (res.ok) {
            const data = await res.json()
            return data.data || []
          }
        } catch { /* ignore */ }
        return []
      })),
      Promise.all(batches.map(async (batch) => {
        try {
          const res = await fetch(
            `https://api.twitch.tv/helix/users?${batch.map(n => `login=${encodeURIComponent(n)}`).join('&')}`,
            { headers }
          )
          if (res.ok) {
            const data = await res.json()
            return data.data || []
          }
        } catch { /* ignore */ }
        return []
      })),
    ])

    const streamData = streamResults.flat()
    const logoMap = {}
    userResults.flat().forEach(u => {
      logoMap[u.login.toLowerCase()] = u.profile_image_url
    })

    let gqlStreams = null
    if (!streamData.length) {
      const gqlStreamResults = await Promise.all(
        batches.map(b => fetchStreamsViaGQL(b))
      )
      gqlStreams = {}
      gqlStreamResults.forEach(r => { if (r) Object.assign(gqlStreams, r) })
    }

    if (!Object.keys(logoMap).length) {
      const gqlAvatarResults = await Promise.all(
        batches.map(b => fetchAvatarsViaGQL(b))
      )
      gqlAvatarResults.forEach(r => { if (r) Object.assign(logoMap, r) })
    }

    const statusMap = {}
    if (streamData.length) {
      streamData.forEach(s => {
        const key = s.user_login.toLowerCase()
        statusMap[key] = {
          live: true, title: s.title, game: s.game_name,
          viewers: s.viewer_count,
          thumbnail: s.thumbnail_url?.replace('{width}', '440').replace('{height}', '248'),
          logo: logoMap[key],
        }
      })
    } else if (gqlStreams && Object.keys(gqlStreams).length) {
      Object.entries(gqlStreams).forEach(([key, s]) => {
        statusMap[key] = {
          live: true, title: s.title, game: s.game_name,
          viewers: s.viewer_count,
          startedAt: s.created_at || null,
          logo: logoMap[key],
        }
      })
    }

    allNames.forEach(n => {
      const key = n.toLowerCase()
      if (!statusMap[key]) statusMap[key] = { live: false, logo: logoMap[key] }
    })

    cacheSet(CACHE_KEY_STATUS, statusMap)
    cacheSet(CACHE_KEY_LOGOS, logoMap)

    setLiveStatus(statusMap)
    setChannelLogos(logoMap)
    cachedStatusRef.current = statusMap
    cachedLogosRef.current = logoMap
  }, [favorites, recentChannels])

  useEffect(() => {
    const cachedStatus = cacheGet(CACHE_KEY_STATUS, STATUS_TTL_MS)
    const cachedLogos = cacheGet(CACHE_KEY_LOGOS, LOGOS_TTL_MS)
    if (cachedStatus && Object.keys(cachedStatus).length) {
      setLiveStatus(cachedStatus)
      cachedStatusRef.current = cachedStatus
    }
    if (cachedLogos && Object.keys(cachedLogos).length) {
      setChannelLogos(cachedLogos)
      cachedLogosRef.current = cachedLogos
    }

    fetchLiveStatus()
    const interval = setInterval(fetchLiveStatus, 60000)
    return () => clearInterval(interval)
  }, [fetchLiveStatus])

  useEffect(() => {
    let c = false
    ;(async () => {
      const headers = await getHeaders()
      const r = await fetch(`https://api.twitch.tv/helix/games/top?first=12`, { headers, signal: AbortSignal.timeout(8000) })
      if (!c) {
        const d = r.ok ? await r.json() : null
        if (d?.data) setTopGames(d.data.map(g => ({
          id: g.id, name: g.name, boxArt: g.box_art_url?.replace('{width}','285').replace('{height}','380') || '',
        })))
      }
    })()
    return () => { c = true }
  }, [])

  const sortedFavorites = useMemo(() => {
    return [...favorites].sort((a, b) => {
      const aData = liveStatus[a.toLowerCase()] || {}
      const bData = liveStatus[b.toLowerCase()] || {}
      if (sortMode === 1) return (bData.viewers || 0) - (aData.viewers || 0)
      if (sortMode === 2) return (aData.viewers || 0) - (bData.viewers || 0)
      const aLive = aData.live ? 1 : 0
      const bLive = bData.live ? 1 : 0
      return bLive - aLive
    })
  }, [favorites, liveStatus, sortMode])

  const sidebarFavChannels = useMemo(() => {
    return sortedFavorites.slice(0, sidebarExpanded ? 20 : 5)
  }, [sortedFavorites, sidebarExpanded])

  useEffect(() => {
    window.__blinkstream_sortMode = sortMode
  }, [sortMode])

  const heroStreams = useMemo(() => {
    return favorites
      .map(name => {
        const key = name.toLowerCase()
        const status = liveStatus[key] || {}
        if (!status.live) return null
        return {
          id: key,
          title: status.title || '',
          user_login: name,
          user_name: name,
          game_name: status.game || '',
          viewer_count: status.viewers || 0,
          thumbnail_url: status.thumbnail || '',
        }
      })
      .filter(Boolean)
      .slice(0, 5)
  }, [favorites, liveStatus])

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-bg-primary">

      <aside className="hidden md:flex flex-col w-[200px] lg:w-[240px] shrink-0 bg-bg-secondary/30 backdrop-blur-sm border-r border-white/[0.04]">

        <div className="flex-1 overflow-y-auto py-4">
        {favorites.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between px-3 mb-2">
              <span className="text-[12px] font-bold text-text-primary tracking-wide">
                Canales Favoritos
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setSortMode(m => (m + 1) % 3)}
                  className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-hover cursor-pointer transition-all"
                  title={sortMode === 0 ? 'Online primero' : sortMode === 1 ? 'Más viewers' : 'Menos viewers'}
                >
                  {sortMode === 0 ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4"/></svg>
                  ) : sortMode === 1 ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 3l7 7h-4v11h-6V10H5z"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 21l-7-7h4V3h6v11h4z"/></svg>
                  )}
                </button>
                <button
                  onClick={() => setSidebarExpanded(p => !p)}
                  className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-hover cursor-pointer transition-all"
                  title="Colapsar"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 10l5 5 5-5z" />
                  </svg>
                </button>
              </div>
            </div>

            {sidebarFavChannels.map(name => {
              const base = liveStatus[name.toLowerCase()] || {}
              return (
                <SidebarChannel
                  key={name}
                  name={name}
                  status={{ ...base, logo: base.logo || channelLogos[name.toLowerCase()] }}
                  onSelect={onSelect}
                  onRemove={onToggleFavorite}
                />
              )
            })}

            {favorites.length > 5 && !sidebarExpanded && (
              <button
                onClick={() => setSidebarExpanded(true)}
                className="w-full text-left px-3 py-1.5 text-[12px] text-twitch hover:text-twitch-light cursor-pointer transition-colors"
              >
                Mostrar más ({favorites.length - 5})
              </button>
            )}
          </div>
        )}

        {recentChannels.length > 0 && (
          <div className="mb-4">
            <div className="px-3 mb-2">
              <span className="text-[12px] font-bold text-text-primary tracking-wide">
                Vistos Recientemente
              </span>
            </div>
            {recentChannels.slice(0, recentExpanded ? recentChannels.length : 5).map(name => {
              const key = name.toLowerCase()
              const base = liveStatus[key] || {}
              return (
                <SidebarChannel
                  key={`recent-${name}`}
                  name={name}
                  status={{ ...base, logo: base.logo || channelLogos[key] }}
                  onSelect={onSelect}
                  onRemove={onRemoveRecent}
                />
              )
            })}
            {recentChannels.length > 5 && !recentExpanded && (
              <button
                onClick={() => setRecentExpanded(true)}
                className="w-full text-left px-3 py-1.5 text-[12px] text-twitch hover:text-twitch-light cursor-pointer transition-colors"
              >
                Mostrar más ({recentChannels.length - 5})
              </button>
            )}
          </div>
        )}
        </div>

        {onShowAbout && (
          <footer className="shrink-0 border-t border-white/[0.04] px-3 py-2.5">
            <button
              onClick={onShowAbout}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-[13px] text-text-secondary hover:text-text-primary hover:bg-hover cursor-pointer transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
              </svg>
              <span>Acerca de BlinkStream</span>
            </button>
          </footer>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-5 pb-16">

          {favorites.length === 0 && recentChannels.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
              <div className="w-20 h-20 rounded-2xl bg-twitch/10 flex items-center justify-center mb-6">
                <svg width="42" height="42" viewBox="0 0 24 24" fill="currentColor" className="text-twitch"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.428l-3 3v-3H6.857V1.714h13.714z"/></svg>
              </div>
              <h2 className="text-white text-xl font-bold mb-3">Descubre BlinkStream</h2>
              <p className="text-text-secondary text-[14px] max-w-md leading-relaxed mb-8">
                Inicia sesión con Twitch para ver tus canales favoritos, seguidos y descubrir nuevo contenido.
              </p>
              <div className="flex flex-wrap justify-center gap-4 mb-10">
                {['Sin anuncios','Chat con emotes','Favoritos en la nube','Notificaciones live'].map((f,i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px] text-text-muted bg-bg-secondary/50 px-3 py-1.5 rounded-full border border-bg-tertiary/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-twitch/60" />{f}
                  </div>
                ))}
              </div>
              <p className="text-text-muted/50 text-[12px]">
                Usa el botón <strong className="text-twitch">Twitch</strong> en la esquina superior derecha para conectarte.
              </p>
            </div>
          ) : (
            <>
          <HeroCarousel streams={heroStreams} onSelect={onSelect} logos={channelLogos} currentIndex={heroIndex} onIndexChange={setHeroIndex} />

          {topGames.length > 0 && (
            <section className="mb-6 animate-fade-in">
              <SectionHeader title="Juegos populares" />
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {topGames.map(game => (
                  <button key={game.id} onClick={async () => {
                    if (activeGameId === game.id) { setActiveGameId(null); setGameStreams([]); return }
                    setActiveGameId(game.id); setGameLoading(true)
                    try {
                      const h = await getHeaders()
                      const res = await fetch(`https://api.twitch.tv/helix/streams?game_id=${game.id}&first=8`, { headers: h, signal: AbortSignal.timeout(8000) })
                      if (res.ok) { const d = await res.json(); setGameStreams(d.data || []) }
                    } catch {}
                    setGameLoading(false)
                  }} className="flex flex-col items-center gap-1.5 shrink-0 w-[110px] group cursor-pointer card-hover rounded-lg p-2 hover:bg-hover transition-colors">
                    {game.boxArt ? (
                      <img src={game.boxArt} alt="" className="w-full aspect-[3/4] object-cover rounded-md transition-transform group-hover:scale-105" loading="lazy" />
                    ) : (
                      <div className="w-full aspect-[3/4] bg-bg-tertiary rounded-md flex items-center justify-center text-text-muted/30">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z"/></svg>
                      </div>
                    )}
                    <span className="text-[12px] font-medium text-text-primary truncate w-full text-center">{game.name}</span>
                  </button>
                ))}
              </div>
              {activeGameId && (
                <div className="mt-4 p-3 rounded-xl bg-bg-secondary/50 border border-bg-tertiary/40">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[13px] font-bold text-text-primary">En vivo ahora</h3>
                    <button onClick={() => { setActiveGameId(null); setGameStreams([]) }} className="text-[11px] text-text-muted hover:text-text-primary cursor-pointer">✕</button>
                  </div>
                  {gameLoading ? <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-twitch border-t-transparent rounded-full animate-spin" /></div>
                  : gameStreams.length === 0 ? <p className="text-[12px] text-text-muted text-center py-2">No hay streams en vivo</p>
                  : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {gameStreams.map(s => (
                        <button key={s.id} onClick={() => onSelect(s.user_login)} className="shrink-0 w-[160px] sm:w-[180px] lg:w-[200px] text-left group cursor-pointer card-hover rounded-lg overflow-hidden bg-bg-tertiary">
                          <div className="relative aspect-video overflow-hidden">
                            {s.thumbnail_url ? (
                              <img src={s.thumbnail_url.replace('{width}','320').replace('{height}','180')} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                            ) : <div className="w-full h-full bg-bg-tertiary" />}
                            <span className="absolute bottom-1 left-1 bg-black/80 px-1.5 py-0.5 rounded text-[12px] text-white/90">{s.viewer_count >= 1000 ? `${(s.viewer_count/1000).toFixed(1)}k` : s.viewer_count} viewers</span>
                          </div>
                          <div className="p-2">
                            <p className="text-[13px] font-semibold text-text-primary truncate">{s.user_name}</p>
                            <p className="text-[12px] text-text-muted truncate">{s.title}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {(() => {
            const liveChannels = favorites
              .map(name => {
                const key = name.toLowerCase()
                const status = liveStatus[key]
                if (!status?.live) return null
                return {
                  user_login: name,
                  user_name: name,
                  title: status.title || '',
                  game_name: status.game || '',
                  viewer_count: status.viewers || 0,
                  thumbnail_url: status.thumbnail || '',
                  tags: [],
                }
              })
              .filter(Boolean)
            if (!liveChannels.length) return null
            return (
              <section className="mb-8 animate-fade-in">
                <SectionHeader title="Canales en vivo" />
                <div className="grid gap-3 sm:gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }}>
                  {liveChannels.map(stream => (
                    <StreamCard key={stream.user_login} stream={stream} onSelect={onSelect} logo={channelLogos[stream.user_login.toLowerCase()]} />
                  ))}
                </div>
              </section>
            )
          })()}

          {recentChannels.length > 0 && (
            <section className="mb-8 animate-fade-in">
              <SectionHeader title="Vistos Recientemente" />
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {recentChannels.map(name => {
                  const key = name.toLowerCase()
                  const status = liveStatus[key]
                  const logo = channelLogos[key]
                  return (
                    <button
                      key={`rec-${name}`}
                      onClick={() => onSelect(name)}
                      className="flex flex-col items-center gap-1.5 shrink-0 w-[100px] group cursor-pointer card-hover rounded-lg p-2 hover:bg-hover transition-colors relative"
                    >
                      {onRemoveRecent && (
                        <button
                          onClick={e => { e.stopPropagation(); onRemoveRecent(name) }}
                          className="absolute top-1 right-1 p-0.5 rounded-full text-text-muted/30 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10"
                          title="Eliminar de recientes"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      )}
                      <div className="relative">
                        <Avatar name={name} size={12} src={status?.logo || logo} />
                        {status?.live && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-bg-primary animate-pulse-dot animate-pulse-glow" />
                        )}
                      </div>
                      <span className="text-[12px] font-medium text-text-primary truncate w-full text-center leading-tight">
                        {name}
                      </span>
                      {status?.live ? (
                        <span className="text-[11px] text-text-secondary truncate w-full text-center leading-tight">
                          {status.game || 'En vivo'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-text-muted w-full text-center">Offline</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          </>)}
        </div>
      </main>
    </div>
  )
}
