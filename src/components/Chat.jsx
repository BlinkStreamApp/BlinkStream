import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { PUBLIC_CLIENT_ID } from '../utils/twitch'
import logo7tv from '../assets/7tv.png'
import logoBttv from '../assets/bttv.png'
import logoFfz from '../assets/ffz.png'

const DEFAULT_CLIENT_ID = PUBLIC_CLIENT_ID

function loadCustomClientId() {
  try { return localStorage.getItem('blinkstream_custom_client_id') || '' } catch { return '' }
}
function saveCustomClientId(id) {
  try { localStorage.setItem('blinkstream_custom_client_id', id || '') } catch { /* ignore */ }
}

const EMOTE_RE = /^[\w-]+$/

function parseMessageTags(tags) {
  const obj = {}
  tags.split(';').forEach(pair => {
    const [k, v] = pair.split('=')
    if (k) obj[k] = v || ''
  })
  return obj
}

function buildEmoteTrie(emotes) {
  const root = {}
  for (const [code, data] of Object.entries(emotes)) {
    if (!EMOTE_RE.test(code)) continue
    const key = code.toLowerCase()
    let node = root
    for (const ch of key) {
      if (!node[ch]) node[ch] = {}
      node = node[ch]
    }
    node.$ = data
  }
  return root
}

function matchEmotesInText(text, twitchEmotesStr, trie) {
  const emoteMap = {}
  if (twitchEmotesStr) {
    twitchEmotesStr.split('/').forEach(pair => {
      const [id, positions] = pair.split(':')
      if (id && positions) {
        positions.split(',').forEach(range => {
          const [start, end] = range.split('-')
          emoteMap[Number(start)] = { id, start: Number(start), end: Number(end) + 1 }
        })
      }
    })
  }

  const isWordChar = (ch) => /[\w\u00C0-\u024F]/.test(ch)

  const hasWordBoundaries = (start, end) => {
    const beforeOk = start === 0 || !isWordChar(text[start - 1])
    const afterOk = end >= text.length || !isWordChar(text[end])
    return beforeOk && afterOk
  }

  const parts = []
  let i = 0
  while (i < text.length) {
    if (emoteMap[i]) {
      const em = emoteMap[i]
      parts.push({ type: 'twitch-emote', id: em.id, text: text.slice(em.start, em.end) })
      i = em.end
      continue
    }

    let node = trie
    let bestMatch = null
    let bestLen = 0
    const lowerText = text.slice(i).toLowerCase()
    for (let j = 0; j < lowerText.length && node[lowerText[j]]; j++) {
      node = node[lowerText[j]]
      if (node.$ && j + 1 > bestLen && hasWordBoundaries(i, i + j + 1)) {
        bestMatch = node.$
        bestLen = j + 1
      }
    }
    if (bestMatch) {
      parts.push({ type: 'third-party-emote', urls: bestMatch.urls, name: text.slice(i, i + bestLen) })
      i += bestLen
      continue
    }

    let textStart = i
    i++
    while (i < text.length) {
      if (emoteMap[i]) break
      let found = false
      const ch = text[i].toLowerCase()
      if (trie[ch] && hasWordBoundaries(i, i + 1)) {
        let n = trie[ch]
        for (let j = i + 1; j < text.length && n[text[j].toLowerCase()]; j++) {
          n = n[text[j].toLowerCase()]
          if (n.$ && hasWordBoundaries(i, j + 1)) { found = true; break }
        }
      }
      if (found) break
      i++
    }
    parts.push({ type: 'text', text: text.slice(textStart, i) })
  }
  return parts
}

const badgeCache = { global: null }

