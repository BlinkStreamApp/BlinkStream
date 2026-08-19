

import { useState, useEffect, useCallback, useRef } from 'react'
import { SUPABASE_URL, pollAuthToken, clearBlinkstreamToken } from '../utils/supabase'
import { getHelixClientId } from '../utils/twitch'
import { measureInvoke } from '../utils/perf'
import { logEvent } from '../utils/eventLog'

const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/twitch-auth`
const LS_TOKEN = 'blinkstream_twitch_token'
const LS_USERNAME = 'blinkstream_twitch_username'
const LS_AVATAR = 'blinkstream_twitch_avatar'
const LS_CLIENT_ID = 'blinkstream_oauth_client_id'

async function fetchUserInfo(token) {
  try {
    let clientId = getHelixClientId()
    let username = null
    const cleanToken = token.replace(/^oauth:/i, '')

    let userId = null

    try {
      const valRes = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { 'Authorization': `OAuth ${cleanToken}` },
      })
      if (valRes.status === 401) return { invalid: true }
      if (valRes.ok) {
        const valData = await valRes.json()
        if (valData?.client_id) {
          clientId = valData.client_id
          try { localStorage.setItem(LS_CLIENT_ID, clientId) } catch {  }
        }
        if (valData?.login) username = valData.login
        if (valData?.user_id) {
          userId = valData.user_id
          try { localStorage.setItem('bs.twitch.viewer_userid', userId) } catch {  }
        }
      }
    } catch {  }

    const res = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': clientId || getHelixClientId(),
        'Authorization': `Bearer ${cleanToken}`,
      },
    })

    if (res.ok) {
      const data = await res.json()
      const userData = data?.data?.[0]
      if (userData) {
        const avatar = userData.profile_image_url || null
        username = userData.login || username || null
        const displayName = userData.display_name || null
        if (userData.id) {
          userId = userData.id
          try { localStorage.setItem('bs.twitch.viewer_userid', userId) } catch {  }
        }
        if (avatar) localStorage.setItem(LS_AVATAR, avatar)
        if (username) localStorage.setItem(LS_USERNAME, username)
        return { username, avatar, displayName, userId }
      }
    }

    if (username) {
      localStorage.setItem(LS_USERNAME, username)
      return { username, avatar: null, displayName: username, userId }
    }
  } catch {  }
  return null
}

async function openSystemBrowser(url) {
  const { safeOpenUrl } = await import('../utils/tauriEnv')
  try {
    safeOpenUrl(url, true)
  } catch (err) {
    console.error('[auth] No se pudo abrir el navegador:', err)
  }
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

        let token = await measureInvoke('get_secret', { key: 'twitch_token' })

        if (!token) {
          token = localStorage.getItem(LS_TOKEN) || ''
          if (token) {
            try {
              await measureInvoke('store_secret', { key: 'twitch_token', value: token })
              localStorage.removeItem(LS_TOKEN)
            } catch {  }
          }
        }

        if (token) {
          setCachedToken(token)
          const storedUser = localStorage.getItem(LS_USERNAME) || 'twitch_user'
          const storedAvatar = localStorage.getItem(LS_AVATAR) || null
          if (storedAvatar) setAvatar(storedAvatar)
          const storedUserId = localStorage.getItem('bs.twitch.viewer_userid') || null
          setUser({
            username: storedUser,
            userId: storedUserId,
            identities: storedUser ? [{ provider: 'twitch', identity_data: { login: storedUser } }] : [],
          })
          logEvent('auth', 'session.restored', { username: storedUser })

          const userInfo = await fetchUserInfo(token)
          if (userInfo?.invalid) {

            logEvent('auth', 'session.invalid', {})
          } else if (userInfo?.username && userInfo.username !== 'twitch_user') {
            if (userInfo.avatar) setAvatar(userInfo.avatar)
            setUser({
              username: userInfo.username,
              userId: userInfo.userId || storedUserId,
              identities: [{ provider: 'twitch', identity_data: { login: userInfo.username } }],
            })
            localStorage.setItem(LS_USERNAME, userInfo.username)
            window.dispatchEvent(new CustomEvent('blinkstream_auth_updated', { detail: { token, username: userInfo.username } }))
          }

          setLoading(false)
          setKeychainReady(true)
          return
        }
      } catch (err) { 
        logEvent('auth', 'session.restore.failed', { err: err?.message || String(err) })
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
        } catch {  }
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

        try {
          await measureInvoke('store_secret', { key: 'twitch_token', value: result.access_token })
        } catch {
          localStorage.setItem(LS_TOKEN, result.access_token)
        }
        setCachedToken(result.access_token)
        logEvent('auth', 'login.success', { username: result.username || 'unknown' })

        const userInfo = await fetchUserInfo(result.access_token).catch(() => null)
        const finalUsername = userInfo?.username && userInfo.username !== 'twitch_user' ? userInfo.username : (result.username || 'twitch_user')
        if (userInfo?.avatar) setAvatar(userInfo.avatar)

        localStorage.setItem(LS_USERNAME, finalUsername)
        setUser({
          username: finalUsername,
          identities: [{ provider: 'twitch', identity_data: { login: finalUsername } }],
        })

        window.dispatchEvent(new CustomEvent('blinkstream_auth_updated', { detail: { token: result.access_token, username: finalUsername } }))
        setAuthing(false)
        setError(null)
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setError(err.message || 'Error al conectar con Twitch')
        setAuthing(false)
        logEvent('auth', 'login.failed', { err: err.message || String(err) })
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
        await measureInvoke('store_secret', { key: 'twitch_token', value: cleanToken })
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
      await measureInvoke('delete_secret', { key: 'twitch_token' })
    } catch {  }
    localStorage.removeItem(LS_TOKEN)
    localStorage.removeItem(LS_USERNAME)
    localStorage.removeItem(LS_CLIENT_ID)
    logEvent('auth', 'logout', null)

    localStorage.removeItem(LS_AVATAR)

    clearBlinkstreamToken()
    setCachedToken(null)
    setUser(null)
    setError(null)
    setAuthing(false)
    setAvatar(null)
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
