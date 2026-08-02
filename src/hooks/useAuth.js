/**
 * @file Hook de autenticacion con Twitch (M-2 / Auditoria WT-20260628-01).
 * Maneja login OAuth via edge function, persistencia del token en keychain
 * (Tauri) o localStorage (fallback), y exposicion de la sesion al resto de la app.
 *
 * @typedef {object} TwitchUserInfo
 * @property {string|null} username      - login del usuario (lowercase)
 * @property {string|null} avatar        - URL de la imagen de perfil
 * @property {string|null} displayName   - nombre mostrado
 *
 * @typedef {object} AuthUser
 * @property {string} username
 * @property {Array<{provider: string, identity_data: {login: string}}>} identities
 *
 * @typedef {object} UseAuthReturn
 * @property {null}      session         - placeholder legacy, siempre null
 * @property {boolean}   loading         - true durante la carga inicial
 * @property {boolean}   authing         - true durante el flujo OAuth
 * @property {string|null} error         - ultimo error de auth
 * @property {AuthUser|null} user        - usuario actual o null
 * @property {string|null} avatar        - URL del avatar cacheado
 * @property {boolean}   keychainReady   - true si el keychain ya respondio
 * @property {boolean}   isLoggedIn      - user && token disponibles
 * @property {() => Promise<void>} login
 * @property {(token: string) => Promise<void>} loginWithToken
 * @property {() => Promise<void>} logout
 * @property {() => string|null} getTwitchToken
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { SUPABASE_URL, pollAuthToken, clearBlinkstreamToken } from '../utils/supabase'
import { APP_CLIENT_ID } from '../utils/twitch'
import { measureInvoke } from '../utils/perf'
import { logEvent } from '../utils/eventLog'

const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/twitch-auth`
const LS_TOKEN = 'blinkstream_twitch_token'
const LS_USERNAME = 'blinkstream_twitch_username'
const LS_AVATAR = 'blinkstream_twitch_avatar'

/**
 * Pide a Twitch los datos del usuario asociado a un token.
 * Si la peticion falla, devuelve null silenciosamente.
 *
 * @param {string} token - Bearer token de Twitch
 * @returns {Promise<TwitchUserInfo|null>}
 */
async function fetchUserInfo(token) {
  try {
    let clientId = APP_CLIENT_ID
    let username = null

    let res = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      // Consultar al validador oficial OAuth por si hay disparidad entre APP_CLIENT_ID y el Client-ID que emitió el token
      try {
        const valRes = await fetch('https://id.twitch.tv/oauth2/validate', {
          headers: { 'Authorization': `OAuth ${token}` },
        })
        if (valRes.status === 401) return { invalid: true }
        if (valRes.ok) {
          const valData = await valRes.json()
          if (valData?.client_id) clientId = valData.client_id
          if (valData?.login) username = valData.login
          res = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
              'Client-ID': clientId,
              'Authorization': `Bearer ${token}`,
            },
          })
        }
      } catch { /* ignore error del validador */ }
    }

    if (res.ok) {
      const data = await res.json()
      const userData = data?.data?.[0]
      if (userData) {
        const avatar = userData.profile_image_url || null
        username = userData.login || username || null
        const displayName = userData.display_name || null
        if (avatar) localStorage.setItem(LS_AVATAR, avatar)
        if (username) localStorage.setItem(LS_USERNAME, username)
        return { username, avatar, displayName }
      }
    }

    if (username) {
      localStorage.setItem(LS_USERNAME, username)
      return { username, avatar: null, displayName: username }
    }
  } catch { /* ignore */ }
  return null
}

/**
 * Abre una URL en el navegador del sistema.
 * En Tauri usa @tauri-apps/plugin-opener; en web puro usa safeOpenUrl
 * (helper que centraliza el fallback con noopener,noreferrer).
 *
 * @param {string} url
 * @returns {Promise<void>}
 */
async function openSystemBrowser(url) {
  const { safeOpenUrl } = await import('../utils/tauriEnv')
  try {
    safeOpenUrl(url, true)
  } catch (err) {
    console.error('[auth] No se pudo abrir el navegador:', err)
  }
}

/**
 * Hook principal de autenticacion. Lee el token persistido (keychain o
 * localStorage) al montar, expone login/logout, y mantiene un abortRef
 * para cancelar polls OAuth si el usuario cierra la sesion a mitad de
 * flujo.
 *
 * @returns {UseAuthReturn}
 */
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
        // 1\u00ba: Intentar cargar del keychain
        let token = await measureInvoke('get_secret', { key: 'twitch_token' })

        // 2\u00ba: Fallback a localStorage (migraci\u00f3n silenciosa)
        if (!token) {
          token = localStorage.getItem(LS_TOKEN) || ''
          if (token) {
            try {
              await measureInvoke('store_secret', { key: 'twitch_token', value: token })
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
          logEvent('auth', 'session.restored', { username })

          // WT-20260628-FIX: Consultar siempre a Twitch al inicializar para erradicar el placeholder 'twitch_user'
          // reemplazándolo por tu cuenta real de Twitch, o limpiando automáticamente el keychain de Windows
          // si el token que quedó persistido era de una versión de prueba o ha expirado (401).
          fetchUserInfo(token).then(userInfo => {
            if (userInfo && userInfo.username && userInfo.username !== 'twitch_user') {
              if (userInfo.avatar) setAvatar(userInfo.avatar)
              setUser({
                username: userInfo.username,
                identities: [{ provider: 'twitch', identity_data: { login: userInfo.username } }],
              })
              localStorage.setItem(LS_USERNAME, userInfo.username)
            } else if (userInfo && userInfo.invalid) {
              measureInvoke('delete_secret', { key: 'twitch_token' }).catch(() => {})
              localStorage.removeItem(LS_TOKEN)
              localStorage.removeItem(LS_USERNAME)
              localStorage.removeItem(LS_AVATAR)
              setCachedToken(null)
              setUser(null)
            }
          }).catch(() => {})
        }
      } catch (err) { /* fallback a localStorage */
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
          await measureInvoke('store_secret', { key: 'twitch_token', value: result.access_token })
        } catch {
          localStorage.setItem(LS_TOKEN, result.access_token)
        }
        setCachedToken(result.access_token)
        logEvent('auth', 'login.success', { username: result.username || 'unknown' })

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
          }
          // Caso contrario: ya tenemos el username de tempUsername o
          // el avatar solo — nada mas que hacer. (Anteriormente habia
          // un `else if` vacio que ESLint marcaba como empty block.)
        })

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
    } catch { /* ignore */ }
    localStorage.removeItem(LS_TOKEN)
    localStorage.removeItem(LS_USERNAME)
    logEvent('auth', 'logout', null)
    // S-2 fix: limpiar tambien el avatar cacheado para que no se filtre
    // PII (URL firmada de Twitch) al siguiente usuario de la misma sesion
    // del sistema operativo si el dispositivo es compartido.
    localStorage.removeItem(LS_AVATAR)
    // F-1 fix: limpiar tambien los tokens de Supabase emitidos por twitch-auth.
    // Si quedan cacheados, la proxima sesion podria usarlos con un username
    // distinto (si reusamos el mismo storage de la edge function).
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
