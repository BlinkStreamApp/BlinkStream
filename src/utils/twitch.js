export const PUBLIC_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
export const APP_CLIENT_ID = 'z8bat49d2evj5nkmg5kmkge24sa7z9'

function safeTimeout(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
}

export async function getStoredToken() {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const token = await invoke('get_secret', { key: 'twitch_token' })
    if (token) return token
  } catch { /* fallback */ }
  try {
    return localStorage.getItem('blinkstream_twitch_token') || null
  } catch { return null }
}

export async function clearStoredToken() {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('delete_secret', { key: 'twitch_token' })
  } catch { /* ignore */ }
  try {
    localStorage.removeItem('blinkstream_twitch_token')
    localStorage.removeItem('blinkstream_twitch_username')
  } catch { /* ignore */ }
}

export async function validateToken(token) {
  if (!token) return false
  try {
    const res = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': APP_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch { return false }
}

export async function getHeaders() {
  const token = await getStoredToken()
  const headers = {
    'Client-ID': token ? APP_CLIENT_ID : PUBLIC_CLIENT_ID,
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export function getGqlHeaders() {
  return {
    'Client-ID': PUBLIC_CLIENT_ID,
    'Content-Type': 'application/json',
  }
}

export async function getAccessToken(channel, type = 'stream') {
  const isVod = type === 'video'
  const query = isVod
    ? `{ video(id: "${channel}") { playbackAccessToken(params: {platform: "web", playerBackend: "mediaplayer", playerType: "site"}) { value signature } } }`
    : `{ streamPlaybackAccessToken(channelName: "${channel}", params: {platform: "web", playerBackend: "mediaplayer", playerType: "site"}) { value signature } }`
  const fieldName = isVod ? 'playbackAccessToken' : 'streamPlaybackAccessToken'
  const gqlRes = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Client-ID': PUBLIC_CLIENT_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: safeTimeout(8000),
  })
  if (!gqlRes.ok) throw new Error('GQL access token failed')
  const gqlData = await gqlRes.json()
  const at = isVod ? gqlData?.data?.video?.[fieldName] : gqlData?.data?.streamPlaybackAccessToken
  if (!at?.value || !at?.signature) throw new Error('GQL: no token')
  return { value: at.value, signature: at.signature }
}

export async function getDirectStreamUrl(channel, quality = '1080p60') {
  const at = await getAccessToken(channel)
  const token = at.value; const sig = at.signature

  const params = new URLSearchParams({
    player: 'twitchweb',
    token: token,
    sig: sig,
    allow_audio_only: 'true',
    allow_source: 'true',
    type: 'any',
    p: String(Math.floor(Math.random() * 1e7)),
  })

  const usherUrl = `https://usher.ttvnw.net/api/channel/hls/${encodeURIComponent(channel)}.m3u8?${params}`
  const res = await fetch(usherUrl, {
    headers: { 'Client-ID': PUBLIC_CLIENT_ID },
    signal: safeTimeout(10000),
  })
  if (!res.ok) throw new Error(`Usher: HTTP ${res.status}`)

  if (quality === 'audio_only' || quality === 'best' || quality === 'chunked') {
    return res.url
  }

  const m3u8 = await res.text()
  const lines = m3u8.split('\n')
  
  const variants = [quality]
  const match = quality.match(/^(\d+)p\d+$/)
  if (match) {
    variants.push(match[1] + 'p')
    if (!variants.includes(match[1])) variants.push(match[1])
  }

  for (const variant of variants) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(variant) && lines[i].includes('NAME="')) {
        for (let j = i + 1; j < lines.length; j++) {
          if (!lines[j].startsWith('#') && lines[j].trim()) {
            return lines[j].trim()
          }
        }
      }
    }
  }

  return res.url
}

export async function getStreamInfo(channel) {
  const headers = await getHeaders()
  const res = await fetch(
    `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channel)}`,
    { headers, signal: safeTimeout(5000) }
  )
  if (!res.ok) return null
  const data = await res.json()
  return data.data?.[0] || null
}

export async function searchChannels(query) {
  const headers = await getHeaders()
  const res = await fetch(
    `https://api.twitch.tv/helix/search/channels?query=${encodeURIComponent(query)}&first=8`,
    { headers, signal: safeTimeout(5000) }
  )
  if (!res.ok) return []
  const data = await res.json()
  let results = (data.data || []).map(ch => ({
    login: ch.broadcaster_login,
    displayName: ch.display_name,
    avatar: ch.thumbnail_url,
    isLive: ch.is_live,
    game: ch.game_name,
    viewers: ch.viewer_count,
  }))
  results.sort((a, b) => (b.isLive ? 1 : 0) - (a.isLive ? 1 : 0))
  return results
}
