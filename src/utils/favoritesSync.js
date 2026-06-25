import { APP_CLIENT_ID } from './twitch'
import { SUPABASE_URL } from './supabase'
import { getBlinkstreamToken, refreshBlinkstreamToken, clearBlinkstreamToken } from './supabase'

const DATA_FN = `${SUPABASE_URL}/functions/v1/blinkstream-data`

// Wrapper interno: hace fetch con Authorization Bearer y un unico retry
// automatico en 401 (rotando el JWT via twitch-auth?refresh=). Si despues
// del retry sigue 401, devolvemos el error para que el caller degrade
// elegantemente (favoritos quedan locales).
async function authedFetch(url, options = {}) {
  const buildHeaders = (token) => ({
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  })

  let token = getBlinkstreamToken()
  let res = await fetch(url, { ...options, headers: buildHeaders(token) })

  if (res.status === 401 && token) {
    // Token vencido o invalido. Intentar refresh UNA vez.
    const fresh = await refreshBlinkstreamToken()
    if (fresh) {
      res = await fetch(url, { ...options, headers: buildHeaders(fresh) })
    } else {
      // No pudimos refrescar: limpiar estado para forzar re-login.
      clearBlinkstreamToken()
    }
  }

  return res
}

export async function fetchCloudFavorites(username) {
  if (!username) return []
  try {
    const res = await authedFetch(`${DATA_FN}?action=list&username=${encodeURIComponent(username)}`)
    if (!res.ok) return []
    const data = await res.json()
    return data?.channels || []
  } catch { return [] }
}

export async function addCloudFavorite(username, channel) {
  if (!username) return
  try {
    await authedFetch(DATA_FN, {
      method: 'POST',
      body: JSON.stringify({ action: 'fav_add', username, channel }),
    })
  } catch { /* fire-and-forget */ }
}

export async function removeCloudFavorite(username, channel) {
  if (!username) return
  try {
    await authedFetch(DATA_FN, {
      method: 'POST',
      body: JSON.stringify({ action: 'fav_remove', username, channel }),
    })
  } catch { /* fire-and-forget */ }
}

export async function mergeFavorites(localFavorites, username) {
  if (!username) return localFavorites
  const cloud = await fetchCloudFavorites(username)
  const merged = [...new Set([...localFavorites, ...cloud])]
  for (const ch of localFavorites) {
    if (!cloud.includes(ch)) addCloudFavorite(username, ch)
  }
  return merged
}

export async function fetchFollowedChannels(token) {
  if (!token) return []
  try {
    const userRes = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': APP_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
    })
    if (!userRes.ok) return []
    const userData = await userRes.json()
    const userId = userData?.data?.[0]?.id
    if (!userId) return []

    const follows = []
    let cursor = null
    for (let i = 0; i < 5; i++) {
      const url = `https://api.twitch.tv/helix/channels/followed?user_id=${userId}&first=100${cursor ? `&after=${cursor}` : ''}`
      const followRes = await fetch(url, {
        headers: {
          'Client-ID': APP_CLIENT_ID,
          'Authorization': `Bearer ${token}`,
        },
      })
      if (!followRes.ok) break
      const followData = await followRes.json()
      if (followData.data) {
        follows.push(...followData.data.map(f => f.broadcaster_login))
      }
      if (!followData.pagination?.cursor) break
      cursor = followData.pagination.cursor
    }
    return follows
  } catch { return [] }
}