async function getBadgeUrl(setName, version) {
  try {
    if (!badgeCache.global) {
      const res = await fetch('https://badges.twitch.tv/v1/badges/global/display', { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data = await res.json()
        badgeCache.global = data.badge_sets || {}
      }
    }
    const setData = badgeCache.global?.[setName]
    return setData?.versions?.[version]?.image_url_1x || null
  } catch {
    return null
  }
}

function saveLocalAuth(token, username) {
  try {
    localStorage.setItem('blinkstream_twitch_token', token || '')
    localStorage.setItem('blinkstream_twitch_username', username || '')
  } catch { /* ignore */ }
}

function UserCardPopup({ username, position, onClose }) {
  const [info, setInfo] = useState(null)
  useEffect(() => {
    let c = false
    fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { 'Client-ID': PUBLIC_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ user(login: "${username.toLowerCase()}") { displayName profileImageURL(width:70) description bio createdAt } }` }),
      signal: AbortSignal.timeout(5000),
    }).then(r => r.ok ? r.json() : null).then(d => { if (!c) setInfo(d?.data?.user || null) }).catch(() => {})
    return () => { c = true }
  }, [username])

  const style = {
    position: 'fixed',
    left: `${Math.min(position.x - 100, window.innerWidth - 220)}px`,
    top: `${Math.min(position.y + 10, window.innerHeight - 160)}px`,
    zIndex: 9999,
  }

  return (
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div className="fixed bg-bg-secondary/95 backdrop-blur-md border border-bg-tertiary/60 rounded-xl shadow-2xl p-3 w-48 animate-fade-in" style={style} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-twitch/20 flex items-center justify-center overflow-hidden shrink-0">
            {info?.profileImageURL ? <img src={info.profileImageURL} alt="" className="w-full h-full object-cover" /> : <span className="text-twitch text-sm font-bold">{username.charAt(0).toUpperCase()}</span>}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-text-primary truncate">{info?.displayName || username}</p>
            <p className="text-[11px] text-text-muted">@{username}</p>
          </div>
        </div>
        {info?.description && <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-2">{info.description}</p>}
      </div>
    </>
  )
}

let msgIdCounter = 0

const ChatMessage = memo(({ msg, badgeUrls, chatFontSize, setUserCard, renderMessage }) => {
  return (
    <div
      className={`flex gap-1 text-sm leading-snug hover:bg-bg-tertiary/20 px-1.5 py-1 rounded transition-colors group/msg animate-fade-in ${msg.isNotice ? 'bg-twitch/5 border-l-2 border-twitch/30 pl-2' : ''}`}
    >
      {msg.badges.length > 0 && (
        <span className="flex gap-0.5 shrink-0 items-center pt-0.5">
          {msg.badges.map((b, i) => {
            const url = badgeUrls[`${msg.id}-${b.set}`]
            return url ? <img key={i} src={url} alt={b.set} className="w-3.5 h-3.5" loading="lazy" /> : null
          })}
        </span>
      )}
      <span
        className="font-semibold shrink-0 hover:underline cursor-pointer"
        style={{ fontSize: `${chatFontSize}px`, color: msg.color || '#adadb8' }}
        onClick={(e) => {
          e.stopPropagation()
          if (!msg.isNotice) setUserCard(prev => prev?.username === msg.user ? null : { x: e.clientX, y: e.clientY, username: msg.user })
        }}
      >
        {msg.user}
      </span>
      <span className="text-text-primary break-words min-w-0" style={{ fontSize: `${chatFontSize}px` }}>
        {renderMessage(msg.message, msg.emotes)}
      </span>
      {msg.timestamp && (
        <span className="text-[9px] text-text-muted/25 shrink-0 self-start ml-auto tabular-nums font-mono pt-0.5">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  )
})

export default function Chat({ channel, isLoggedIn, twitchToken, twitchUsername }) {
  const [messages, setMessages] = useState([])
  const [emotes, setEmotes] = useState({})
  const [badgeUrls, setBadgeUrls] = useState({})
  const [connected, setConnected] = useState(false)
  const [connError, setConnError] = useState('')
  const [inputText, setInputText] = useState('')
  const [newMsgCount, setNewMsgCount] = useState(0)

  // Auth deriva directamente de las props que llegan del padre (App.jsx → keychain).
  // Antes leíamos localStorage aquí, pero eso estaba ROTO: cuando keychain funciona
  // el token NO está en localStorage, loadAuth() retornaba null y la sesión se perdía.
  const auth = useMemo(() => {
    if (isLoggedIn && twitchToken && twitchUsername) {
      return { token: twitchToken, username: twitchUsername }
    }
    return { token: null, username: null }
  }, [isLoggedIn, twitchToken, twitchUsername])

  const [authing, setAuthing] = useState(false)
  const [authCode, setAuthCode] = useState('')
  const [authError, setAuthError] = useState('')
  const [showLoginOptions, setShowLoginOptions] = useState(false)
  const [manualToken, setManualToken] = useState('')
  const [customClientId, setCustomClientId] = useState(loadCustomClientId)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showEmoteMenu, setShowEmoteMenu] = useState(false)
  const [emoteSearch, setEmoteSearch] = useState('')
  const [emoteTab, setEmoteTab] = useState('all')
  const [showChatSettings, setShowChatSettings] = useState(false)
  const [chatFontSize, setChatFontSize] = useState(() => Number(localStorage.getItem('blinkstream_chat_font') || 14))
  const [hideBots, setHideBots] = useState(() => localStorage.getItem('blinkstream_hide_bots') === 'true')

  useEffect(() => {
    if (!showChatSettings) return
    const h = (e) => { if (!e.target.closest('.chat-settings-popup')) setShowChatSettings(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showChatSettings])

  const [recentEmotes, setRecentEmotes] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('blinkstream_recent_emotes') || '[]')
      if (!Array.isArray(raw)) return []
      // ── Migración: filtrar entradas legacy inválidas ──
      // El formato anterior guardaba `url` que era un objeto
      // (`e.url || e.urls?.[0]?.[1]`), no un string. Eso rompía la
      // comparación y cualquier render que esperara un string.
      // Nuevo formato: { name: string, provider: string }
      // La URL se reconstruye al renderizar desde el dict `emotes` cargado.
      const migrated = raw
        .filter(r => r && typeof r.name === 'string' && r.name.length > 0)
        .map(r => ({ name: r.name, provider: typeof r.provider === 'string' ? r.provider : '' }))
        .slice(0, 20)
      // Si hubo migración, re-persistir el localStorage en formato limpio.
      if (migrated.length !== raw.length) {
        try { localStorage.setItem('blinkstream_recent_emotes', JSON.stringify(migrated)) } catch { /* ignore */ }
      }
      return migrated
    } catch { return [] }
  })
  const [favoriteEmotes, setFavoriteEmotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('blinkstream_fav_emotes') || '[]') } catch { return [] }
  })
  const [userCard, setUserCard] = useState(null)

  const bottomRef = useRef(null)
  const containerRef = useRef(null)
  const isAtBottomRef = useRef(true)
  const wsRef = useRef(null)
  const lineBufferRef = useRef('')
  const trieRef = useRef({})
  const mountedRef = useRef(true)

  useEffect(() => {
    trieRef.current = buildEmoteTrie(emotes)
  }, [emotes])

  useEffect(() => { return () => { mountedRef.current = false } }, [])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const threshold = 100
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    if (isAtBottomRef.current) setNewMsgCount(0)
  }, [])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setNewMsgCount(0)
  }, [])

  const renderMessage = useCallback((text, twitchEmotes) => {
    if (!text) return text
    const parts = matchEmotesInText(text, twitchEmotes, trieRef.current)
    return parts.map((part, idx) => {
      if (part.type === 'text') return part.text
      const hideOnError = (e) => { e.target.style.display = 'none' }
      if (part.type === 'twitch-emote') {
        return (
          <img key={idx} src={`https://static-cdn.jtvnw.net/emoticons/v2/${part.id}/default/dark/2.0`} alt={part.text} className="inline-block w-6 h-6 align-middle" loading="lazy" onError={hideOnError} />
        )
      }
      return (
        <img key={idx} src={part.urls?.[2] || part.urls?.[1] || part.urls?.[0]} alt={part.name} className="inline-block w-6 h-6 align-middle" loading="lazy" onError={hideOnError} />
      )
    })
  }, [])

  const emoteControllersRef = useRef([])
  const [emoteList, setEmoteList] = useState([])

  const loadEmotes = useCallback(async (channelName) => {
    emoteControllersRef.current.forEach(ac => ac.abort())
    const controllers = []
    emoteControllersRef.current = controllers

    const dict = {}
    const emoteItems = []

    const fetchJson = async (url) => {
      const ac = new AbortController()
      controllers.push(ac)
      const timer = setTimeout(() => ac.abort(), 5000)
      try {
        const res = await fetch(url, { signal: ac.signal })
        clearTimeout(timer)
        return res.ok ? res.json() : null
      } catch (err) {
        clearTimeout(timer)
        if (err.name === 'AbortError') throw err
        return null
      }
    }

    const ch = channelName.toLowerCase()

    const tasks = [
      (async () => {
        try {
          const gqlRes = await fetch('https://gql.twitch.tv/gql', {
            method: 'POST',
            headers: { 'Client-ID': PUBLIC_CLIENT_ID, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: `{ user(login: "${ch}") { id } }` }),
            signal: AbortSignal.timeout(5000),
          })
          const gqlData = await gqlRes.json()
          const twitchId = gqlData?.data?.user?.id
          if (!twitchId) return
          const userRes = await fetchJson(`https://7tv.io/v3/users/twitch/${twitchId}`)
          if (userRes?.emote_set?.emotes) {
            userRes.emote_set.emotes.forEach(e => {
              const urls = [`https://cdn.7tv.app/emote/${e.id}/1x.webp`, `https://cdn.7tv.app/emote/${e.id}/2x.webp`, `https://cdn.7tv.app/emote/${e.id}/3x.webp`]
              if (!dict[e.name]) { dict[e.name] = { urls, provider: '7tv' }; emoteItems.push({ name: e.name, urls, provider: '7tv', id: e.id, section: 'channel' }) }
            })
          }
        } catch { /* ignore */ }
      })(),

      (async () => {
        try {
          const data = await fetchJson('https://7tv.io/v3/emote-sets/global')
          if (data?.emotes) {
            data.emotes.forEach(e => {
              if (!dict[e.name]) {
                const urls = [`https://cdn.7tv.app/emote/${e.id}/1x.webp`, `https://cdn.7tv.app/emote/${e.id}/2x.webp`, `https://cdn.7tv.app/emote/${e.id}/3x.webp`]
                dict[e.name] = { urls, provider: '7tv' }; emoteItems.push({ name: e.name, urls, provider: '7tv', id: e.id, section: 'global' })
              }
            })
          }
        } catch { /* ignore */ }
      })(),

      (async () => {
        try {
          const data = await fetchJson(`https://api.betterttv.net/3/cached/users/twitch/${channelName}`)
          if (data) {
            ;[...(data.channelEmotes || []), ...(data.sharedEmotes || [])].forEach(e => {
              const urls = [`https://cdn.betterttv.net/emote/${e.id}/1x`, `https://cdn.betterttv.net/emote/${e.id}/2x`, `https://cdn.betterttv.net/emote/${e.id}/3x`]
              dict[e.code] = { urls, provider: 'bttv' }; emoteItems.push({ name: e.code, urls, provider: 'bttv', id: e.id, section: 'channel' })
            })
          }
        } catch { /* ignore */ }
      })(),

      (async () => {
        try {
          const data = await fetchJson('https://api.betterttv.net/3/cached/emotes/global')
          if (data) {
            data.forEach(e => {
              if (!dict[e.code]) {
                const urls = [`https://cdn.betterttv.net/emote/${e.id}/1x`, `https://cdn.betterttv.net/emote/${e.id}/2x`, `https://cdn.betterttv.net/emote/${e.id}/3x`]
                dict[e.code] = { urls, provider: 'bttv' }; emoteItems.push({ name: e.code, urls, provider: 'bttv', id: e.id, section: 'global' })
              }
            })
          }
        } catch { /* ignore */ }
      })(),

      (async () => {
        try {
          const data = await fetchJson(`https://api.frankerfacez.com/v1/room/${channelName}`)
          if (data) {
            Object.values(data.sets || {}).forEach(set => {
              (set.emoticons || []).forEach(e => {
                const url = e.urls?.[4] || e.urls?.[2] || e.urls?.[1]
                if (url && !dict[e.name]) {
                  dict[e.name] = { urls: [url], provider: 'ffz' }; emoteItems.push({ name: e.name, urls: [url], provider: 'ffz', id: String(e.id), section: 'channel' })
                }
              })
            })
          }
        } catch { /* ignore */ }
      })(),

      (async () => {
        try {
          const data = await fetchJson('https://api.frankerfacez.com/v1/set/global')
          if (data) {
            Object.values(data.sets || {}).forEach(set => {
              (set.emoticons || []).forEach(e => {
                const url = e.urls?.[4] || e.urls?.[2] || e.urls?.[1]
                if (url && !dict[e.name]) {
                  dict[e.name] = { urls: [url], provider: 'ffz' }; emoteItems.push({ name: e.name, urls: [url], provider: 'ffz', id: String(e.id), section: 'global' })
                }
              })
            })
          }
        } catch { /* ignore */ }
      })(),
      (async () => {
        try {
          const data = await fetchJson('https://api.twitch.tv/helix/chat/emotes/global')
          if (data?.data) {
            data.data.forEach(e => {
              const urls = [`https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/1.0`, `https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/2.0`]
              if (!dict[e.name]) {
                dict[e.name] = { urls, provider: 'twitch' }; emoteItems.push({ name: e.name, urls, provider: 'twitch', id: e.id, section: 'global' })
              }
            })
          }
        } catch { /* ignore */ }
      })(),
      (async () => {
        try {
          const gqlRes = await fetch('https://gql.twitch.tv/gql', {
            method: 'POST',
            headers: { 'Client-ID': PUBLIC_CLIENT_ID, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: `{ user(login: "${ch}") { id } }` }),
            signal: AbortSignal.timeout(5000),
          })
          if (!gqlRes.ok) return
          const gqlData = await gqlRes.json()
          const userId = gqlData?.data?.user?.id
          if (!userId) return
          const data = await fetchJson(`https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${userId}`)
          if (data?.data) {
            data.data.forEach(e => {
              const urls = [`https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/1.0`, `https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/2.0`]
              if (!dict[e.name]) {
                dict[e.name] = { urls, provider: 'twitch' }; emoteItems.push({ name: e.name, urls, provider: 'twitch', id: e.id, section: 'channel' })
              }
            })
          }
        } catch { /* ignore */ }
      })(),
    ]

    tasks.forEach(task => {
      task.then(() => {
        if (mountedRef.current) {
          setEmotes(prev => ({ ...prev, ...dict }))
          setEmoteList(prev => {
            const existing = new Set(prev.map(e => e.provider + '-' + e.id))
            const news = emoteItems.filter(e => !existing.has(e.provider + '-' + e.id))
            return [...prev, ...news]
          })
        }
      }).catch(() => {})
    })
    Promise.all(tasks).then(() => {
      if (mountedRef.current) {
        setEmotes(dict)
        setEmoteList(emoteItems)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!channel) return
    loadEmotes(channel)
    return () => {
      emoteControllersRef.current.forEach(ac => ac.abort())
      emoteControllersRef.current = []
    }
  }, [channel, loadEmotes])

  useEffect(() => {
    if (!messages.length) return
    const lastMsg = messages[messages.length - 1]
    const pendingBadges = lastMsg.badges.filter(b => !badgeUrls[`${lastMsg.id}-${b.set}`])
    if (!pendingBadges.length) return

    Promise.all(pendingBadges.map(b =>
      getBadgeUrl(b.set, b.version).then(url => ({ key: `${lastMsg.id}-${b.set}`, url }))
    )).then(results => {
      const updates = {}
      results.forEach(r => { if (r.url) updates[r.key] = r.url })
      if (Object.keys(updates).length) setBadgeUrls(prev => ({ ...prev, ...updates }))
    })
  }, [messages, badgeUrls])

  const getClientId = useCallback(() => customClientId || DEFAULT_CLIENT_ID, [customClientId])

  const AUTH_URL = 'https://dmclksrlxlfodjestndf.supabase.co/functions/v1/twitch-auth'
  const [copiedUrl, setCopiedUrl] = useState(false)

  const handleOpenTokenSite = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(AUTH_URL)
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 3000)
    } catch (err) {
      console.warn('[Auth] Error copiando URL:', err)
    }
  }, [])

  const handleManualTokenSubmit = useCallback(async () => {
    const raw = manualToken.trim()
    if (!raw) return

    setAuthing(true)
    setAuthError('')

    const cleanToken = raw.replace(/^oauth:/i, '')

    try {
      const clientId = getClientId()
      const res = await fetch('https://api.twitch.tv/helix/users', {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Client-ID': clientId,
        },
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || `Token inválido (HTTP ${res.status})`)
      }

      const data = await res.json()
      const username = data.data?.[0]?.login

      if (!username) {
        throw new Error('No se pudo obtener el nombre de usuario')
      }

      saveLocalAuth(cleanToken, username)
      setManualToken('')
      setShowLoginOptions(false)
    } catch (err) {
      console.warn('Token validation error:', err)
      if (err.message?.includes('Invalid client') || err.message?.includes('403')) {
        setAuthError(`Token rechazado (${err.message}). Si usas un token de otro generador, configura tu propio Client-ID en "Avanzado".`)
      } else {
        setAuthError(err.message)
      }
    } finally {
      setAuthing(false)
    }
  }, [manualToken, getClientId])

  const handleDeviceCodeLogin = useCallback(async () => {
    setAuthing(true)
    setAuthCode('')
    setAuthError('')
    setShowLoginOptions(false)
    try {
      const clientId = getClientId()
      console.log('[Auth] Solicitando device code con Client-ID:', clientId)

      const deviceRes = await fetch('https://id.twitch.tv/oauth2/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          scopes: 'chat:read chat:edit',
        }),
      })

      if (!deviceRes.ok) {
        const errText = await deviceRes.text().catch(() => '')
        console.warn('[Auth] Device code error:', deviceRes.status, errText)
        throw new Error(
          `Error de autenticación (${deviceRes.status}). Usa "Token manual" como alternativa.`
        )
      }

      const deviceData = await deviceRes.json()
      const { device_code, user_code } = deviceData
      const interval = Number(deviceData.interval) || 5

      console.log('[Auth] Device code obtenido. Código:', user_code)

      setAuthCode(user_code)

      let pollInterval = interval * 1000
      let attempts = 0
      const MAX_ATTEMPTS = 60

      while (attempts < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, pollInterval))
        attempts++

        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        })

        const tokenData = await tokenRes.json()

        if (tokenData.access_token) {
          const cleanToken = tokenData.access_token
          saveLocalAuth(cleanToken, null)
          let resolvedUsername = null

          try {
            const userRes = await fetch('https://api.twitch.tv/helix/users', {
              headers: {
                'Authorization': `Bearer ${cleanToken}`,
                'Client-ID': clientId,
              },
            })
            if (userRes.ok) {
              const userData = await userRes.json()
              resolvedUsername = userData.data?.[0]?.login
              if (resolvedUsername) {
                saveLocalAuth(cleanToken, resolvedUsername)
              }
            }
          } catch { /* ignore */ }

          setAuthing(false)
          setAuthCode('')
          return
        }

        if (tokenData.error === 'authorization_pending') continue
        if (tokenData.error === 'slow_down') { pollInterval += 5000; continue }
        if (tokenData.error === 'expired_token') {
          throw new Error('El código expiró. Intenta de nuevo.')
        }

        console.warn('[Auth] Device poll error:', tokenData)
        throw new Error(tokenData.message || 'Error durante la autenticación')
      }

      throw new Error('Tiempo de espera agotado. Intenta de nuevo.')
    } catch (err) {
      console.warn('[Auth] Device auth error:', err)
      setAuthError(err.message)
      setAuthing(false)
      setAuthCode('')
    }
  }, [getClientId])

  useEffect(() => {
    if (!channel) return
    let cancelled = false
    let retryDelay = 1000
    const MAX_RETRY = 30000
    let reconnectTimer = null
    setConnError('')
    lineBufferRef.current = ''

    const connect = () => {
      if (cancelled) return
      const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
      wsRef.current = ws

      ws.onopen = () => {
        if (cancelled) { ws.close(); return }
        retryDelay = 1000
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands')

        if (auth.token && auth.username) {
          ws.send(`PASS oauth:${auth.token}`)
          ws.send(`NICK ${auth.username}`)
        } else {
          ws.send('PASS SCHMOOPIIE')
          ws.send('NICK justinfan12345')
        }

        ws.send(`JOIN #${channel}`)
        setConnected(true)
        setConnError('')
      }

      ws.onmessage = (event) => {
        if (cancelled) return
        lineBufferRef.current += event.data
        const lines = lineBufferRef.current.split('\r\n')
        lineBufferRef.current = lines.pop() || ''

        for (const line of lines) {
          if (!line) continue
          if (line.startsWith('PING')) {
            ws.send('PONG :tmi.twitch.tv')
            continue
          }

          const tagEnd = line.indexOf(' ')
          if (tagEnd === -1) continue
          const tags = line.slice(0, tagEnd)
          const rest = line.slice(tagEnd + 1).trimStart()
          const parts = rest.split(' ')
          const usernoticeIdx = parts.indexOf('USERNOTICE')
          const privmsgIdx = parts.indexOf('PRIVMSG')

          if (usernoticeIdx !== -1) {
              const parsed = parseMessageTags(tags)
              const msgId = parsed['msg-id'] || ''
              const displayName = parsed['display-name'] || parts[0]?.split('!')[0]?.replace(':', '') || 'unknown'
              const sysMsg = parsed['system-msg'] || ''
              const channelIdx = parts.findIndex(p => p.startsWith('#'))
              const msgParts = channelIdx >= 0 ? parts.slice(channelIdx + 1) : parts.slice(3)
              const userMsg = msgParts.join(' ').replace(/^:/, '')

              let noticeText = ''; let noticeIcon = ''
              const subPlan = parsed['msg-param-sub-plan'] || '1000'
              const tier = subPlan === '2000' ? 'T2' : subPlan === '3000' ? 'T3' : 'T1'
              const months = parsed['msg-param-cumulative-months'] || parsed['msg-param-streak-months'] || '1'
              const recipient = parsed['msg-param-recipient-display-name'] || parsed['msg-param-recipient-user-name'] || ''
              const giftCount = parsed['msg-param-mass-gift-count'] || ''
              const raiderCount = parsed['msg-param-viewerCount'] || ''

              if (msgId === 'sub') { noticeIcon = '⭐'; noticeText = `${displayName} se ha suscrito (${tier})` }
              else if (msgId === 'resub') { noticeIcon = '🌟'; noticeText = `${displayName} se ha suscrito (${tier}) ×${months} meses` }
              else if (msgId === 'subgift') { noticeIcon = '🎁'; noticeText = `${displayName} ha regalado una sub (${tier}) a ${recipient}` }
              else if (msgId === 'submysterygift') { noticeIcon = '🎁'; noticeText = `${displayName} ha regalado ${giftCount} subs` }
              else if (msgId === 'raid') { noticeIcon = '🔴'; noticeText = `RAID: ${displayName} ha traído ${raiderCount} viewers` }
              else if (msgId === 'ritual') { noticeIcon = '👋'; noticeText = `${displayName} está en el chat por primera vez` }
              else { noticeIcon = '📢'; noticeText = sysMsg || userMsg || `${displayName}: evento (${msgId})` }

            setMessages(prev => {
              const ts = Date.now()
              const updated = [...prev, {
                id: ++msgIdCounter,
                user: displayName,
                color: parsed['color'] || '#b19cd9',
                message: `${noticeIcon} ${noticeText}`,
                emotes: '',
                badges: [],
                isNotice: true,
                timestamp: ts,
              }]
              return updated.length > 500 ? updated.slice(-500) : updated
            })
            continue
          }

          if (privmsgIdx === -1) continue

          const userRaw = parts[0]?.split('!')[0]?.replace(':', '') || 'unknown'
          const messageParts = parts.slice(privmsgIdx + 2)
          const message = messageParts.join(' ').replace(/^:/, '')

          const parsed = parseMessageTags(tags)
          const badgeList = parsed.badges
            ? parsed.badges.split(',').map(b => {
                const [set, version] = b.split('/')
                return { set, version }
              })
            : []

          setMessages(prev => {
            const updated = [...prev, {
              id: ++msgIdCounter,
              user: userRaw,
              color: parsed['color'] || null,
              message,
              emotes: parsed['emotes'] || '',
              badges: badgeList,
              timestamp: Date.now(),
            }]
            return updated.length > 500 ? updated.slice(-500) : updated
          })

          if (!isAtBottomRef.current) {
            setNewMsgCount(c => c + 1)
          }
        }
      }

      ws.onclose = () => {
        if (cancelled) return
        setConnected(false)
        setConnError(`Reconectando en ${retryDelay/1000}s...`)
        reconnectTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, MAX_RETRY)
          connect()
        }, retryDelay)
      }

      ws.onerror = () => {
        if (cancelled) return
        setConnError('Error de conexión al chat')
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [channel, auth])

  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  function parseChatCommand(text) {
    const meMatch = text.match(/^\/me\s+(.+)/i)
    if (meMatch) {
      return `PRIVMSG #${channel} :\u0001ACTION ${meMatch[1]}\u0001`
    }

    const cmdMatch = text.match(/^\/(\w+)\b\s*(.*)/)
    if (cmdMatch) {
      const cmd = cmdMatch[1].toLowerCase()
      const args = cmdMatch[2]
      const supported = ['ban', 'unban', 'timeout', 'untimeout', 'mods', 'vips',
        'slow', 'slowoff', 'followers', 'followersoff', 'subscribers', 'subscribersoff',
        'emoteonly', 'emoteonlyoff', 'clear', 'host', 'unhost', 'raid', 'unraid',
        'color', 'commercial', 'delete', 'announce', 'shoutout']
      if (supported.includes(cmd)) {
        return `PRIVMSG #${channel} :/${cmd} ${args}`.trimEnd()
      }
      setConnError(`Comando /${cmd} no reconocido`)
      return null
    }

    return `PRIVMSG #${channel} :${text}`
  }

  const sendMessage = (e) => {
    e.preventDefault()
    const text = inputText.trim()
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    if (!auth.token || !auth.username) {
      setConnError('Debes iniciar sesión para enviar mensajes')
      return
    }

    const cmd = parseChatCommand(text)
    if (cmd) {
      setMessages(prev => [...prev, {
        id: ++msgIdCounter,
        user: auth.username,
        color: '#bf94ff',
        message: text,
        emotes: '',
        badges: [],
      }])
      wsRef.current.send(cmd + '\r\n')
      setInputText('')
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  const emoteButton = (e) => {
    const src = e.urls[1] || e.urls[0]
    return (
      <button
        key={e.provider + '-' + e.id}
        type="button"
        onClick={() => {
          setInputText(prev => prev + (prev ? ' ' : '') + e.name + ' ')
          setShowEmoteMenu(false)
          setEmoteSearch('')
          setRecentEmotes(prev => {
            const filtered = prev.filter(r => r.name !== e.name)
            // Solo guardamos name + provider. La URL se reconstruye al
            // renderizar desde el dict `emotes` cargado, que es la
            // fuente de verdad y se rehidrata al cambiar de canal.
            const next = [{ name: e.name, provider: e.provider }, ...filtered].slice(0, 20)
            try { localStorage.setItem('blinkstream_recent_emotes', JSON.stringify(next)) } catch {}
            return next
          })
        }}
        onContextMenu={(ev) => {
          ev.preventDefault()
          setFavoriteEmotes(prev => {
            const isFav = prev.includes(e.name)
            const next = isFav ? prev.filter(f => f !== e.name) : [...prev, e.name]
            localStorage.setItem('blinkstream_fav_emotes', JSON.stringify(next))
            return next
          })
        }}
        className="p-1 rounded-md hover:bg-hover cursor-pointer transition-colors group relative"
        title={e.name}
      >
        <img src={src} alt={e.name} className="w-7 h-7 object-contain" loading="lazy"
          onError={(ev) => { ev.target.style.display = 'none' }} />
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
          {e.name}
        </span>
      </button>
    )
  }

  return (
    <div className="h-full flex flex-col bg-chat">
      <div className="shrink-0 px-3 py-2 bg-bg-secondary/50 backdrop-blur-sm border-b border-bg-tertiary/50 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-xs text-text-secondary font-medium truncate">{channel}</span>

        <div className="flex-1" />

        <div className="relative">
          <button onClick={() => setShowChatSettings(p => !p)} className="p-1 rounded-md text-text-muted/40 hover:text-text-primary hover:bg-hover cursor-pointer transition-colors" title="Ajustes del chat">
            <svg width="14" height="14" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M26.7,12.3c-2.1,0.4-4,0-4.7-1.3c-0.7-1.3-0.2-3.1,1.3-4.7c-1.3-1.3-3-2.2-4.8-2.8C17.8,5.6,16.5,7,15,7s-2.8-1.4-3.5-3.5C9.7,4.1,8.1,5,6.8,6.3c1.5,1.6,2,3.5,1.3,4.7c-0.7,1.3-2.6,1.7-4.7,1.3C3.1,13.1,3,14.1,3,15s0.1,1.9,0.3,2.7c2.1-0.4,4,0,4.7,1.3c0.7,1.3,0.2,3.1-1.3,4.7c1.3,1.3,3,2.2,4.8,2.8c0.7-2.1,2-3.5,3.5-3.5s2.8,1.4,3.5,3.5c1.8-0.5,3.4-1.5,4.8-2.8c-1.5-1.6-2-3.5-1.3-4.7c0.7-1.3,2.6-1.7,4.7-1.3c0.2-0.9,0.3-1.8,0.3-2.7S26.9,13.1,26.7,12.3z"/><circle cx="15" cy="15" r="4"/></svg>
          </button>
          {showChatSettings && (
            <>
              <div className="fixed inset-0 z-[9999]" onClick={() => setShowChatSettings(false)} />
              <div className="absolute right-0 top-full mt-1 w-44 bg-bg-secondary border border-bg-tertiary/60 rounded-xl shadow-2xl z-[10000] p-3 animate-fade-in chat-settings-popup">
                <p className="text-[11px] font-semibold text-text-primary mb-2">Chat</p>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-text-muted">Tamaño</span>
                  <div className="flex gap-1">
                    {[12, 14, 16].map(s => (
                      <button key={s} onClick={() => { setChatFontSize(s); localStorage.setItem('blinkstream_chat_font', String(s)) }}
                        className={`text-[11px] px-1.5 py-0.5 rounded cursor-pointer ${chatFontSize === s ? 'bg-twitch/30 text-twitch' : 'bg-bg-tertiary text-text-muted hover:bg-hover'}`}>
                        {s}px
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-text-muted">Ocultar bots</span>
                  <button onClick={() => { setHideBots(p => { localStorage.setItem('blinkstream_hide_bots', String(!p)); return !p }) }}
                    className={`shrink-0 w-8 h-4 rounded-full transition-colors ${hideBots ? 'bg-twitch' : 'bg-bg-tertiary'}`}>
                    <span className={`block w-3 h-3 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${hideBots ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {auth.token ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-twitch/80 font-medium truncate max-w-[80px]">
              {auth.username || 'Conectado'}
            </span>
            <span className="text-[9px] text-green-400/60">✓</span>
          </div>
        ) : (
          <div className="relative">
            <button
              onClick={() => setShowLoginOptions(p => !p)}
              disabled={authing}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-twitch/20 hover:bg-twitch/40 text-twitch cursor-pointer disabled:opacity-40 transition-colors"
            >
              {authing ? (
                <>
                  <span className="w-2.5 h-2.5 border border-twitch border-t-transparent rounded-full animate-spin" />
                  Conectando…
                </>
              ) : (
                'Iniciar sesión'
              )}
            </button>

            {showLoginOptions && !authing && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-bg-secondary border border-bg-tertiary/60 rounded-xl shadow-2xl z-50 p-3 animate-fade-in" onClick={e => e.stopPropagation()}>
                <p className="text-[11px] font-semibold text-text-primary mb-2">Iniciar sesión en Twitch</p>

                <div className="mb-2">
                  <p className="text-[11px] text-text-muted mb-1.5 leading-relaxed">
                    1. <button onClick={handleOpenTokenSite} className="text-twitch hover:underline cursor-pointer">
                      {copiedUrl ? '✓ URL copiada' : 'Copiar URL del generador'}
                    </button>
                  </p>
                  <p className="text-[9px] text-text-muted/60 mb-1 leading-relaxed">
                    Pega la URL en tu navegador, ingresa tu Client ID y Secret, y obtén tu token:
                  </p>
                  <p className="text-[11px] text-text-muted mb-1.5">
                    2. Pega el token aquí y haz clic en <strong className="text-text-secondary">Conectar</strong>:
                  </p>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={manualToken}
                      onChange={e => setManualToken(e.target.value)}
                      placeholder="Pega tu token aquí..."
                      className="flex-1 px-2 py-1.5 rounded-lg bg-bg-tertiary text-text-primary placeholder-text-muted/40 text-[11px] border border-transparent focus:border-twitch focus:outline-none transition-colors"
                      onKeyDown={e => { if (e.key === 'Enter') handleManualTokenSubmit() }}
                    />
                    <button
                      onClick={handleManualTokenSubmit}
                      disabled={authing || !manualToken.trim()}
                      className="px-2.5 py-1 rounded-lg bg-twitch text-white text-[11px] font-medium cursor-pointer disabled:opacity-30 hover:bg-twitch-dark transition-colors shrink-0"
                    >
                      {authing ? '...' : 'Conectar'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 my-2">
                  <div className="flex-1 h-px bg-bg-tertiary/50" />
                  <span className="text-[9px] text-text-muted/40">o</span>
                  <div className="flex-1 h-px bg-bg-tertiary/50" />
                </div>

                <button
                  onClick={handleDeviceCodeLogin}
                  className="w-full text-[11px] py-1.5 rounded-lg bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-secondary cursor-pointer transition-colors"
                >
                  Iniciar sesión con código de dispositivo
                </button>

                <div className="mt-2">
                  <button
                    onClick={() => setShowAdvanced(p => !p)}
                    className="text-[9px] text-text-muted/50 hover:text-text-muted cursor-pointer transition-colors"
                  >
                    {showAdvanced ? '− Ocultar opciones avanzadas' : '+ Opciones avanzadas'}
                  </button>

                  {showAdvanced && (
                    <div className="mt-1.5 p-2 rounded-lg bg-bg-tertiary/50 border border-bg-tertiary/60">
                      <p className="text-[9px] text-text-muted mb-1 leading-relaxed">
                        Si creaste tu propia app en{' '}
                        <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noopener noreferrer" className="text-twitch hover:underline">dev.twitch.tv</a>
                        {' '}(con redirect URI <code className="text-[8px] bg-bg-secondary px-1 rounded">/functions/v1/twitch-auth</code>),
                        ingresa tu <strong className="text-text-secondary">Client-ID</strong>:
                      </p>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={customClientId}
                          onChange={e => {
                            setCustomClientId(e.target.value)
                            saveCustomClientId(e.target.value)
                          }}
                          placeholder={DEFAULT_CLIENT_ID}
                          className="flex-1 px-2 py-1 rounded-lg bg-bg-secondary text-text-primary placeholder-text-muted/30 text-[9px] border border-bg-tertiary focus:border-twitch focus:outline-none transition-colors"
                        />
                      </div>
                      <p className="text-[8px] text-text-muted/40 mt-1">Se guarda automáticamente. Vacío = usa el Client-ID por defecto.</p>
                    </div>
                  )}
                </div>

                <p className="text-[9px] text-text-muted/40 mt-2 text-center">
                  Token guardado localmente en tu PC
                </p>
              </div>
            )}
          </div>
        )}

        <span className="text-[11px] text-text-muted/40 ml-1">{messages.length}</span>
      </div>

      {authing && authCode && (
        <div className="shrink-0 px-3 py-4 bg-bg-secondary/80 border-b border-twitch/20 text-center animate-fade-in">
          <p className="text-xs font-semibold text-twitch mb-2">Autorizar BlinkStream</p>
          <p className="text-[11px] text-text-muted mb-1">
            1. Abre <strong className="text-text-secondary">twitch.tv/activate</strong> en tu navegador
          </p>
          <p className="text-[11px] text-text-muted/60 mb-2">o abre: <code className="text-[9px] bg-bg-tertiary px-1 rounded select-all">https://www.twitch.tv/activate</code></p>
          <p className="text-[11px] text-text-muted mb-2">
            2. Ingresa este código:
          </p>
          <div className="inline-block px-4 py-2 rounded-lg bg-bg-tertiary border border-twitch/40">
            <span className="text-lg font-bold tracking-[0.25em] text-twitch select-all">{authCode}</span>
          </div>
          <p className="text-[11px] text-text-muted/60 mt-3">3. Autoriza y espera aquí...</p>
        </div>
      )}

      {authError && (
        <div className="shrink-0 px-3 py-2 bg-red-900/20 border-b border-red-500/20 text-center">
          <p className="text-[11px] text-red-400">{authError}</p>
        </div>
      )}

      <div ref={containerRef} className="flex-1 overflow-y-auto px-1 py-0.5" onScroll={handleScroll} role="log" aria-live="polite" aria-label="Mensajes del chat">
        {connError && !connected && (
          <p className="text-orange-400/80 text-xs text-center mt-4">{connError}</p>
        )}
        {messages.length === 0 && !connError && !authing && (
          <p className="text-text-muted/50 text-xs text-center mt-6">
            {connected ? 'Esperando mensajes...' : 'Conectando al chat...'}
          </p>
        )}

        <div className="space-y-0.5">
          {messages
            .filter(msg => !hideBots || !msg.user.toLowerCase().includes('bot'))
            .map(msg => (
              <ChatMessage
                key={msg.id}
                msg={msg}
                badgeUrls={badgeUrls}
                chatFontSize={chatFontSize}
                setUserCard={setUserCard}
                renderMessage={renderMessage}
              />
          ))}
        </div>

        <div ref={bottomRef} />
      </div>

      {newMsgCount > 0 && (
        <button
          onClick={scrollToBottom}
          className="shrink-0 w-full bg-twitch/90 hover:bg-twitch text-white text-[12px] font-semibold py-1.5 cursor-pointer transition-all animate-slide-up shadow-lg shadow-twitch/20"
        >
          ↓ {newMsgCount} nuevo{newMsgCount !== 1 ? 's' : ''}
        </button>
      )}

      <div className="shrink-0">
        {inputText.startsWith('/') && auth.token && (
          <div className="px-2 py-1 bg-bg-tertiary/40 border-t border-bg-tertiary/30 text-[9px] text-text-muted/60 flex flex-wrap gap-x-2 gap-y-0.5 animate-fade-in">
            <span><strong className="text-text-secondary">/me</strong> texto</span>
            <span><strong className="text-text-secondary">/ban</strong> user</span>
            <span><strong className="text-text-secondary">/timeout</strong> user s</span>
            <span><strong className="text-text-secondary">/slow</strong> seg</span>
            <span><strong className="text-text-secondary">/clear</strong></span>
            <span><strong className="text-text-secondary">/mods</strong></span>
            <span><strong className="text-text-secondary">/raid</strong> canal</span>
          </div>
        )}
        <form onSubmit={sendMessage} className="flex gap-1.5 p-2 bg-bg-secondary/50 border-t border-bg-tertiary/50">
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowEmoteMenu(p => !p); setEmoteSearch(''); if (!showEmoteMenu) setEmoteTab('all') }}
              className={`p-1.5 rounded-lg cursor-pointer transition-colors ${showEmoteMenu ? 'bg-twitch/20 text-twitch' : 'text-text-muted hover:text-text-primary hover:bg-hover'}`}
              title="Emotes"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="9" r="0.8" fill="currentColor"/><circle cx="15" cy="9" r="0.8" fill="currentColor"/>
              </svg>
            </button>

            {showEmoteMenu && (
              <div className="absolute bottom-full right-0 mb-1 w-[380px] max-h-[400px] bg-bg-secondary/95 backdrop-blur-md border border-bg-tertiary/60 rounded-2xl shadow-2xl z-50 flex flex-col animate-slide-up overflow-hidden">
                <div className="p-2.5">
                  <div className="relative">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/30 pointer-events-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input
                      type="text"
                      value={emoteSearch}
                      onChange={e => { setEmoteSearch(e.target.value); if (e.target.value) setEmoteTab('all') }}
                      placeholder="Buscar emote..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-bg-tertiary/80 text-text-primary placeholder-text-muted/40 text-[11px] border border-transparent focus:border-twitch/40 focus:ring-2 focus:ring-twitch/10 focus:outline-none transition-all"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-2">
                  {emoteList.length === 0 ? (
                    <p className="text-[11px] text-text-muted/50 text-center py-6">Cargando emotes...</p>
                  ) : (
                    <>
                      {emoteSearch && (
                        <div className="text-[11px] text-text-muted/50 mb-2">
                          {emoteList.filter(e => e.name.toLowerCase().includes(emoteSearch.toLowerCase())).length} resultado{emoteList.filter(e => e.name.toLowerCase().includes(emoteSearch.toLowerCase())).length !== 1 ? 's' : ''}
                        </div>
                      )}
                      <div className="grid gap-1.5 pb-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))' }}>
                        {emoteList
                          .filter(e => emoteSearch ? e.name.toLowerCase().includes(emoteSearch.toLowerCase()) : true)
                          .filter(e => {
                            if (emoteSearch) return true
                            if (emoteTab === 'favs') return favoriteEmotes.includes(e.name)
                            if (emoteTab === 'recent') return recentEmotes.some(re => re.name === e.name)
                            if (emoteTab === 'channel') return e.section === 'channel'
                            if (emoteTab === '7tv') return e.provider === '7tv'
                            if (emoteTab === 'bttv') return e.provider === 'bttv'
                            if (emoteTab === 'ffz') return e.provider === 'ffz'
                            return true
                          })
                          .slice(0, emoteSearch ? 120 : 150)
                          .map(e => {
                            const pColor = e.provider === '7tv' ? '#5f9ea0' : e.provider === 'bttv' ? '#f39c12' : e.provider === 'ffz' ? '#e74c3c' : null
                            return (
                              <div key={e.provider + '-' + e.id} className="relative group flex justify-center">
                                <button type="button"
                                  onClick={() => {
                                    setInputText(prev => prev + (prev ? ' ' : '') + e.name + ' ')
                                    setShowEmoteMenu(false); setEmoteSearch('')
                                    setRecentEmotes(prev => {
                                      const filtered = prev.filter(r => r.name !== e.name)
                                      // Mismo criterio que el botón del picker:
                                      // solo name + provider. URL se reconstruye
                                      // al renderizar desde `emotes`.
                                      const next = [{ name: e.name, provider: e.provider }, ...filtered].slice(0, 20)
                                      try { localStorage.setItem('blinkstream_recent_emotes', JSON.stringify(next)) } catch {}
                                      return next
                                    })
                                  }}
                                  onContextMenu={(ev) => {
                                    ev.preventDefault()
                                    setFavoriteEmotes(prev => {
                                      const isFav = prev.includes(e.name)
                                      const next = isFav ? prev.filter(f => f !== e.name) : [...prev, e.name]
                                      localStorage.setItem('blinkstream_fav_emotes', JSON.stringify(next))
                                      return next
                                    })
                                  }}
                                  className="p-1 rounded-lg hover:bg-hover/60 cursor-pointer transition-all hover:scale-110 active:scale-95 relative">
                                  <img src={e.urls[0]} alt={e.name} className="w-8 h-8 object-contain" loading="lazy"
                                    onError={(ev) => { ev.target.style.display = 'none' }} />
                                  {pColor && (<span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-black/20" style={{ backgroundColor: pColor }} />)}
                                </button>
                                {favoriteEmotes.includes(e.name) && (
                                  <span className="absolute -top-1 -right-1 text-[8px] drop-shadow-md">❤️</span>
                                )}
                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-black/95 text-white text-[9px] px-1.5 py-0.5 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 font-medium">
                                  {e.name}
                                </span>
                              </div>
                            )
                          })}
                      </div>
                    </>
                  )}
                </div>
                {!emoteSearch && (
                  <div className="flex gap-1 px-2 py-2.5 border-t border-bg-tertiary/40 bg-bg-secondary/50">
                    {[
                      { id: 'all', label: 'Todos', count: emoteList.length, svg: <svg width="14" height="14" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M24 26H6c-2.2 0-4-1.8-4-4v-9c0-2.2 1.8-4 4-4h18c2.2 0 4 1.8 4 4v9c0 2.2-1.8 4-4 4z"/><path d="M13.1 4H6C3.8 4 2 5.8 2 8v14c0 2.2 1.8 4 4 4h18c0.5 0 0.9-0.1 1.3-0.2L13.1 4z"/></svg> },
                      { id: 'favs', label: 'Fav', count: favoriteEmotes.filter(f => emoteList.some(e => e.name === f)).length, svg: <svg width="14" height="14" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 8.7l-1.6-1.7c-2.3-2.5-6.2-2.6-8.7-0.2l0 0c-2.2 2.2-2.3 5.7-0.2 8L7 17.3l8 8.7 8-8.7 1-1.1-8.3-8.3L15 8.7z"/><path d="M25.3 6.7l0 0c-2.4-2.4-6.4-2.2-8.7 0.2l-0.9 1 8.3 8.3 1.4-1.5c2.4-2.4 2.3-5.9-0.1-8z"/></svg> },
                      { id: 'recent', label: 'Rec', count: recentEmotes.filter(r => emoteList.some(e => e.name === r.name)).length, svg: <svg width="14" height="14" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="15" cy="15" r="12"/><polyline points="15 7 15 15 21 15"/></svg> },
                      { id: 'channel', label: 'Canal', count: emoteList.filter(e => e.section === 'channel').length, svg: <svg width="14" height="14" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.2 19h-4.4c-0.2 3.8-1.7 7-3.8 9h12c-1.1-2-2.6-5.2-3.8-9z"/><path d="M27 22H3c-1.1 0-2-0.9-2-2V4c0-1.1 0.9-2 2-2h24c1.1 0 2 0.9 2 2v16c0 1.1-0.9 2-2 2z"/><line x1="13" y1="21" x2="17" y2="21"/></svg> },
                      { id: '7tv', label: '7TV', count: emoteList.filter(e => e.provider === '7tv').length, svg: <img src={logo7tv} alt="7TV" className="w-4 h-4 object-contain" /> },
                      { id: 'bttv', label: 'BTTV', count: emoteList.filter(e => e.provider === 'bttv').length, svg: <img src={logoBttv} alt="BTTV" className="w-4 h-4 object-contain" /> },
                      { id: 'ffz', label: 'FFZ', count: emoteList.filter(e => e.provider === 'ffz').length, svg: <img src={logoFfz} alt="FFZ" className="w-4 h-4 object-contain" /> },
                    ].filter(t => t.count > 0 || t.id === 'all' || t.id === 'favs' || t.id === 'recent').map(tab => (
                      <button key={tab.id} onClick={() => setEmoteTab(tab.id)}
                        className={`shrink-0 flex flex-col items-center gap-1 w-11 px-1 py-1.5 rounded-xl cursor-pointer transition-colors ${emoteTab === tab.id ? 'bg-twitch/15 text-white' : 'text-text-muted/40 hover:text-text-primary hover:bg-hover/30'}`}>
                        <span className="flex items-center justify-center w-5 h-5">{tab.svg}</span>
                        <span className="text-[9px] leading-none font-medium">{tab.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              !connected ? 'Sin conexión' :
              !auth.token ? 'Inicia sesión para chatear' :
              'Escribe un mensaje...'
            }
            disabled={!connected || !auth.token}
            maxLength={500}
            className="flex-1 px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary placeholder-text-muted/40 text-sm border border-transparent focus:border-twitch focus:ring-2 focus:ring-twitch/20 focus:outline-none transition-all disabled:opacity-40"
          />
          {inputText.length > 400 && (
            <span className={`absolute right-16 top-1/2 -translate-y-1/2 text-[11px] ${inputText.length >= 500 ? 'text-red-400' : 'text-text-muted/50'}`}>
              {inputText.length}/500
            </span>
          )}
          <button
            type="submit"
            disabled={!connected || !inputText.trim() || !auth.token}
            className="px-4 py-2 rounded-lg bg-twitch text-white text-sm font-semibold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-twitch-dark transition-all shadow-lg shadow-twitch/20 hover:shadow-twitch/30 active:scale-95"
          >
            Enviar
          </button>
        </form>
      </div>

      {userCard && (
        <UserCardPopup
          username={userCard.username}
          position={{ x: userCard.x, y: userCard.y }}
          onClose={() => setUserCard(null)}
        />
      )}
    </div>
  )
}
