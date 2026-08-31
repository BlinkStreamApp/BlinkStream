import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { PUBLIC_CLIENT_ID, sanitizeChannelForGraphQL, getHeaders, banUser, unbanUser, clearChatMessages, updateChatSettings, getUserIdByLogin } from '../utils/twitch'
import PhosphorIcon from './icons/PhosphorIcon'
import { adjustColorContrast } from '../utils/format'

import { MessageContextMenu } from './moderation/MessageContextMenu'
import { useModerationDialogSafe } from './moderation/moderationContextValue'
import { useT } from '../utils/i18n'
import { getItem, setItem, STORAGE_KEYS } from '../utils/storage'
import { safeOpenUrl, isTauri } from '../utils/tauriEnv'
import { invoke } from '@tauri-apps/api/core'
import { TwitchChatPopout } from './chat/TwitchChatPopout'
import { openTwitchChatPopoutWindow } from '../utils/twitchPopout'

async function gqlGetUserIdByLogin(channel) {
  const login = sanitizeChannelForGraphQL(channel)
  if (!login) return null
  try {
    const res = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { 'Client-ID': PUBLIC_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'query($login: String!) { user(login: $login) { id } }',
        variables: { login },
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.data?.user?.id || null
  } catch { return null }
}

import logo7tv from '../assets/7tv.png'
import logoBttv from '../assets/bttv.png'
import logoFfz from '../assets/ffz.png'

const DEFAULT_CLIENT_ID = PUBLIC_CLIENT_ID

function loadCustomClientId() {
  try { return localStorage.getItem('blinkstream_custom_client_id') || '' } catch { return '' }
}
function _saveCustomClientId(id) {
  try { localStorage.setItem('blinkstream_custom_client_id', id || '') } catch {  }
}

const EMOTE_RE = /^[\w-]+$/

function parseMessageTags(tags) {
  const obj = {}
  tags.split(';').forEach(pair => {
    const idx = pair.indexOf('=')
    if (idx === -1) {
      if (pair) obj[pair] = ''
      return
    }
    const k = pair.slice(0, idx)
    let v = pair.slice(idx + 1)
    if (k && v) {
      v = v.replace(/\\s/g, ' ').replace(/\\:/g, ':').replace(/\\;/g, ';').replace(/\\\\/g, '\\').replace(/\\r/g, '').replace(/\\n/g, ' ')
    }
    obj[k] = v || ''
  })
  return obj
}

const URL_REGEX = /((?:https?:\/\/[^\s]+|www\.[^\s]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:tv|com|gg|co|io|net|org|es|me|app|dev|ai|live|pro|fm|store|shop|tech|space|site|online|ws|gs|xyz|club|info|biz|lat|uk|de|fr|br|nl|eu|ca|au|in|pl|tr|sr|st|su|se|no|fi|ch|at|gr|pt|dk|cz|hu|ro|sk|si|hr|bg|lt|lv|ee|ie|is|lu|mt|mc|by|kr|tw|hk|sg|ph|my|id|th|vn|ae|il|za|pr|ec|pe|uy|pa|do|ve|cr|gt|bo|ni|hn|py|sv|bz)(?:\/[^\s]*)?))/gi
function renderTextWithLinks(text, partIdx) {
  if (!text || !text.match(URL_REGEX)) return text
  const parts = []
  let lastIdx = 0
  text.replace(URL_REGEX, (...args) => {
    const match = args[0]
    const offset = args[args.length - 2]
    if (offset > lastIdx) {
      parts.push(text.slice(lastIdx, offset))
    }
    let url = match
    let trailing = ''
    while (url.length > 0 && /[.,)!?;:"']$/.test(url)) {
      trailing = url.slice(-1) + trailing
      url = url.slice(0, -1)
    }
    const href = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`
    parts.push(
      <span
        key={`url-${partIdx}-${offset}`}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          try { safeOpenUrl(href, true) } catch { /* ignore */ }
        }}
        className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 decoration-cyan-500/60 hover:decoration-cyan-300 font-medium cursor-pointer transition-colors break-all inline-flex items-center gap-0.5"
        title={`Abrir enlace en navegador: ${href}`}
      >
        {url}
      </span>
    )
    if (trailing) parts.push(trailing)
    lastIdx = offset + match.length
  })
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx))
  }
  return parts
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

function findBadgeUrl(badgeUrls, set, version) {
  if (!badgeUrls || !set) return null
  if (badgeUrls[`${set}/${version}`]) return badgeUrls[`${set}/${version}`]
  if (badgeUrls[`${set}/0`]) return badgeUrls[`${set}/0`]
  if (badgeUrls[`${set}/1`]) return badgeUrls[`${set}/1`]
  const prefix = `${set}/`
  for (const k of Object.keys(badgeUrls)) {
    if (k.startsWith(prefix)) return badgeUrls[k]
  }
  return null
}

async function fetchBadgesForChannel(channel) {
  const dict = {}

  try {
    const headers = await getHeaders()
    const resGlobal = await fetch('https://api.twitch.tv/helix/chat/badges/global', {
      headers,
      signal: AbortSignal.timeout(5000)
    })
    if (resGlobal.ok) {
      const data = await resGlobal.json()
      if (Array.isArray(data?.data)) {
        for (const set of data.data) {
          const setName = set.set_id
          if (Array.isArray(set.versions)) {
            for (const ver of set.versions) {
              const url = ver.image_url_2x || ver.image_url_1x || ver.image_url_4x
              if (url) dict[`${setName}/${ver.id}`] = url
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Badges] Error en llamada Helix Global:', err)
  }

  if (channel) {
    const ch = channel.toLowerCase()
    try {
      const userId = await gqlGetUserIdByLogin(ch)
      if (userId) {
        const headers = await getHeaders()
        const resChannel = await fetch(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${encodeURIComponent(userId)}`, {
          headers,
          signal: AbortSignal.timeout(5000)
        })
        if (resChannel.ok) {
          const data = await resChannel.json()
          if (Array.isArray(data?.data)) {
            for (const set of data.data) {
              const setName = set.set_id
              if (Array.isArray(set.versions)) {
                for (const ver of set.versions) {
                  const url = ver.image_url_2x || ver.image_url_1x || ver.image_url_4x
                  if (url) dict[`${setName}/${ver.id}`] = url
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Badges] Error en llamada Helix Channel:', err)
    }

    try {
      const gqlRes = await fetch('https://gql.twitch.tv/gql', {
        method: 'POST',
        headers: { 'Client-ID': PUBLIC_CLIENT_ID, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($login: String!) {
            user(login: $login) {
              broadcastBadges { id version imageURL(size: DOUBLE) }
            }
            badges { id version imageURL(size: DOUBLE) }
          }`,
          variables: { login: ch }
        }),
        signal: AbortSignal.timeout(5000)
      })
      if (gqlRes.ok) {
        const gqlData = await gqlRes.json()
        const globalList = gqlData?.data?.badges || []
        const channelList = gqlData?.data?.user?.broadcastBadges || []
        for (const b of globalList) {
          if (b?.id && b?.version && b?.imageURL && !dict[`${b.id}/${b.version}`]) {
            dict[`${b.id}/${b.version}`] = b.imageURL
          }
        }
        for (const b of channelList) {
          if (b?.id && b?.version && b?.imageURL && !dict[`${b.id}/${b.version}`]) {
            dict[`${b.id}/${b.version}`] = b.imageURL
          }
        }
      }
    } catch (err) {
      console.warn('[Badges] Error en llamada GQL Fallback:', err)
    }
  }

  return dict
}

function UserCardPopup({ username, position, onClose }) {
  const [info, setInfo] = useState(null)
  useEffect(() => {
    let c = false
    // FIX WT-20260628-124: eliminamos la doble sanitizacion (antes se
    // llamaba sanitizeChannelForGraphQL dos veces: una para el early-
    // return y otra para el body de la query). Ahora reutilizamos la
    // variable `login` ya validada.
    const login = sanitizeChannelForGraphQL(username)
    if (!login) return
    fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { 'Client-ID': PUBLIC_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'query($login: String!) { user(login: $login) { displayName profileImageURL(width:70) description bio createdAt } }',
        variables: { login },
      }),
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

const ChatMessage = memo(({ msg, badgeUrls, chatFontSize, setUserCard, renderMessage, onContextMenu, isGridMode, onSelectUserForInspection, _isModerator }) => {
  const isSpecial = Boolean(msg.eventType || msg.isNotice || msg.isReward)

  if (isSpecial) {
    const colorStyle = msg.eventColorClass || 'from-purple-950/70 to-slate-900/30 border-purple-500/50 border-l-purple-400 text-purple-300'
    return (
      <div
        className={`flex flex-col gap-1 my-2 mx-1 p-2.5 rounded-xl bg-gradient-to-r border border-l-4 shadow-lg backdrop-blur-sm transition-all group/msg animate-fade-in ${colorStyle}`}
        onContextMenu={onContextMenu ? (e) => onContextMenu(e, msg) : undefined}
      >
        <div className="flex items-center gap-1.5 font-extrabold text-xs tracking-wide">
          <span>{msg.eventHeader || (msg.message && !msg.user ? msg.message : 'Notificación del canal')}</span>
        </div>

        {(msg.message || !msg.isNotice || msg.eventType === 'reward' || msg.eventType === 'bits') && msg.user && msg.user !== 'unknown' && (
          <div className="relative text-sm mt-1 leading-relaxed break-words text-white/95" style={{ fontSize: `${chatFontSize}px` }}>
            {isGridMode && msg.channel && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded mr-1.5 bg-gradient-to-r from-twitch/40 to-fuchsia-600/40 border border-twitch/60 text-fuchsia-200 font-extrabold text-[10px] tracking-tight shadow-sm select-none align-middle uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 animate-pulse" />
                {msg.channel}
              </span>
            )}
            {msg.badges?.length > 0 && (
              <span className="inline-flex items-center gap-0.5 mr-1 align-middle select-none">
                {msg.badges.map((b, i) => {
                  const url = findBadgeUrl(badgeUrls, b.set, b.version)
                  return url ? <img key={i} src={url} alt={b.set} title={`${b.set}`} className="w-4 h-4 object-contain shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" loading="lazy" /> : null
                })}
              </span>
            )}
            <span
              className="font-bold hover:underline cursor-pointer tracking-tight drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] transition-colors inline select-none"
              style={{ color: adjustColorContrast(msg.color || '#adadb8') }}
              onClick={(e) => {
                e.stopPropagation()
                if (onSelectUserForInspection) {
                  onSelectUserForInspection({
                    username: msg.user,
                    displayName: msg.displayName || msg.user,
                    userId: msg.user_id || '',
                    isMod: msg.badges?.some(b => b.set === 'moderator'),
                    isVip: msg.badges?.some(b => b.set === 'vip'),
                    isSub: msg.badges?.some(b => b.set === 'subscriber'),
                  })
                } else {
                  setUserCard(prev => prev?.username === msg.user ? null : { x: e.clientX, y: e.clientY, username: msg.user })
                }
              }}
            >
              {msg.user}
            </span>
            {msg.message && <span className="text-text-muted/50 font-bold ml-0.5 mr-1.5 inline select-none">:</span>}
            {msg.message && (
              <span className="inline font-normal tracking-wide">
                {renderMessage(msg.message, msg.emotes)}
              </span>
            )}
            {msg.timestamp && (
              <span className="absolute top-0 right-0 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur text-[10px] text-white/70 opacity-0 group-hover/msg:opacity-100 tabular-nums font-mono transition-opacity pointer-events-none shadow-sm z-10">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  const containerClass = msg.isMention
    ? "relative px-2.5 py-1.5 my-1 rounded-xl bg-gradient-to-r from-amber-500/20 via-purple-500/10 to-transparent border border-l-4 border-amber-400/80 shadow-md shadow-amber-500/10 transition-all group/msg animate-fade-in text-sm leading-relaxed break-words text-white/95 font-medium"
    : "relative px-2.5 py-1 my-0.5 rounded-xl hover:bg-white/[0.04] border border-transparent hover:border-white/[0.05] transition-all group/msg animate-fade-in text-sm leading-relaxed break-words text-white/95"

  return (
    <div
      className={containerClass}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, msg) : undefined}
      style={{ fontSize: `${chatFontSize}px` }}
    >
      {isGridMode && msg.channel && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded mr-1.5 bg-gradient-to-r from-twitch/40 to-fuchsia-600/40 border border-twitch/60 text-fuchsia-200 font-extrabold text-[10px] tracking-tight shadow-sm select-none align-middle uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 animate-pulse" />
          {msg.channel}
        </span>
      )}
      {msg.badges.length > 0 && (
        <span className="inline-flex items-center gap-0.5 mr-1 align-middle select-none">
          {msg.badges.map((b, i) => {
            const url = findBadgeUrl(badgeUrls, b.set, b.version)
            return url ? <img key={i} src={url} alt={b.set} title={`${b.set}`} className="w-4 h-4 object-contain shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" loading="lazy" /> : null
          })}
        </span>
      )}
      <span
        className="font-bold hover:underline cursor-pointer tracking-tight drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] transition-colors inline select-none"
        style={{ color: adjustColorContrast(msg.color || '#adadb8') }}
        onClick={(e) => {
          e.stopPropagation()
          if (!msg.isNotice) setUserCard(prev => prev?.username === msg.user ? null : { x: e.clientX, y: e.clientY, username: msg.user })
        }}
      >
        {msg.user}
      </span>
      <span className="text-text-muted/50 font-bold ml-0.5 mr-1.5 inline select-none">:</span>
      <span className="inline font-normal tracking-wide">
        {renderMessage(msg.message, msg.emotes)}
        {msg.spamCount > 1 && (
          <span className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded-full text-[11px] font-extrabold bg-twitch/20 border border-twitch/60 text-fuchsia-300 shadow-sm shadow-twitch/30 tabular-nums animate-pulse align-middle">
            x{msg.spamCount}
          </span>
        )}
      </span>
      {msg.timestamp && (
        <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur text-[10px] text-white/70 opacity-0 group-hover/msg:opacity-100 tabular-nums font-mono transition-opacity pointer-events-none shadow-sm z-10">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  )
})

export default function Chat({
  channel,
  isLoggedIn,
  twitchToken,
  twitchUsername,
  broadcasterId,
  userId,
  onOpenCPPanel,
  isModerator = false,
  isMod = false,
  isBroadcaster = false,
  isVip = false,
  viewerLogin,
  onLoginWithToken,
  isGridMode,
  isOverlay,
  onCloseOverlay,
  onSelectUserForInspection,
  onMessagesUpdate,
}) {
  const t = useT()
  const [messages, setMessages] = useState([])

  useEffect(() => {
    onMessagesUpdate?.(messages)
  }, [messages, onMessagesUpdate])
  const [useTwitchPopout, setUseTwitchPopout] = useState(() => {
    try {
      return localStorage.getItem('bs.chat.use_twitch_popout') === 'true'
    } catch {
      return false
    }
  })

  const [antiSpam, setAntiSpam] = useState(() => {
    return getItem(STORAGE_KEYS.ANTISPAM, 'false') === 'true'
  })
  const antiSpamRef = useRef(getItem(STORAGE_KEYS.ANTISPAM, 'false') === 'true')
  const [emotes, setEmotes] = useState({})
  const [badgeUrls, setBadgeUrls] = useState({})
  const [connected, setConnected] = useState(false)
  const [connError, setConnError] = useState('')
  const [inputText, setInputText] = useState('')
  const [newMsgCount, setNewMsgCount] = useState(0)
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'mentions' | 'featured'
  const [unreadMentions, setUnreadMentions] = useState(0)
  const activeTabRef = useRef('all')
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  // WT-20260628-56: estado del menu contextual de moderacion.
  // Guarda coordenadas + el mensaje target para que
  // MessageContextMenu pueda renderizarse y resolver el usuario
  // al hacer click en un item. Se cierra al hacer click fuera
  // (lo maneja el propio componente) o al elegir una accion.
  const [contextMenu, setContextMenu] = useState(null)
  // contextMenu = { x, y, target: msg }
  // WT-20260628-56: hook del Provider de moderacion. Usamos
  // openAction para abrir el ActionModal y executeAction para
  // las acciones inline (whisper, copy, delete). Usamos la
  // variante `Safe` que devuelve null si no hay Provider; asi
  // Chat puede montarse en tests aislados sin crashear.
  const moderationDialog = useModerationDialogSafe()

  // Auth deriva directamente de las props que llegan del padre (App.jsx → keychain).
  // Antes leíamos localStorage aquí, pero eso estaba ROTO: cuando keychain funciona
  // el token NO está en localStorage, loadAuth() retornaba null y la sesión se perdía.
  const auth = useMemo(() => {
    if (isLoggedIn && twitchToken && twitchUsername) {
      return { token: twitchToken, username: twitchUsername }
    }
    return { token: null, username: null }
  }, [isLoggedIn, twitchToken, twitchUsername])

  // WT-20260628-56: handler de click derecho sobre un mensaje.
  // Mapea el msg del state al `target` que espera MessageContextMenu
  // y guarda las coordenadas del cursor para posicionar el menu.
  // Solo abrimos el menu si el viewer es mod/broadcaster; para
  // viewers normales el click derecho sigue el comportamiento
  // nativo del browser (nada que hacer).
  const handleContextMenu = useCallback((e, msg) => {
    if (!isModerator) return
    e.preventDefault()
    e.stopPropagation()
    if (msg.isNotice) return // no hay acciones sobre notices
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target: {
        user_id: msg.user_id || '',
        user_login: msg.user_login || msg.user?.toLowerCase() || '',
        user_name: msg.user_name || msg.user || '',
        message_id: msg.message_id || '',
      },
    })
  }, [isModerator])

  // WT-20260628-56: handler de accion desde MessageContextMenu.
  // Despacha:
  //   - 'whisper' | 'copy' | 'delete' | 'profile' -> executeAction (inline)
  //   - 'ban' | 'unban' | 'timeout' | 'untimeout' -> openAction (modal)
  //   - 'mod' | 'unmod' | 'vip' | 'unvip' -> openAction (modal;
  //     el Provider los redirige a prefill del input en chat)
  // En cualquier caso cerramos el menu contextual.
  const handleContextAction = useCallback((action, target) => {
    if (!moderationDialog) return
    if (action === 'whisper' || action === 'copy' || action === 'delete' || action === 'profile') {
      moderationDialog.executeAction(action, target)
    } else {
      moderationDialog.openAction(action, target)
    }
    setContextMenu(null)
  }, [moderationDialog])

  // WT-20260628-56: ref al input principal del chat. Lo usamos para
  // hacer focus cuando llega un evento `bs:chat:prefill` (comando
  // pre-llenado desde el menu contextual de mod). Asi el usuario
  // solo tiene que pulsar Enter para enviar.
  const inputRef = useRef(null)

  // WT-20260628-56: escucha el evento `bs:chat:prefill` que dispara
  // ModerationContext.openAction cuando el viewer elige un comando
  // de promocion (mod/unmod/vip/unvip). Pre-llena el input, hace
  // focus y mueve el cursor al final. Se desuscribe en cleanup.
  useEffect(() => {
    const onPrefill = (e) => {
      const text = e?.detail?.text
      if (typeof text !== 'string') return
      setInputText(text)
      // Espera un tick para que React haya aplicado el value antes
      // de mover el cursor y enfocar.
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          const len = text.length
          try { inputRef.current.setSelectionRange(len, len) } catch { /* algunos tipos de input no lo soportan */ }
        }
      }, 0)
    }
    window.addEventListener('bs:chat:prefill', onPrefill)
    return () => window.removeEventListener('bs:chat:prefill', onPrefill)
  }, [])

  const [authing, setAuthing] = useState(false)
  const [authCode, setAuthCode] = useState('')
  const [authError, setAuthError] = useState('')
  const [showLoginOptions, setShowLoginOptions] = useState(false)
  const [customClientId, _setCustomClientId] = useState(loadCustomClientId)
  const [_showAdvanced, _setShowAdvanced] = useState(false)
  const [showEmoteMenu, setShowEmoteMenu] = useState(false)
  const [emoteSearch, setEmoteSearch] = useState('')
  const [emoteTab, setEmoteTab] = useState('all')
  const [hoveredEmote, setHoveredEmote] = useState(null)
  const [chatFontSize, _setChatFontSize] = useState(() => Number(localStorage.getItem('blinkstream_chat_font') || 14))
  const [hideBots, _setHideBots] = useState(() => localStorage.getItem('blinkstream_hide_bots') === 'true')
  // WT-20260628-48: ocultar mensajes del chat (placeholder cuando true).
  // WT-20260628-49: el toggle que lo modificaba vivia en el gear+popover
  // retirado de la barra de input; el state se conserva para que el
  // render condicional siga funcionando si la preferencia localStorage
  // estaba activa. El control de UI vive ahora en el topbar global.
  // El setter queda como `_setChatHidden` (prefijo _) por convencion del
  // archivo (ver `_setChatFontSize` arriba) — actualmente no hay UI que
  // lo invoque, pero lo mantenemos para restauracion futura.
  const [chatHidden, _setChatHidden] = useState(() => localStorage.getItem('blinkstream_chat_hidden') === 'true')

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
  const userBadgesRef = useRef([])
  const userColorRef = useRef(null)
  const userDisplayNameRef = useRef('')

  useEffect(() => {
    userBadgesRef.current = []
    userColorRef.current = null
    userDisplayNameRef.current = auth.username || ''
  }, [auth.username, channel])

  const getUserBadgesForSend = useCallback(() => {
    const list = [...(userBadgesRef.current || [])]
    const chLower = (channel || '').toLowerCase()
    const userLower = (auth?.username || '').toLowerCase()

    if (isBroadcaster || (userLower && chLower === userLower)) {
      if (!list.some(b => b.set === 'broadcaster')) {
        list.unshift({ set: 'broadcaster', version: '1' })
      }
    } else if (isModerator || isMod) {
      if (!list.some(b => b.set === 'moderator')) {
        list.unshift({ set: 'moderator', version: '1' })
      }
    } else if (isVip) {
      if (!list.some(b => b.set === 'vip')) {
        list.unshift({ set: 'vip', version: '1' })
      }
    }
    return list
  }, [channel, auth.username, isBroadcaster, isModerator, isMod, isVip])

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
    const isOnlyEmotes = parts.every(p => p.type !== 'text' || p.text.trim() === '') && parts.filter(p => p.type !== 'text').length >= 1 && parts.filter(p => p.type !== 'text').length <= 5
    return parts.map((part, idx) => {
      if (part.type === 'text') return renderTextWithLinks(part.text, idx)
      const hideOnError = (e) => { e.target.style.display = 'none' }
      const emoteClass = isOnlyEmotes
        ? "inline-block w-9 h-9 sm:w-10 sm:h-10 align-middle mx-1 my-0.5 hover:scale-125 transition-transform duration-150 drop-shadow-md cursor-pointer select-none"
        : "inline-block w-6 h-6 align-middle mx-0.5 -mt-0.5 hover:scale-125 transition-transform duration-150 cursor-pointer select-none"
      if (part.type === 'twitch-emote') {
        return (
          <img key={idx} src={`https://static-cdn.jtvnw.net/emoticons/v2/${part.id}/default/dark/2.0`} alt={part.text} title={part.text} className={emoteClass} loading="lazy" onError={hideOnError} />
        )
      }
      return (
        <img key={idx} src={part.urls?.[2] || part.urls?.[1] || part.urls?.[0]} alt={part.name} title={part.name} className={emoteClass} loading="lazy" onError={hideOnError} />
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
        const isHelix = url.includes('api.twitch.tv/helix')
        const headers = isHelix ? await getHeaders() : undefined
        const res = await fetch(url, { headers, signal: ac.signal })
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
          const twitchId = await gqlGetUserIdByLogin(ch)
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
          const userId = await gqlGetUserIdByLogin(ch)
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
    if (!channel) return
    let cancelled = false
    fetchBadgesForChannel(channel).then(dict => {
      if (!cancelled && dict && Object.keys(dict).length > 0) {
        setBadgeUrls(prev => ({ ...prev, ...dict }))
      }
    })
    return () => { cancelled = true }
  }, [channel])

  const getClientId = useCallback(() => customClientId || DEFAULT_CLIENT_ID, [customClientId])

  const handleDeviceCodeLogin = useCallback(async () => {
    setAuthing(true)
    setAuthCode('')
    setAuthError('')
    setShowLoginOptions(false)
    try {
      const clientId = getClientId()
      // FIX 3 (Hank / P1): el Client-ID NO es PII del usuario, pero
      // en builds web de produccion se filtra a DevTools / consoles de
      // terceros. CWE-532. Gateamos a DEV.
      if (import.meta.env.DEV) {
        console.log('[Auth] Solicitando device code con Client-ID:', clientId)
      }

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

      // FIX 3 (Hank / P1): user_code es PII (codigo de un solo uso
      // enlazado a la sesion del usuario, equivalente a un OTP). Si
      // XSS o captura de pantalla, un atacante podria completar el
      // pairing OAuth. CWE-532. Gateamos a DEV.
      if (import.meta.env.DEV) {
        console.log('[Auth] Device code obtenido. Código:', user_code)
      }

      setAuthCode(user_code)

      let pollInterval = interval * 1000
      let attempts = 0
      const MAX_ATTEMPTS = 60

      while (attempts < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, pollInterval))
        attempts++

        // WT-20260628-27 / FIX 3: usamos `Origin: null` como header
        // explicito para que el browser NO fuerce una preflight CORS
        // (Twitch no declara ACAO para este endpoint, y un OPTIONS
        // previo fallaria con un error opaco que confunde al usuario).
        // `Origin: null` es la unica forma de hacer un request "no-CORS"
        // desde un fetch() explicito. Si el browser aun asi bloquea,
        // `fetch` rechaza con TypeError y lo capturamos abajo.
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'null',
          },
          body: new URLSearchParams({
            client_id: clientId,
            device_code,
            grant_type: 'urn:ietf:params:oauth:grant_type:device_code',
          }),
        })

        // FIX 3: validar `ok` ANTES de parsear. Si 4xx/5xx, devolvemos
        // un error user-friendly sin loggear el body (que puede traer
        // tokens parciales, device_code, o scopes del OAuth — CWE-532).
        // El P0 de Hank ya cubre el log del body sensible; aqui
        // añadimos la red de seguridad del lado del flujo.
        if (!tokenRes.ok) {
          const status = tokenRes.status
          // FIX 3: NO leemos el body en este branch. Ya lo descartamos
          // (no hay `.text()` ni `.json()` aqui). Asi evitamos que un
          // 4xx con cuerpo `{ "error": "invalid_client", "device_code":
          // "XYZ" }` se filtre al log.
          if (status === 0) {
            // fetch rechazo antes de obtener respuesta (red, CORS, o
            // preflight OPTIONS fallido). El TypeError normalmente se
            // propaga al catch externo, pero este branch existe por si
            // el runner de tests inyecta un Response con status 0.
            throw new Error('No se pudo contactar el servidor de Twitch. Revisa tu conexión.')
          }
          console.warn('[Auth] Device poll HTTP error (status):', status)
          throw new Error(
            status >= 500
              ? 'El servidor de Twitch tuvo un problema. Intenta de nuevo en unos minutos.'
              : `Error de autenticación (${status}). Usa "Token manual" como alternativa.`
          )
        }

        const status = tokenRes.status
        const tokenData = await tokenRes.json().catch(() => ({}))

        if (tokenData.access_token) {
          const cleanToken = tokenData.access_token
          if (onLoginWithToken) await onLoginWithToken(cleanToken)
          setAuthing(false)
          setAuthCode('')
          return
        }

        if (tokenData.error === 'authorization_pending') continue
        if (tokenData.error === 'slow_down') { pollInterval += 5000; continue }
        if (tokenData.error === 'expired_token') {
          throw new Error('El código expiró. Intenta de nuevo.')
        }

        // FIX-1 (Hank / P0): tokenData puede contener campos sensibles del OAuth
        // de Twitch; loggear SOLO error + message + status (CWE-532 insertion of sensitive
        // information into log file).
        console.warn('[Auth] Device poll error:', tokenData?.error || tokenData?.message || 'unknown', '(status: ' + status + ')')
        throw new Error(tokenData.message || 'Error durante la autenticación')
      }

      throw new Error('Tiempo de espera agotado. Intenta de nuevo.')
    } catch (err) {
      console.warn('[Auth] Device auth error:', err)
      setAuthError(err.message)
      setAuthing(false)
      setAuthCode('')
    }
  }, [getClientId, onLoginWithToken])

  useEffect(() => {
    if (!channel) return
    let cancelled = false
    let retryDelay = 1000
    const MAX_RETRY = 30000
    let reconnectTimer = null
    // Reset legítimo de error al (re)conectar a un canal: NO es cascading
    // render en la práctica (se ejecuta una vez por cambio de canal) y el
    // efecto siguiente ya depende de `channel`/`connError` vía el closure.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnError('')
    setMessages([])
    lineBufferRef.current = ''

    // Búfer por lotes (Batching Buffer) para evitar tormentas de re-renders
    const msgBatch = []
    const batchInterval = setInterval(() => {
      if (msgBatch.length > 0) {
        const toFlush = msgBatch.slice()
        msgBatch.length = 0

        const myUsername = (auth?.username || viewerLogin || '').toLowerCase()
        let addedMentions = 0

        for (const msg of toFlush) {
          if (myUsername && msg.user_login !== myUsername && msg.message) {
            const lowerMsg = msg.message.toLowerCase()
            if (lowerMsg.includes(`@${myUsername}`) || lowerMsg.split(/\s+/).includes(myUsername)) {
              msg.isMention = true
              if (activeTabRef.current !== 'mentions') {
                addedMentions++
              }
            }
          }

          if (msg.message && !isOverlay && !isGridMode) {
            const parts = matchEmotesInText(msg.message, msg.emotes, trieRef.current)
            for (const p of parts) {
              if (p.type === 'twitch-emote') {
                window.dispatchEvent(new CustomEvent('blinkstream:emote', { detail: { url: `https://static-cdn.jtvnw.net/emoticons/v2/${p.id}/default/dark/2.0`, name: p.text } }))
                break
              } else if (p.type === 'third-party-emote' && p.urls?.length) {
                const url = p.urls[2] || p.urls[1] || p.urls[0]
                window.dispatchEvent(new CustomEvent('blinkstream:emote', { detail: { url, name: p.name } }))
                break
              }
            }
          }
        }

        if (addedMentions > 0) {
          setUnreadMentions(c => c + addedMentions)
        }

        setMessages(prev => {
          let updated = [...prev]
          if (antiSpamRef.current && toFlush.length > 0) {
            for (const msg of toFlush) {
              const last = updated[updated.length - 1]
              if (
                last &&
                last.message &&
                msg.message &&
                last.message.trim().toLowerCase() === msg.message.trim().toLowerCase() &&
                !last.isNotice && !last.eventType && !last.isReward &&
                !msg.isNotice && !msg.eventType && !msg.isReward
              ) {
                updated[updated.length - 1] = {
                  ...last,
                  spamCount: (last.spamCount || 1) + (msg.spamCount || 1),
                  timestamp: msg.timestamp || last.timestamp,
                }
              } else {
                updated.push(msg)
              }
            }
          } else {
            updated = [...prev, ...toFlush]
          }
          return updated.length > 500 ? updated.slice(-500) : updated
        })
        if (!isAtBottomRef.current) {
          setNewMsgCount(c => c + toFlush.length)
        }
      }
    }, 200)

    const connect = () => {
      if (cancelled) return
      const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
      wsRef.current = ws

      ws.onopen = () => {
        if (cancelled) { ws.close(); return }
        retryDelay = 1000
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands')

        if (auth.token && auth.username) {
          const cleanToken = auth.token.replace(/^oauth:/i, '')
          ws.send(`PASS oauth:${cleanToken}`)
          ws.send(`NICK ${auth.username.toLowerCase()}`)
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
          const userstateIdx = parts.indexOf('USERSTATE')
          const globaluserstateIdx = parts.indexOf('GLOBALUSERSTATE')

          if (userstateIdx !== -1 || globaluserstateIdx !== -1) {
            const parsed = parseMessageTags(tags)
            if (parsed.badges) {
              const badgeList = parsed.badges.split(',').map(b => {
                const [set, version] = b.split('/')
                return { set, version }
              })
              userBadgesRef.current = badgeList
            } else if (parsed.badges === '') {
              userBadgesRef.current = []
            }
            if (parsed.color) {
              userColorRef.current = parsed.color
            }
            if (parsed['display-name']) {
              userDisplayNameRef.current = parsed['display-name']
            }

            // Real-time role detection from IRC USERSTATE
            const badges = userBadgesRef.current || []
            const isIrcBroadcaster = badges.some(b => b.set === 'broadcaster') || (auth.username && channel && auth.username.toLowerCase() === channel.toLowerCase())
            const isIrcMod = parsed.mod === '1' || parsed['user-type'] === 'mod' || badges.some(b => b.set === 'moderator')
            const isIrcVip = badges.some(b => b.set === 'vip')

            const detectedRole = isIrcBroadcaster ? 'broadcaster' : isIrcMod ? 'mod' : isIrcVip ? 'vip' : 'viewer'
            if (typeof window !== 'undefined' && channel) {
              window.dispatchEvent(new CustomEvent('bs:user-role-detected', {
                detail: {
                  channel: channel.toLowerCase(),
                  role: detectedRole,
                  isModerator: isIrcMod || isIrcBroadcaster,
                  isBroadcaster: isIrcBroadcaster,
                  isVip: isIrcVip,
                }
              }))
            }
            continue
          }

          if (usernoticeIdx !== -1) {
              const parsed = parseMessageTags(tags)
              const badgeList = parsed.badges
                ? parsed.badges.split(',').map(b => {
                    const [set, version] = b.split('/')
                    return { set, version }
                  })
                : []
              const msgId = parsed['msg-id'] || ''
              const displayName = parsed['display-name'] || parts[0]?.split('!')[0]?.replace(':', '') || 'unknown'
              const sysMsg = parsed['system-msg'] || ''
              const channelIdx = parts.findIndex(p => p.startsWith('#'))
              const msgParts = channelIdx >= 0 ? parts.slice(channelIdx + 1) : parts.slice(3)
              const userMsg = msgParts.join(' ').replace(/^:/, '').trim()

              const subPlan = parsed['msg-param-sub-plan'] || '1000'
              const tier = subPlan === '2000' ? 'T2' : subPlan === '3000' ? 'T3' : 'T1'
              const months = parsed['msg-param-cumulative-months'] || parsed['msg-param-streak-months'] || '1'
              const recipient = parsed['msg-param-recipient-display-name'] || parsed['msg-param-recipient-user-name'] || ''
              const giftCount = parsed['msg-param-mass-gift-count'] || ''
              const raiderCount = parsed['msg-param-viewerCount'] || ''
              const streakVal = parsed['msg-param-value'] || ''

              let eventType
              let eventHeader
              let eventColorClass

              if (msgId === 'sub') {
                eventType = 'sub'
                eventHeader = `⭐ ${sysMsg || `${displayName} se ha suscrito (${tier})`}`
                eventColorClass = 'from-emerald-950/80 to-teal-950/40 border-emerald-500/60 border-l-emerald-400 text-emerald-300 shadow-emerald-950/50'
              } else if (msgId === 'resub') {
                eventType = 'resub'
                eventHeader = `🌟 ${sysMsg || `${displayName} se ha suscrito (${tier}) ×${months} meses`}`
                eventColorClass = 'from-emerald-950/80 to-emerald-950/40 border-emerald-500/60 border-l-emerald-400 text-emerald-300 shadow-emerald-950/50'
              } else if (msgId === 'subgift') {
                eventType = 'subgift'
                eventHeader = `🎁 ${sysMsg || `${displayName} ha regalado una sub (${tier}) a ${recipient}`}`
                eventColorClass = 'from-pink-950/80 to-purple-950/40 border-pink-500/60 border-l-pink-400 text-pink-300 shadow-pink-950/50'
              } else if (msgId === 'submysterygift') {
                eventType = 'submysterygift'
                eventHeader = `🎉 ${sysMsg || `${displayName} ha regalado ${giftCount} subs`}`
                eventColorClass = 'from-pink-950/80 to-fuchsia-950/40 border-pink-500/60 border-l-fuchsia-400 text-pink-300 shadow-pink-950/50'
              } else if (msgId === 'raid') {
                eventType = 'raid'
                eventHeader = `🔴 ${sysMsg || `RAID: ${displayName} ha traído ${raiderCount} viewers`}`
                eventColorClass = 'from-rose-950/80 to-red-950/40 border-rose-500/60 border-l-rose-500 text-rose-300 shadow-red-950/50'
              } else if (msgId === 'viewermilestone') {
                eventType = 'streak'
                eventHeader = `🔥 ${sysMsg || `Racha de espectador: ${displayName} ha visto ${streakVal} streams seguidos`}` // ALLOWED-REGRESSION: español
                eventColorClass = 'from-amber-950/80 via-orange-950/60 to-neutral-900/40 border-amber-500/60 border-l-amber-400 text-amber-300 shadow-orange-950/40'
              } else if (msgId === 'announcement') {
                eventType = 'announcement'
                eventHeader = `📢 ANUNCIO: ${sysMsg || displayName}`
                eventColorClass = 'from-blue-950/80 to-indigo-950/40 border-blue-500/60 border-l-cyan-400 text-cyan-300 shadow-blue-950/50'
              } else if (msgId === 'ritual') {
                eventType = 'ritual'
                eventHeader = `👋 ${sysMsg || `${displayName} está en el chat por primera vez`}`
                eventColorClass = 'from-indigo-950/80 to-purple-950/40 border-indigo-500/60 border-l-indigo-400 text-indigo-300 shadow-indigo-950/50'
              } else {
                eventType = 'notice'
                eventHeader = `📢 ${sysMsg || `${displayName}: evento del canal`}`
                eventColorClass = 'from-purple-950/80 to-slate-900/40 border-purple-500/60 border-l-purple-400 text-purple-300 shadow-purple-950/50'
              }

            msgBatch.push({
              id: ++msgIdCounter,
              channel,
              user: displayName,
              user_id: parsed['user-id'] || '',
              user_login: displayName.toLowerCase(),
              user_name: displayName,
              message_id: parsed['id'] || '',
              color: parsed['color'] || '#b19cd9',
              message: userMsg || '',
              emotes: parsed['emotes'] || '',
              badges: badgeList,
              isNotice: true,
              eventType,
              eventHeader,
              eventColorClass,
              timestamp: Date.now(),
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
          const userId = parsed['user-id'] || ''
          const messageId = parsed['id'] || parsed['msg-id'] || ''

          let isReward = false
          let eventType = null
          let eventHeader = null
          let eventColorClass = null

          if (parsed['custom-reward-id']) {
            isReward = true
            eventType = 'reward'
            const rewardTitle = parsed['custom-reward-title'] || 'Canje de Puntos de Canal'
            eventHeader = `🎁 Canje de Recompensa: ${rewardTitle}`
            eventColorClass = 'from-purple-950/80 via-fuchsia-950/60 to-purple-900/40 border-purple-500/60 border-l-fuchsia-400 text-fuchsia-300 shadow-purple-950/50'
          } else if (parsed['bits'] && parseInt(parsed['bits'], 10) > 0) {
            eventType = 'bits'
            const bitsVal = parsed['bits']
            eventHeader = `💎 Donación de ${bitsVal} Bits` // ALLOWED-REGRESSION: español
            eventColorClass = 'from-cyan-950/80 via-sky-950/60 to-blue-900/40 border-cyan-500/60 border-l-cyan-400 text-cyan-300 shadow-cyan-950/50'
          }

          msgBatch.push({
            id: ++msgIdCounter,
            channel,
            user: userRaw,
            user_id: userId,
            user_login: userRaw.toLowerCase(),
            user_name: parsed['display-name'] || userRaw,
            message_id: messageId,
            color: parsed['color'] || null,
            message,
            emotes: parsed['emotes'] || '',
            badges: badgeList,
            isReward,
            eventType,
            eventHeader,
            eventColorClass,
            timestamp: Date.now(),
          })
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
      if (batchInterval) clearInterval(batchInterval)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [channel, auth, isGridMode, isOverlay, viewerLogin])

  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleSlashCommand = useCallback(async (text) => {
    const meMatch = text.match(/^\/me\s+(.+)/i)
    if (meMatch) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(`PRIVMSG #${channel} :\u0001ACTION ${meMatch[1]}\u0001\r\n`)
      }
      const myBadges = getUserBadgesForSend()
      const myColor = userColorRef.current || '#bf94ff'
      const myDisplayName = userDisplayNameRef.current || auth.username

      setMessages(prev => [...prev, {
        id: ++msgIdCounter,
        channel,
        user: myDisplayName,
        color: myColor,
        message: meMatch[1],
        emotes: '',
        badges: myBadges,
        timestamp: Date.now(),
      }])
      setInputText('')
      return
    }

    const cmdMatch = text.match(/^\/(\w+)\b\s*(.*)/)
    if (!cmdMatch) return

    const cmd = cmdMatch[1].toLowerCase()
    const args = cmdMatch[2].trim()
    const modId = userId || auth.userId

    if (cmd === 'clear') {
      if (!isModerator && !isBroadcaster) {
        setConnError('No tienes permisos de moderador para vaciar el chat.')
        return
      }
      setInputText('')
      const r = await clearChatMessages(broadcasterId, modId)
      if (r.success) {
        setMessages([{
          id: ++msgIdCounter,
          channel,
          user: 'BlinkStream',
          isNotice: true,
          eventHeader: '🧹 El chat ha sido vaciado (/clear)',
          eventColorClass: 'from-cyan-950/80 to-blue-900/40 border-cyan-500/60 text-cyan-300',
        }])
      } else {
        setConnError(r.error?.message || 'Error al vaciar el chat.')
      }
      return
    }

    if (['slow', 'slowoff', 'emoteonly', 'emoteonlyoff', 'subscribers', 'subscribersoff', 'followers', 'followersoff', 'uniquechat', 'uniquechatoff'].includes(cmd)) {
      if (!isModerator && !isBroadcaster) {
        setConnError('No tienes permisos para modificar los ajustes del chat.')
        return
      }
      setInputText('')
      const settings = {}
      let desc = ''
      if (cmd === 'slow') {
        const s = Math.max(3, Math.min(120, Number(args) || 30))
        settings.slow_mode = true
        settings.slow_mode_wait_time = s
        desc = `Modo lento activado (${s}s)`
      } else if (cmd === 'slowoff') {
        settings.slow_mode = false
        desc = 'Modo lento desactivado'
      } else if (cmd === 'emoteonly') {
        settings.emote_mode = true
        desc = 'Modo solo emotes activado'
      } else if (cmd === 'emoteonlyoff') {
        settings.emote_mode = false
        desc = 'Modo solo emotes desactivado'
      } else if (cmd === 'subscribers') {
        settings.subscriber_mode = true
        desc = 'Modo solo suscriptores activado'
      } else if (cmd === 'subscribersoff') {
        settings.subscriber_mode = false
        desc = 'Modo solo suscriptores desactivado'
      } else if (cmd === 'followers') {
        const m = Math.max(0, Math.min(129600, Number(args) || 0))
        settings.follower_mode = true
        settings.follower_mode_duration = m
        desc = `Modo solo seguidores activado (${m}m)`
      } else if (cmd === 'followersoff') {
        settings.follower_mode = false
        desc = 'Modo solo seguidores desactivado'
      } else if (cmd === 'uniquechat') {
        settings.unique_chat_mode = true
        desc = 'Modo chat único activado'
      } else if (cmd === 'uniquechatoff') {
        settings.unique_chat_mode = false
        desc = 'Modo chat único desactivado'
      }

      const r = await updateChatSettings(broadcasterId, modId, settings)
      if (r.success) {
        setMessages(prev => [...prev, {
          id: ++msgIdCounter,
          channel,
          user: 'BlinkStream',
          isNotice: true,
          eventHeader: `⚙️ ${desc}`,
          eventColorClass: 'from-purple-950/80 to-indigo-900/40 border-purple-500/60 text-purple-300',
        }])
      } else {
        setConnError(r.error?.message || 'Error al actualizar ajustes del chat.')
      }
      return
    }

    if (cmd === 'ban' || cmd === 'timeout' || cmd === 'unban' || cmd === 'untimeout') {
      if (!isModerator && !isBroadcaster) {
        setConnError('No tienes permisos de moderador.')
        return
      }
      setInputText('')
      const parts = args.split(/\s+/)
      const targetName = parts[0]?.replace(/^@/, '')
      if (!targetName) {
        setConnError(`Uso: /${cmd} <usuario> [tiempo] [motivo]`)
        return
      }

      const targetId = await getUserIdByLogin(targetName)
      if (!targetId) {
        setConnError(`No se encontró el usuario @${targetName}`)
        return
      }

      if (cmd === 'ban') {
        const reason = parts.slice(1).join(' ') || undefined
        const r = await banUser(broadcasterId, modId, targetId, reason)
        if (r.success) {
          setMessages(prev => [...prev, {
            id: ++msgIdCounter,
            channel,
            user: 'BlinkStream',
            isNotice: true,
            eventHeader: `🚫 @${targetName} ha sido baneado permanentemente.`,
            eventColorClass: 'from-red-950/80 to-rose-900/40 border-red-500/60 text-red-300',
          }])
        } else {
          setConnError(r.error?.message || `Error al banear a @${targetName}`)
        }
      } else if (cmd === 'timeout') {
        const dur = Number(parts[1]) || 600
        const reason = parts.slice(Number(parts[1]) ? 2 : 1).join(' ') || undefined
        const r = await banUser(broadcasterId, modId, targetId, reason, dur)
        if (r.success) {
          setMessages(prev => [...prev, {
            id: ++msgIdCounter,
            channel,
            user: 'BlinkStream',
            isNotice: true,
            eventHeader: `⏱️ @${targetName} ha sido silenciado por ${dur}s.`,
            eventColorClass: 'from-amber-950/80 to-yellow-900/40 border-amber-500/60 text-amber-300',
          }])
        } else {
          setConnError(r.error?.message || `Error al silenciar a @${targetName}`)
        }
      } else if (cmd === 'unban' || cmd === 'untimeout') {
        const r = await unbanUser(broadcasterId, modId, targetId)
        if (r.success) {
          setMessages(prev => [...prev, {
            id: ++msgIdCounter,
            channel,
            user: 'BlinkStream',
            isNotice: true,
            eventHeader: `✅ @${targetName} ha sido desbaneado / perdonado.`,
            eventColorClass: 'from-green-950/80 to-emerald-900/40 border-green-500/60 text-green-300',
          }])
        } else {
          setConnError(r.error?.message || `Error al desbanear a @${targetName}`)
        }
      }
      return
    }

    setConnError(`Comando /${cmd} no soportado o requiere permisos especiales.`)
    setInputText('')
  }, [channel, auth, broadcasterId, userId, isModerator, isBroadcaster, getUserBadgesForSend])

  const sendMessage = async (e) => {
    e.preventDefault()
    const text = inputText.trim()
    if (!text) return
    if (!auth.token || !auth.username) {
      setConnError('Debes iniciar sesión para enviar mensajes')
      return
    }

    if (text.startsWith('/')) {
      await handleSlashCommand(text)
      return
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    const myBadges = getUserBadgesForSend()
    const myColor = userColorRef.current || '#bf94ff'
    const myDisplayName = userDisplayNameRef.current || auth.username

    setMessages(prev => [...prev, {
      id: ++msgIdCounter,
      channel,
      user: myDisplayName,
      color: myColor,
      message: text,
      emotes: '',
      badges: myBadges,
      timestamp: Date.now(),
    }])
    wsRef.current.send(`PRIVMSG #${channel} :${text}\r\n`)
    setInputText('')
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  // Mando a Distancia Wi-Fi (Fase 4): Recibir texto del teclado móvil y enviarlo al chat sin duplicaciones
  const companionChatRef = useRef({ auth: null, channel: '' });
  useEffect(() => {
    companionChatRef.current = { auth, channel };
  }, [auth, channel]);

  useEffect(() => {
    // Si isOverlay está activo junto al chat normal, solo permitimos al chat principal procesar el mensaje del móvil
    if (!isTauri() || isOverlay) return;
    let unlistenFn = null;
    let isCancelled = false;
    import('@tauri-apps/api/event').then(({ listen }) => {
      if (isCancelled) return;
      listen('companion_send_chat', async (e) => {
        const text = e.payload?.text?.trim();
        const { auth: curAuth, channel: curCh } = companionChatRef.current || {};
        if (!text || !curAuth?.token || !curAuth?.username) return;

        if (text.startsWith('/')) {
          await handleSlashCommand(text);
          return;
        }

        const curWs = wsRef.current;
        if (!curWs || curWs.readyState !== 1) return;

        const myBadges = getUserBadgesForSend()
        const myColor = userColorRef.current || '#bf94ff'
        const myDisplayName = userDisplayNameRef.current || curAuth.username

        setMessages(prev => [...prev, {
          id: ++msgIdCounter,
          channel: curCh,
          user: myDisplayName,
          color: myColor,
          message: text,
          emotes: '',
          badges: myBadges,
          timestamp: Date.now(),
        }]);
        curWs.send(`PRIVMSG #${curCh} :${text}\r\n`);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }).then(fn => {
        if (isCancelled) fn();
        else unlistenFn = fn;
      }).catch(() => {});
    }).catch(() => {});
    return () => {
      isCancelled = true;
      if (unlistenFn) unlistenFn();
    };
  }, [isOverlay, handleSlashCommand, getUserBadgesForSend]);

  if (useTwitchPopout) {
    return (
      <div className={`h-full flex flex-col transition-colors ${isOverlay ? 'bg-black/65 backdrop-blur-md border border-white/15 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.85)]' : 'bg-chat'}`}>
        <TwitchChatPopout
          channelName={channel}
          twitchToken={auth.token}
          twitchUsername={auth.username}
          onClose={() => {
            setUseTwitchPopout(false)
            try { localStorage.setItem('bs.chat.use_twitch_popout', 'false') } catch { /* ignore */ }
          }}
        />
      </div>
    )
  }

  return (
    <div className={`h-full flex flex-col transition-colors ${isOverlay ? 'bg-black/65 backdrop-blur-md border border-white/15 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.85)] text-shadow-sm' : 'bg-chat'}`}>
      <div className="shrink-0 px-2.5 py-1.5 bg-bg-secondary/50 backdrop-blur-sm border-b border-bg-tertiary/50 flex items-center justify-between gap-1.5 select-none">
        {/* Left: Channel indicator */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-text-primary font-bold truncate max-w-[100px] sm:max-w-[130px]">
            {isOverlay ? 'Chat' : channel}
          </span>
        </div>

        {/* Right: Action Buttons toolbar */}
        <div className="flex items-center gap-1 shrink-0">
          {!isOverlay && (
            <>
              {/* Twitch Popout Button (Toggles Embedded Native Child Webview) */}
              <button
                type="button"
                onClick={() => {
                  setUseTwitchPopout(true)
                  try { localStorage.setItem('bs.chat.use_twitch_popout', 'true') } catch { /* ignore */ }
                }}
                className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border border-twitch/40 bg-twitch/10 hover:bg-twitch/25 text-twitch-glow hover:text-white transition-all cursor-pointer"
                title="Incrustar Chat Oficial de Twitch (Puntos de Canal, Recompensas y Emotes)"
                aria-label="Incrustar Popout Oficial de Twitch"
              >
                <PhosphorIcon name="Coins" size={13} weight="fill" />
                <span className="hidden sm:inline">Popout</span>
              </button>

              {/* Popout Floating Window Button */}
              <button
                type="button"
                onClick={() => openTwitchChatPopoutWindow(channel, false, auth.token, auth.username)}
                className="p-1 rounded-md text-text-muted hover:text-cyan-300 hover:bg-white/5 transition-colors cursor-pointer"
                title="Abrir Chat de Twitch en Ventana Flotante"
                aria-label="Abrir Popout Flotante"
              >
                <PhosphorIcon name="ArrowSquareOut" size={13} weight="bold" />
              </button>

              {/* Gamer Overlay Launcher */}
              {isTauri() && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await invoke('open_gamer_overlay', { channel })
                    } catch (err) {
                      console.warn('Failed to open gamer overlay:', err)
                    }
                  }}
                  className="p-1 rounded-md text-text-muted hover:text-cyan-400 hover:bg-white/5 transition-colors cursor-pointer"
                  title="Abrir Overlay Gamer Transparente (HUD sobre videojuegos)"
                  aria-label="Abrir Overlay Gamer Transparente"
                >
                  <PhosphorIcon name="PictureInPicture" size={13} weight="duotone" />
                </button>
              )}
            </>
          )}

          {/* Anti-Spam Toggle */}
          <button
            type="button"
            onClick={() => {
              setAntiSpam(p => {
                const n = !p
                setItem(STORAGE_KEYS.ANTISPAM, n)
                antiSpamRef.current = n
                return n
              })
            }}
            className={`flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-md border transition-all cursor-pointer ${
              antiSpam
                ? 'bg-purple-600/20 text-purple-300 border-purple-500/60 shadow-sm shadow-purple-500/20'
                : 'bg-white/[0.03] text-text-muted border-white/10 hover:border-white/20'
            }`}
            title={antiSpam ? t('chat.antispam.on', 'Anti-Spam Torneo activado: agrupa mensajes idénticos') : t('chat.antispam.off', 'Activar Anti-Spam Torneo (agrupa mensajes repetitivos y spam)')}
            aria-label="Toggle Anti-Spam Modo Torneo"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${antiSpam ? 'bg-purple-400 animate-pulse' : 'bg-gray-500'}`} />
            <span className="hidden xl:inline">Anti-Spam</span>
          </button>

          {/* User Auth status */}
          {auth.token ? (
            <div className="flex items-center gap-1 pl-1 border-l border-white/10 ml-0.5">
              <span className="text-[11px] text-twitch/90 font-bold truncate max-w-[70px] sm:max-w-[100px]">
                {auth.username || t('chat.connected', 'Conectado')}
              </span>
              <span className="text-[9px] text-green-400 font-bold">✓</span>
            </div>
          ) : (
            <div className="relative pl-1 border-l border-white/10 ml-0.5">
              <button
                type="button"
                onClick={() => setShowLoginOptions(p => !p)}
                disabled={authing}
                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-twitch/20 hover:bg-twitch/40 text-twitch font-bold cursor-pointer disabled:opacity-40 transition-colors"
              >
                {authing ? (
                  <>
                    <span className="w-2.5 h-2.5 border border-twitch border-t-transparent rounded-full animate-spin" />
                    <span className="hidden sm:inline">{t('chat.connecting', 'Conectando…')}</span>
                  </>
                ) : (
                  t('chat.login', 'Iniciar sesión')
                )}
              </button>

              {showLoginOptions && !authing && (
                <div className="absolute right-0 top-full mt-1 w-72 bg-bg-secondary border border-bg-tertiary/60 rounded-xl shadow-2xl z-50 p-3.5 animate-fade-in" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-twitch/20 flex items-center justify-center text-twitch shrink-0">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.428l-3 3v-3H6.857V1.714h13.714z"/></svg>
                    </div>
                  <div>
                    <p className="text-xs font-bold text-text-primary">Iniciar sesión</p>
                    <p className="text-[10px] text-text-muted">Conecta tu cuenta de Twitch</p>
                  </div>
                </div>

                <p className="text-[11px] text-text-muted/80 mb-3 leading-relaxed">
                  Inicia sesión de forma segura para enviar mensajes, usar emotes de canal y acceder a controles de moderación.
                </p>

                <button
                  onClick={() => {
                    setShowLoginOptions(false)
                    if (onLoginWithToken) {
                      onLoginWithToken()
                    } else {
                      handleDeviceCodeLogin()
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-twitch hover:bg-twitch-dark text-white text-xs font-bold shadow-lg shadow-twitch/25 transition-all cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.428l-3 3v-3H6.857V1.714h13.714z"/></svg>
                  <span>Iniciar sesión con Twitch</span>
                </button>
              </div>
            )}
          </div>
        )}

        <span className="text-[11px] text-text-muted/40 ml-1">{messages.length}</span>

        {isOverlay && onCloseOverlay && (
          <button
            onClick={onCloseOverlay}
            className="text-white/60 hover:text-white hover:bg-white/10 rounded-lg p-1 ml-1.5 cursor-pointer transition-colors"
            title={t('player.closeOverlay', 'Cerrar chat superpuesto')}
            aria-label="Cerrar chat superpuesto"
          >
            <PhosphorIcon name="X" size={16} weight="bold" />
          </button>
        )}
        </div>
      </div>

      {/* Selector de Pestañas de Chat (Todos | Menciones | Destacados) */}
      <div className="shrink-0 px-2 py-1.5 bg-[#121218]/95 border-b border-white/[0.06] flex items-center justify-around gap-1.5 select-none text-[11px] font-bold">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg transition-all cursor-pointer whitespace-nowrap overflow-hidden border ${
            activeTab === 'all'
              ? 'bg-twitch/30 text-white shadow-[0_2px_10px_rgba(145,70,255,0.35)] border-twitch/60 font-bold'
              : 'text-text-muted hover:text-white hover:bg-white/[0.04] border-transparent font-bold'
          }`}
        >
          <span className="shrink-0">💬</span>
          <span className="truncate">{t('chat.tab.all', 'Todos')}</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('mentions')
            setUnreadMentions(0)
          }}
          className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg transition-all cursor-pointer relative whitespace-nowrap overflow-hidden border ${
            activeTab === 'mentions'
              ? 'bg-twitch/30 text-white shadow-[0_2px_10px_rgba(145,70,255,0.35)] border-twitch/60 font-bold'
              : 'text-text-muted hover:text-white hover:bg-white/[0.04] border-transparent font-bold'
          }`}
          title="Mensajes donde te mencionan (@TuUsuario)"
        >
          <span className="shrink-0">🔔</span>
          <span className="truncate">Menciones</span>
          {unreadMentions > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black animate-bounce shadow-sm leading-none shrink-0">
              {unreadMentions}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('featured')}
          className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg transition-all cursor-pointer whitespace-nowrap overflow-hidden border ${
            activeTab === 'featured'
              ? 'bg-twitch/30 text-white shadow-[0_2px_10px_rgba(145,70,255,0.35)] border-twitch/60 font-bold'
              : 'text-text-muted hover:text-white hover:bg-white/[0.04] border-transparent font-bold'
          }`}
          title="Eventos del canal, Mods, VIPs y Recompensas"
        >
          <span className="shrink-0">⭐</span>
          <span className="truncate">Destacados</span>
        </button>
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
        {messages.length === 0 && !connError && !authing && !chatHidden && (
          <p className="text-text-muted/50 text-xs text-center mt-6">
            {connected ? t('chat.waiting', 'Esperando mensajes...') : t('chat.placeholder.connecting', 'Conectando al chat...')}
          </p>
        )}

        {/* WT-20260628-48: cuando chatHidden es true, mostrar placeholder en vez de mensajes */}
        {chatHidden ? (
          <div className="flex-1 min-h-[200px] flex items-center justify-center text-text-muted/50 text-sm">
            {t('chat.hidden', 'Chat oculto')}
          </div>
        ) : (
          <div className="space-y-0.5">
            {(() => {
              const filtered = messages
                .filter(msg => !hideBots || !msg.user.toLowerCase().includes('bot'))
                .filter(msg => {
                  if (activeTab === 'mentions') return Boolean(msg.isMention)
                  if (activeTab === 'featured') {
                    const isModVip = msg.badges?.some(b => ['moderator', 'vip', 'broadcaster', 'staff', 'admin'].includes(b.set))
                    return Boolean(msg.eventType || msg.isReward || isModVip)
                  }
                  return true
                })

              if (filtered.length === 0 && messages.length > 0) {
                return (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-text-muted/60 select-none my-6">
                    <span className="text-2xl mb-2">{activeTab === 'mentions' ? '🔔' : '⭐'}</span>
                    <p className="text-xs font-bold text-white/80 mb-1">
                      {activeTab === 'mentions'
                        ? 'Sin menciones por ahora'
                        : 'Sin mensajes destacados en vivo'}
                    </p>
                    <p className="text-[11px] text-text-muted/70">
                      {activeTab === 'mentions'
                        ? 'Aquí aparecerán los mensajes que nombren tu @usuario.'
                        : 'Aquí aparecerán canjes de puntos, bits y mensajes de Mods o VIPs.'}
                    </p>
                  </div>
                )
              }

              return filtered.map(msg => (
                <ChatMessage
                  key={msg.id}
                  msg={msg}
                  badgeUrls={badgeUrls}
                  chatFontSize={chatFontSize}
                  setUserCard={setUserCard}
                  renderMessage={renderMessage}
                  onContextMenu={isModerator ? handleContextMenu : undefined}
                  isGridMode={isGridMode}
                  onSelectUserForInspection={onSelectUserForInspection}
                  isModerator={isModerator}
                />
              ))
            })()}
          </div>
        )}

        {/* WT-20260628-56: menu contextual estilo Twitch. Solo se
            renderiza si hay un target y el viewer es mod/broadcaster
            (en cuyo caso tiene sentido). El componente ya cierra
            solo con click fuera / Escape. */}
        {contextMenu && isModerator && (
          <MessageContextMenu
            position={{ x: contextMenu.x, y: contextMenu.y }}
            target={contextMenu.target}
            isModerator={!!isModerator}
            isBroadcaster={!!isBroadcaster}
            viewerLogin={viewerLogin}
            onAction={handleContextAction}
            onClose={() => setContextMenu(null)}
          />
        )}

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
        <form onSubmit={sendMessage} className="relative flex items-center gap-2 p-2.5 bg-gradient-to-b from-[#18181b] to-[#121215] border-t border-white/[0.06] shadow-[0_-4px_20px_rgba(0,0,0,0.4)]">
          {/* WT-20260628-47: Emote picker a la izquierda */}
          <div>
            <button
              type="button"
              onClick={() => { setShowEmoteMenu(p => !p); setEmoteSearch(''); if (!showEmoteMenu) setEmoteTab('all') }}
              className={`shrink-0 p-2 rounded-xl cursor-pointer transition-all ${showEmoteMenu ? 'bg-twitch text-white shadow-lg shadow-twitch/40 scale-105' : 'text-text-muted hover:text-white hover:bg-white/10'}`}
              title="Emotes"
            >
              <PhosphorIcon name="Smiley" size={22} weight="duotone" />
            </button>
          </div>

          {/* Menú de Emotes posicionado respecto a la barra del chat para que NUNCA sobresalga hacia el reproductor de video */}
          {showEmoteMenu && (
            <div className="absolute bottom-[calc(100%+10px)] left-2 right-2 max-h-[410px] bg-gradient-to-b from-[#1a1a1f]/98 to-[#131317]/98 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.7)] z-50 flex flex-col animate-slide-up overflow-hidden ring-1 ring-purple-500/20">
              {/* Buscador superior */}
              <div className="p-2.5 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="relative flex items-center">
                  <PhosphorIcon name="MagnifyingGlass" size={14} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/50 pointer-events-none" />
                  <input
                    type="text"
                    value={emoteSearch}
                    onChange={e => { setEmoteSearch(e.target.value); if (e.target.value) setEmoteTab('all') }}
                    placeholder={t('chat.emoteSearch', 'Buscar entre cientos de emotes...')}
                    className="w-full pl-9 pr-7 py-2 rounded-xl bg-black/40 text-white placeholder-text-muted/50 text-xs border border-white/10 focus:border-twitch focus:bg-black/60 focus:ring-2 focus:ring-twitch/30 focus:outline-none transition-all"
                    autoFocus
                  />
                  {emoteSearch && (
                    <button type="button" onClick={() => setEmoteSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted/50 hover:text-white p-0.5 transition-colors">
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Categorías con diseño pill de alta definición */}
              {!emoteSearch && (
                <div className="flex items-center gap-1.5 px-2 py-2 border-b border-white/[0.04] bg-black/20 overflow-x-auto no-scrollbar">
                  {[
                    { id: 'all', label: t('chat.tab.all', 'Todos'), count: emoteList.length, icon: <PhosphorIcon name="Cat" size={14} weight="duotone" /> },
                    { id: 'favs', label: t('chat.tab.favs', 'Fav'), count: favoriteEmotes.filter(f => emoteList.some(e => e.name === f)).length, icon: <PhosphorIcon name="Heart" size={14} weight="fill" className="text-red-400" /> },
                    { id: 'recent', label: t('chat.tab.rec', 'Rec'), count: recentEmotes.filter(r => emoteList.some(e => e.name === r.name)).length, icon: <PhosphorIcon name="ClockCounterClockwise" size={14} weight="bold" className="text-amber-400" /> },
                    { id: 'channel', label: t('chat.tab.channel', 'Canal'), count: emoteList.filter(e => e.section === 'channel').length, icon: <PhosphorIcon name="Television" size={14} weight="duotone" className="text-purple-400" /> },
                    { id: '7tv', label: '7TV', count: emoteList.filter(e => e.provider === '7tv').length, icon: <img src={logo7tv} alt="7TV" className="w-4 h-4 object-contain" /> },
                    { id: 'bttv', label: 'BTTV', count: emoteList.filter(e => e.provider === 'bttv').length, icon: <img src={logoBttv} alt="BTTV" className="w-4 h-4 object-contain" /> },
                    { id: 'ffz', label: 'FFZ', count: emoteList.filter(e => e.provider === 'ffz').length, icon: <img src={logoFfz} alt="FFZ" className="w-4 h-4 object-contain" /> },
                  ].filter(t => t.count > 0 || t.id === 'all' || t.id === 'favs' || t.id === 'recent').map(tab => (
                    <button key={tab.id} type="button" onClick={() => setEmoteTab(tab.id)}
                      className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full cursor-pointer transition-all text-xs font-medium ${emoteTab === tab.id ? 'bg-gradient-to-r from-twitch to-purple-600 text-white shadow-md shadow-twitch/30 ring-1 ring-white/20' : 'text-text-muted/60 hover:text-white hover:bg-white/[0.06]'}`}>
                      <span>{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Grid de Emotes con Scroll elegante */}
              <div className="flex-1 overflow-y-auto p-2 min-h-[160px] max-h-[250px] space-y-2">
                {emoteList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-text-muted/50 gap-2">
                    <div className="w-5 h-5 border-2 border-twitch border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs">{t('chat.loadingEmotes', 'Cargando catálogo de emotes...')}</p>
                  </div>
                ) : (
                  <>
                    {emoteSearch && (
                      <div className="text-[11px] text-text-muted/60 px-1 pb-1 flex justify-between font-medium">
                        <span>Resultados para "{emoteSearch}"</span>
                        <span className="bg-white/10 px-1.5 py-0.5 rounded text-white font-mono">{emoteList.filter(e => e.name.toLowerCase().includes(emoteSearch.toLowerCase())).length}</span>
                      </div>
                    )}
                    <div className="grid gap-1 pb-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(42px, 1fr))' }}>
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
                          const pColor = e.provider === '7tv' ? '#29b6f6' : e.provider === 'bttv' ? '#ffa726' : e.provider === 'ffz' ? '#ef5350' : null
                          const isFav = favoriteEmotes.includes(e.name)
                          return (
                            <div key={e.provider + '-' + e.id} className="relative group flex justify-center aspect-square">
                              <button type="button"
                                onClick={() => {
                                  setInputText(prev => prev + (prev ? ' ' : '') + e.name + ' ')
                                  setShowEmoteMenu(false); setEmoteSearch('')
                                  setRecentEmotes(prev => {
                                    const filtered = prev.filter(r => r.name !== e.name)
                                    const next = [{ name: e.name, provider: e.provider }, ...filtered].slice(0, 20)
                                    try { localStorage.setItem('blinkstream_recent_emotes', JSON.stringify(next)) } catch { /* no-op */ }
                                    return next
                                  })
                                }}
                                onContextMenu={(ev) => {
                                  ev.preventDefault()
                                  setFavoriteEmotes(prev => {
                                    const isF = prev.includes(e.name)
                                    const next = isF ? prev.filter(f => f !== e.name) : [...prev, e.name]
                                    try { localStorage.setItem('blinkstream_fav_emotes', JSON.stringify(next)) } catch { /* no-op */ }
                                    return next
                                  })
                                }}
                                onMouseEnter={() => setHoveredEmote(e)}
                                onMouseLeave={() => setHoveredEmote(null)}
                                className="w-full h-full flex items-center justify-center p-1.5 rounded-xl hover:bg-white/[0.08] cursor-pointer transition-all hover:scale-125 hover:z-10 active:scale-95 relative group">
                                <img src={e.urls[0]} alt={e.name} className="w-7 h-7 object-contain drop-shadow" loading="lazy"
                                  onError={(ev) => { ev.target.style.display = 'none' }} />
                                {pColor && (<span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full ring-1 ring-black/50" style={{ backgroundColor: pColor }} />)}
                              </button>
                              {isFav && (
                                <span className="absolute top-0 right-0 text-[9px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] pointer-events-none">❤️</span>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  </>
                )}
              </div>

              {/* Status bar inferior inteligente con detalles en tiempo real */}
              <div className="px-3 py-2 bg-black/40 border-t border-white/[0.06] flex items-center justify-between min-h-[36px] text-xs">
                {hoveredEmote ? (
                  <div className="flex items-center gap-2 overflow-hidden truncate">
                    <img src={hoveredEmote.urls[0]} alt="" className="w-6 h-6 object-contain shrink-0" />
                    <span className="font-bold text-white tracking-wide truncate">{hoveredEmote.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-text-muted font-mono uppercase shrink-0">
                      {hoveredEmote.provider || 'Twitch'}
                    </span>
                  </div>
                ) : (
                  <span className="text-text-muted/50 text-[11px] truncate font-medium">
                    {t('chat.clickToSend', 'Haz clic para enviar · Clic derecho para ❤️ Fav')}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* WT-20260628-47: Input al centro con diseño envolvente */}
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                !connected ? t('chat.placeholder.connecting', 'Conectando al chat...') :
                !auth.token ? t('chat.placeholder.login', 'Inicia sesión para participar') :
                t('chat.placeholder.send', 'Enviar un mensaje al chat...')
              }
              disabled={!connected || !auth.token}
              maxLength={500}
              className="w-full pl-4 pr-12 py-2 rounded-xl bg-[#202024]/80 hover:bg-[#202024] text-white placeholder-text-muted/50 text-[13px] border border-white/[0.08] focus:border-twitch focus:bg-[#25252b] focus:ring-2 focus:ring-twitch/30 focus:outline-none transition-all disabled:opacity-40"
            />
            {inputText.length > 400 && (
              <span className={`absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-mono pointer-events-none ${inputText.length >= 500 ? 'text-red-400 font-bold' : 'text-text-muted/50'}`}>
                {inputText.length}/500
              </span>
            )}
          </div>

          {/* WT-20260628-47: Botón de Channel Points */}
          {broadcasterId && onOpenCPPanel && (
            <button
              type="button"
              onClick={onOpenCPPanel}
              className="shrink-0 p-2 rounded-xl text-amber-400 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/20 cursor-pointer transition-all shadow-md shadow-amber-500/10 hover:scale-105 active:scale-95 flex items-center justify-center"
              title={t('chat.cpTitle', 'Recompensas y Puntos del canal')}
              aria-label="Puntos del canal"
            >
              <PhosphorIcon name="Coins" size={22} weight="duotone" className="animate-pulse" />
            </button>
          )}

          <button
            type="submit"
            disabled={!connected || !inputText.trim() || !auth.token}
            className="shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-twitch via-purple-600 to-indigo-600 hover:from-twitch-dark hover:via-purple-700 hover:to-indigo-700 text-white text-[13px] font-bold cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-lg shadow-twitch/25 hover:shadow-twitch/40 hover:scale-[1.02] active:scale-95"
          >
            {t('chat.sendBtn', 'Enviar')}
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
