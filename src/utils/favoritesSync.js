import { getHelixClientId } from './twitch'
import { SUPABASE_URL } from './supabase'
import { getBlinkstreamToken, refreshBlinkstreamToken, clearBlinkstreamToken } from './supabase'
import { isAuthBroken, markAuthBroken } from './favoritesCircuitBreaker'

export { clearAuthBrokenFlag, isAuthBroken } from './favoritesCircuitBreaker'

const DATA_FN = `${SUPABASE_URL}/functions/v1/blinkstream-data`

async function authedFetch(url, options = {}) {
  if (isAuthBroken()) {
    return new Response(JSON.stringify({ error: 'auth_broken' }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const buildHeaders = (token) => ({
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  })

  let token = getBlinkstreamToken()
  if (!token) {
    markAuthBroken()
    return new Response(JSON.stringify({ error: 'no_token' }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    let res = await fetch(url, { ...options, headers: buildHeaders(token) })

    if (!res.ok) {
      if (res.status === 401 && token) {
        const fresh = await refreshBlinkstreamToken()
        if (fresh) {
          res = await fetch(url, { ...options, headers: buildHeaders(fresh) })
        }
      }
      if (!res.ok) {
        markAuthBroken()
        if (res.status === 401) clearBlinkstreamToken()
        if (import.meta.env.DEV) {
          console.warn(`[authedFetch] Servidor respondió HTTP ${res.status} en ${url}. Sincronización cambiada a modo local/offline (circuit-breaker activo).`)
        }
      }
    }
    return res
  } catch {

    markAuthBroken()
    if (import.meta.env.DEV) {
      console.warn(`[authedFetch] Error de red o CORS al comunicar con ${url}. Sincronización cambiada a modo local/offline.`)
    }
    return new Response(JSON.stringify({ error: 'network_or_cors_error' }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export async function fetchCloudFavorites(username) {
  if (!username || isAuthBroken()) return []
  try {
    const res = await authedFetch(`${DATA_FN}?action=list&username=${encodeURIComponent(username)}`)
    if (!res.ok) return []
    const data = await res.json()
    return data?.channels || []
  } catch { return [] }
}

export async function addCloudFavorite(username, channel) {
  if (!username || isAuthBroken()) return
  try {
    await authedFetch(DATA_FN, {
      method: 'POST',
      body: JSON.stringify({ action: 'fav_add', username, channel }),
    })
  } catch {  }
}

export async function removeCloudFavorite(username, channel) {
  if (!username || isAuthBroken()) return
  try {
    await authedFetch(DATA_FN, {
      method: 'POST',
      body: JSON.stringify({ action: 'fav_remove', username, channel }),
    })
  } catch {  }
}

export async function mergeFavorites(localFavorites, username) {
  if (!username || isAuthBroken()) return localFavorites
  const cloud = await fetchCloudFavorites(username)
  if (!cloud || isAuthBroken()) return localFavorites
  const merged = [...new Set([...localFavorites, ...cloud])]

  const toAdd = localFavorites.filter(ch => !cloud.includes(ch))
  if (toAdd.length === 0) return merged

  const CHUNK_SIZE = 10
  for (let i = 0; i < toAdd.length; i += CHUNK_SIZE) {
    if (isAuthBroken()) break
    const chunk = toAdd.slice(i, i + CHUNK_SIZE)
    try {
      const results = await Promise.allSettled(
        chunk.map(ch => addCloudFavorite(username, ch))
      )

      const failed = results.filter(r => r.status === 'rejected').length
      if (failed > 0) {

        console.warn(`[mergeFavorites] chunk ${i / CHUNK_SIZE + 1}: ${failed}/${chunk.length} failed`)
      }
    } catch (err) {

      console.warn(`[mergeFavorites] chunk ${i / CHUNK_SIZE + 1} failed:`, err?.message || err)
    }
  }

  return merged
}

export async function fetchFollowedChannels(token) {
  if (!token) return []
  try {
    const userRes = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': getHelixClientId(),
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
          'Client-ID': getHelixClientId(),
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
