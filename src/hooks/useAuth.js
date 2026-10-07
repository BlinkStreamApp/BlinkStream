

import { useState, useEffect, useCallback, useRef } from 'react'
import { SUPABASE_URL, pollAuthToken, clearBlinkstreamToken } from '../utils/supabase'
import { getHelixClientId } from '../utils/twitch'
import { measureInvoke } from '../utils/perf'
import { logEvent } from '../utils/eventLog'
import { archiveLegacyFavorites } from './useFavoriteChannels'

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
        }
        if (valData?.login) username = valData.login
        if (valData?.user_id) {
          userId = valData.user_id
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
        }
        return { username, avatar, displayName, userId, clientId }
      }
    }

    if (username) {
      return { username, avatar: null, displayName: username, userId, clientId }
    }
  } catch {  }
  return null
}

function persistUserInfo(info) {
  if (!info) return
  if (info.username) localStorage.setItem(LS_USERNAME, info.username)
  if (info.avatar) localStorage.setItem(LS_AVATAR, info.avatar)
  if (info.clientId) localStorage.setItem(LS_CLIENT_ID, info.clientId)
  if (info.userId) localStorage.setItem('bs.twitch.viewer_userid', info.userId)
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
  const sessionVersion = useRef(null)
  const secretQueue = useRef(Promise.resolve())
  const writeSecret = useCallback((command, args) => {
    // A slow login write must finish before logout deletes its credentials.
    const next = secretQueue.current.catch(() => {}).then(() => measureInvoke(command, args))
    secretQueue.current = next
    return next
  }, [])

  useEffect(() => {
    const version = {}
    sessionVersion.current = version
    const current = () => version === sessionVersion.current
    const init = async () => {
      // Capture the legacy owner before validation can replace the stored login.
      archiveLegacyFavorites()
      try {

        let token = await measureInvoke('get_secret', { key: 'twitch_token' })
        if (!current()) return

        if (!token) {
          token = localStorage.getItem(LS_TOKEN) || ''
          if (token) {
            try {
              await writeSecret('store_secret', { key: 'twitch_token', value: token })
              if (!current()) return
              localStorage.removeItem(LS_TOKEN)
            } catch {  }
          }
        }

        if (!current()) return
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
          if (!current()) return
          if (userInfo?.invalid) {

            logEvent('auth', 'session.invalid', {})
          } else if (userInfo?.username && userInfo.username !== 'twitch_user') {
            persistUserInfo(userInfo)
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
        if (!current()) return
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
      sessionVersion.current = null
      abortRef.current?.abort()
    }
  }, [writeSecret])

  const login = useCallback(async () => {
    const version = {}
    sessionVersion.current = version
    const current = () => version === sessionVersion.current
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
      if (!current()) return

      if (result?.access_token) {

        try {
          await writeSecret('store_secret', { key: 'twitch_token', value: result.access_token })
        } catch {
          if (!current()) return
          localStorage.setItem(LS_TOKEN, result.access_token)
        }
        if (!current()) return
        setCachedToken(result.access_token)
        logEvent('auth', 'login.success', { username: result.username || 'unknown' })

        const userInfo = await fetchUserInfo(result.access_token).catch(() => null)
        if (!current()) return
        persistUserInfo(userInfo)
        const finalUsername = userInfo?.username && userInfo.username !== 'twitch_user' ? userInfo.username : (result.username || 'twitch_user')
        if (userInfo?.avatar) setAvatar(userInfo.avatar)

        localStorage.setItem(LS_USERNAME, finalUsername)
        setUser({
          username: finalUsername,
          userId: userInfo?.userId || null,
          identities: [{ provider: 'twitch', identity_data: { login: finalUsername } }],
        })

        window.dispatchEvent(new CustomEvent('blinkstream_auth_updated', { detail: { token: result.access_token, username: finalUsername } }))
        setAuthing(false)
        setError(null)
      }
    } catch (err) {
      if (!current()) return
      if (err?.name !== 'AbortError') {
        setError(err.message || 'Error al conectar con Twitch')
        setAuthing(false)
        logEvent('auth', 'login.failed', { err: err.message || String(err) })
      }
    }

    if (current()) setAuthing(false)
  }, [writeSecret])

  const loginWithToken = useCallback(async (token) => {
    if (!token) return
    const version = {}
    sessionVersion.current = version
    const current = () => version === sessionVersion.current
    abortRef.current?.abort()
    setAuthing(true)
    setError(null)

    const cleanToken = token.replace(/^oauth:/i, '')
    try {
      const userInfo = await fetchUserInfo(cleanToken)
      if (!current()) return
      if (!userInfo?.username) throw new Error('Token inválido')

      const username = userInfo.username

      try {
        await writeSecret('store_secret', { key: 'twitch_token', value: cleanToken })
      } catch {
        if (!current()) return
        localStorage.setItem(LS_TOKEN, cleanToken)
      }
      if (!current()) return
      persistUserInfo(userInfo)
      setCachedToken(cleanToken)
      localStorage.setItem(LS_USERNAME, username)
      if (userInfo.avatar) setAvatar(userInfo.avatar)

      setUser({
        username,
        userId: userInfo.userId || null,
        identities: [{ provider: 'twitch', identity_data: { login: username } }],
      })
      setAuthing(false)
      setError(null)
    } catch (err) {
      if (!current()) return
      setError(err.message || 'Error al validar token')
      setAuthing(false)
    }
  }, [writeSecret])

  const logout = useCallback(async () => {
    sessionVersion.current = null
    abortRef.current?.abort()
    archiveLegacyFavorites()
    localStorage.removeItem(LS_TOKEN)
    localStorage.removeItem(LS_USERNAME)
    localStorage.removeItem(LS_CLIENT_ID)
    logEvent('auth', 'logout', null)

    localStorage.removeItem(LS_AVATAR)
    localStorage.removeItem('bs.twitch.viewer_userid')
    localStorage.removeItem('blinkstream_recent')
    sessionStorage.removeItem('blinkstream_live_status_v1')
    sessionStorage.removeItem('blinkstream_logos_v1')

    clearBlinkstreamToken()
    setCachedToken(null)
    setUser(null)
    setError(null)
    setAuthing(false)
    setAvatar(null)
    setLoading(false)
    try {
      await writeSecret('delete_secret', { key: 'twitch_token' })
    } catch {  }
  }, [writeSecret])

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
