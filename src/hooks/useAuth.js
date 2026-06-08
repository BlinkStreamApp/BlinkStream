import { useState, useEffect, useCallback, useRef } from 'react'
import { SUPABASE_URL, pollAuthToken } from '../utils/supabase'
import { APP_CLIENT_ID, PUBLIC_CLIENT_ID } from '../utils/twitch'

const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/twitch-auth`
const LS_TOKEN = 'blinkstream_twitch_token'
const LS_USERNAME = 'blinkstream_twitch_username'
const LS_AVATAR = 'blinkstream_twitch_avatar'

async function fetchUserInfo(token) {
  try {
    const res = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': APP_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
    })
    if (res.ok) {
      const data = await res.json()
      const userData = data?.data?.[0]
      if (userData) {
        const avatar = userData.profile_image_url || null
        const username = userData.login || null
        const displayName = userData.display_name || null
        if (avatar) localStorage.setItem(LS_AVATAR, avatar)
        if (username) localStorage.setItem(LS_USERNAME, username)
        return { username, avatar, displayName }
      }
    }
  } catch { /* ignore */ }
  return null
}

async function fetchAndSaveAvatar(token) {
  const info = await fetchUserInfo(token)
  return info?.avatar || null
}

async function openSystemBrowser(url) {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  } catch { /* no Tauri → fallback */ }

  const w = window.open(url, '_blank')
  if (w) w.focus()
}

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authing, setAuthing] = useState(false)
  const [error, setError] = useState(null)
  const [avatar, setAvatar] = useState(() => localStorage.getItem(LS_AVATAR) || null)
  const [keychainReady, setKeychainReady] = useState(false)
  const [cachedToken, setCachedToken] = useState(() => {
    try { return localStorage.getItem(LS_TOKEN) || null } catch { return null }
  })
  const abortRef = useRef(null)

  useEffect(() => {
    const init = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')

        // 1º: Intentar cargar del keychain
        let token = await invoke('get_secret', { key: 'twitch_token' })

        // 2º: Fallback a localStorage (migración silenciosa)
        if (!token) {
          token = localStorage.getItem(LS_TOKEN) || ''
          if (token) {
            try {
              await invoke('store_secret', { key: 'twitch_token', value: token })
              localStorage.removeItem(LS_TOKEN)
            } catch { /* si falla keychain, mantener en localStorage */ }
          }
        }

        if (token) {
          setCachedToken(token)
          const username = localStorage.getItem(LS_USERNAME) || 'twitch_user'
          setUser({
            username,
            identities: username ? [{ provider: 'twitch', identity_data: { login: username } }] : [],
          })
        }
      } catch { /* fallback a localStorage */
        try {
          const token = localStorage.getItem(LS_TOKEN)
          if (token) {
            setCachedToken(token)
            const username = localStorage.getItem(LS_USERNAME) || 'twitch_user'
            setUser({
              username,
              identities: username ? [{ provider: 'twitch', identity_data: { login: username } }] : [],
            })
          }
        } catch { /* ignore */ }
      }
      setLoading(false)
      setKeychainReady(true)
    }
    init()

    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const login = useCallback(async () => {
    setAuthing(true)
    setError(null)

    abortRef.current?.abort()

    const requestId = crypto.randomUUID()
    const abortController = new AbortController()
    abortRef.current = abortController

    const oauthUrl = `${EDGE_FN_URL}?request_id=${encodeURIComponent(requestId)}`
    openSystemBrowser(oauthUrl).catch(() => {})

    try {
      const result = await pollAuthToken(requestId, { signal: abortController.signal, interval: 1500 })

      if (result?.access_token) {
        // Guardar token en keychain
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('store_secret', { key: 'twitch_token', value: result.access_token })
        } catch {
          localStorage.setItem(LS_TOKEN, result.access_token)
        }
        setCachedToken(result.access_token)

        const tempUsername = result.username || 'twitch_user'
        localStorage.setItem(LS_USERNAME, tempUsername)
        setUser({
          username: tempUsername,
          identities: [{ provider: 'twitch', identity_data: { login: tempUsername } }],
        })

        fetchUserInfo(result.access_token).then(userInfo => {
          if (userInfo?.avatar) setAvatar(userInfo.avatar)
          if (userInfo?.username && userInfo.username !== tempUsername) {
            localStorage.setItem(LS_USERNAME, userInfo.username)
            setUser({
              username: userInfo.username,
              identities: [{ provider: 'twitch', identity_data: { login: userInfo.username } }],
            })
          } else if (userInfo?.avatar && !userInfo?.username) {
          }
        })

        setAuthing(false)
        setError(null)
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setError(err.message || 'Error al conectar con Twitch')
        setAuthing(false)
      }
    }

    setAuthing(false)
  }, [])

  const loginWithToken = useCallback(async (token) => {
    if (!token) return
    setAuthing(true)
    setError(null)

    const cleanToken = token.replace(/^oauth:/i, '')
    try {
      const userInfo = await fetchUserInfo(cleanToken)
      if (!userInfo?.username) throw new Error('Token inválido')

      const username = userInfo.username

      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('store_secret', { key: 'twitch_token', value: cleanToken })
      } catch {
        localStorage.setItem(LS_TOKEN, cleanToken)
      }
      setCachedToken(cleanToken)
      localStorage.setItem(LS_USERNAME, username)
      if (userInfo.avatar) setAvatar(userInfo.avatar)

      setUser({
        username,
        identities: [{ provider: 'twitch', identity_data: { login: username } }],
      })
      setAuthing(false)
      setError(null)
    } catch (err) {
      setError(err.message || 'Error al validar token')
      setAuthing(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('delete_secret', { key: 'twitch_token' })
    } catch { /* ignore */ }
    localStorage.removeItem(LS_TOKEN)
    localStorage.removeItem(LS_USERNAME)
    setCachedToken(null)
    setUser(null)
    setError(null)
    setAuthing(false)
  }, [])

  const getTwitchToken = useCallback(() => {
    return cachedToken
  }, [cachedToken])

  const isLoggedIn = !!user && !!getTwitchToken()

  return {
    session: null,
    loading,
    authing,
    error,
    user,
    avatar,
    keychainReady,
    isLoggedIn,
    login,
    loginWithToken,
    logout,
    getTwitchToken,
  }
}
