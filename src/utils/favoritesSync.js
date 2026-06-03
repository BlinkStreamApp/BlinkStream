import { APP_CLIENT_ID } from './twitch'
import { SUPABASE_URL } from './supabase'

const DATA_FN = `${SUPABASE_URL}/functions/v1/blinkstream-data`

export async function fetchCloudFavorites(username) {
  if (!username) return []
  try {
    const res = await fetch(`${DATA_FN}?action=list&username=${encodeURIComponent(username)}`)
    if (!res.ok) return []
    const data = await res.json()
    return data?.channels || []
  } catch { return [] }
}

export async function addCloudFavorite(username, channel) {
  if (!username) return
  try {
    await fetch(DATA_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'fav_add', username, channel }),
    })
  } catch { /* fire-and-forget */ }
}

export async function removeCloudFavorite(username, channel) {
  if (!username) return
  try {
    await fetch(DATA_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
