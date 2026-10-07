import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchCloudFavorites, fetchFollowedChannels, addCloudFavorite, removeCloudFavorite } from '../utils/favoritesSync'
import { getJSON, setJSON, removeItem } from '../utils/storage'

const LEGACY_KEY = 'blinkstream_favorites'
const BACKUP_KEY = 'blinkstream_favorites_legacy'
const REFRESH_MS = 60000
const keyFor = owner => `blinkstream_favorites_v2:${owner || 'guest'}`
const channels = list => [...new Set((Array.isArray(list) ? list : [])
  .filter(ch => typeof ch === 'string').map(ch => ch.toLowerCase()))]

// The old global list mixed Twitch follows and manual favorites. Preserve it,
// but never assign an unowned list to the next person who signs in.
export function archiveLegacyFavorites() {
  const old = getJSON(LEGACY_KEY)
  if (!Array.isArray(old)) return
  let owner = null
  try { owner = localStorage.getItem('blinkstream_twitch_username')?.toLowerCase() || null } catch { /* unavailable storage */ }
  if (!setJSON(BACKUP_KEY, { owner, channels: channels(old) })) return
  removeItem(LEGACY_KEY)
}

export function useFavoriteChannels({ username, token, loading = false }) {
  const owner = token && username && username !== 'twitch_user' ? username.toLowerCase() : null
  const [state, setState] = useState({ owner: null, pinned: [], followed: [], error: null })
  const activeRef = useRef(null)

  useEffect(() => {
    if (loading) return
    archiveLegacyFavorites()
    const session = { owner, pinned: channels(getJSON(keyFor(owner), [])), version: 0, cancelled: false }
    activeRef.current = session
    const controller = new AbortController()
    let inFlight = false
    let imported = false
    let lastRefresh = 0
    Promise.resolve().then(() => {
      if (!session.cancelled) setState({ owner, pinned: session.pinned, followed: [], error: null })
    })

    const refresh = async (force = false) => {
      if (!owner || session.cancelled || inFlight || (!force && Date.now() - lastRefresh < 15000)) return
      inFlight = true
      lastRefresh = Date.now()
      const version = session.version
      try {
        const followed = channels(await fetchFollowedChannels(token, { signal: controller.signal }))
        if (session.cancelled) return
        const exclusionsKey = `${keyFor(owner)}:cloud-follow-exclusions`
        const exclusions = channels([...channels(getJSON(exclusionsKey, [])), ...followed])
        // Old versions uploaded follows as cloud favorites. Remember which
        // imported entries are not explicit pins, including after an unfollow.
        setJSON(exclusionsKey, exclusions)
        // Refresh follows independently: an unfollow must not survive as a favorite.
        setState(prev => ({ ...prev, owner, pinned: session.pinned, followed, error: null }))
        if (!imported) {
          const explicit = [...session.pinned]
          // Loading the library is read-only: never upload imported follows or
          // start background favorite writes that could outlive this session.
          const merged = channels(await fetchCloudFavorites(owner))
          if (session.cancelled) return
          const legacy = getJSON(BACKUP_KEY)
          const migrated = getJSON(`${keyFor(owner)}:migrated`, false)
          const legacyChannels = !migrated && legacy?.owner === owner ? channels(legacy.channels) : []
          if (session.version === version) {
            session.pinned = channels([...explicit, ...merged.filter(ch => !exclusions.includes(ch)),
              ...legacyChannels.filter(ch => !followed.includes(ch))])
            setJSON(keyFor(owner), session.pinned)
            setJSON(`${keyFor(owner)}:migrated`, true)
            setState(prev => ({ ...prev, pinned: session.pinned }))
          }
          imported = true
        }
      } catch (err) {
        if (!session.cancelled) setState(prev => ({ ...prev, error: err.message || 'No se pudieron actualizar los follows' }))
      } finally {
        inFlight = false
      }
    }
    const onReturn = () => { if (!document.hidden) void refresh() }
    void refresh(true)
    const timer = setInterval(() => { if (!document.hidden) void refresh(true) }, REFRESH_MS)
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('online', onReturn)
    return () => {
      session.cancelled = true
      controller.abort()
      clearInterval(timer)
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('online', onReturn)
    }
  }, [owner, token, loading])

  const toggleFavorite = useCallback(name => {
    const session = activeRef.current
    if (loading || !session || session.cancelled || session.owner !== owner) return
    const channel = name.toLowerCase()
    const removing = session.pinned.includes(channel)
    session.version++
    session.pinned = removing ? session.pinned.filter(ch => ch !== channel) : [...session.pinned, channel]
    setJSON(keyFor(owner), session.pinned)
    setState(prev => ({ ...prev, pinned: session.pinned }))
    if (owner) {
      if (removing) void removeCloudFavorite(owner, channel)
      else void addCloudFavorite(owner, channel)
    }
  }, [owner, loading])

  return useMemo(() => {
    const visible = !loading && state.owner === owner ? state : { pinned: [], followed: [], error: null }
    return {
      favorites: channels([...visible.pinned, ...visible.followed]),
      pinnedFavorites: visible.pinned,
      followsError: visible.error,
      toggleFavorite,
    }
  }, [state, owner, loading, toggleFavorite])
}
