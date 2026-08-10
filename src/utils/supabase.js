

import { isTauri } from './tauriEnv'

let _clearAuthBrokenFlag = null
async function getClearAuthBrokenFlag() {
  if (_clearAuthBrokenFlag) return _clearAuthBrokenFlag
  try {
    const mod = await import('./favoritesSync')
    _clearAuthBrokenFlag = mod.clearAuthBrokenFlag
    return _clearAuthBrokenFlag
  } catch {
    return null
  }
}

export const SUPABASE_URL = 'https://oncbojnqxpxctwnhehau.supabase.co'

const EDGE_FN = `${SUPABASE_URL}/functions/v1/twitch-auth`

export const LS_BLINKSTREAM_JWT = 'blinkstream_supabase_jwt'
export const LS_BLINKSTREAM_REFRESH = 'blinkstream_supabase_refresh'
export const LS_BLINKSTREAM_EXPIRES = 'blinkstream_supabase_expires'
export const LS_BLINKSTREAM_USER_ID = 'blinkstream_supabase_user_id'

const KEYCHAIN_REFRESH_KEY = 'blinkstream_refresh_token'

export async function pollAuthToken(requestId, { signal, interval = 1500 } = {}) {
  const pollUrl = `${EDGE_FN}?fetch=${encodeURIComponent(requestId)}`

  migrateLegacyRefreshToken().catch(() => {  })

  while (!signal?.aborted) {
    try {
      const res = await fetch(pollUrl)
      if (!res.ok) {
        await sleep(interval, signal)
        continue
      }

      const data = await res.json()
      if (data?.found && data?.access_token) {

        if (data.supabase_jwt) {
          saveBlinkstreamToken({
            jwt: data.supabase_jwt,
            refreshToken: data.supabase_refresh_token,
            expiresIn: data.supabase_expires_in,
            userId: data.supabase_user_id,
          })
        }
        return { access_token: data.access_token, username: data.username || 'twitch_user' }
      }
    } catch (pollErr) {

      void pollErr
    }

    await sleep(interval, signal)
  }
  return null
}

function sleep(ms, signal) {
  return new Promise(r => {
    const timer = setTimeout(r, ms)
    if (signal) {
      signal.addEventListener('abort', () => { clearTimeout(timer); r(); }, { once: true })
    }
  })
}

export function getBlinkstreamToken() {
  try {
    const jwt = localStorage.getItem(LS_BLINKSTREAM_JWT)
    const expiresAt = Number(localStorage.getItem(LS_BLINKSTREAM_EXPIRES) || 0)
    if (!jwt) return null

    if (Date.now() >= expiresAt - 60_000) return null
    return jwt
  } catch {
    return null
  }
}

export function getBlinkstreamRefreshTokenSync() {
  try {
    const ls = localStorage.getItem(LS_BLINKSTREAM_REFRESH)
    if (ls) return ls
  } catch {  }
  return null
}

export async function getBlinkstreamRefreshTokenAsync() {

  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const fromKeychain = await invoke('get_secret', { key: KEYCHAIN_REFRESH_KEY })
      if (fromKeychain) return fromKeychain
    } catch {  }
  }

  return getBlinkstreamRefreshTokenSync()
}

export async function storeBlinkstreamRefreshToken(token) {
  if (!token) return false
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('store_secret', { key: KEYCHAIN_REFRESH_KEY, value: token })

      try { localStorage.removeItem(LS_BLINKSTREAM_REFRESH) } catch {  }
      return true
    } catch {

    }
  }

  try { localStorage.setItem(LS_BLINKSTREAM_REFRESH, token) } catch {  }
  return false
}

export async function readBlinkstreamRefreshToken() {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const fromKeychain = await invoke('get_secret', { key: KEYCHAIN_REFRESH_KEY })
      if (fromKeychain) return fromKeychain
    } catch {  }
  }
  try { return localStorage.getItem(LS_BLINKSTREAM_REFRESH) || null } catch { return null }
}

export async function clearBlinkstreamRefreshToken() {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('delete_secret', { key: KEYCHAIN_REFRESH_KEY })
    } catch {  }
  }
  try { localStorage.removeItem(LS_BLINKSTREAM_REFRESH) } catch {  }
}

async function migrateLegacyRefreshToken() {
  if (!isTauri()) return
  try {
    const lsToken = localStorage.getItem(LS_BLINKSTREAM_REFRESH)
    if (!lsToken) return
    const { invoke } = await import('@tauri-apps/api/core')
    const existing = await invoke('get_secret', { key: KEYCHAIN_REFRESH_KEY })
    if (existing) {

      localStorage.removeItem(LS_BLINKSTREAM_REFRESH)
      return
    }
    await invoke('store_secret', { key: KEYCHAIN_REFRESH_KEY, value: lsToken })
    localStorage.removeItem(LS_BLINKSTREAM_REFRESH)
  } catch {  }
}

async function saveBlinkstreamToken({ jwt, refreshToken, expiresIn, userId }) {
  try {
    if (jwt) {
      localStorage.setItem(LS_BLINKSTREAM_JWT, jwt)
    } else {
      localStorage.removeItem(LS_BLINKSTREAM_JWT)
    }

    const expiresAtMs = Date.now() + (Number(expiresIn) || 3600) * 1000
    localStorage.setItem(LS_BLINKSTREAM_EXPIRES, String(expiresAtMs))
    if (userId) localStorage.setItem(LS_BLINKSTREAM_USER_ID, userId)

    const clearFlag = await getClearAuthBrokenFlag()
    if (clearFlag) clearFlag()

    if (refreshToken) {
      await storeBlinkstreamRefreshToken(refreshToken)
    }
  } catch {  }
}

export function clearBlinkstreamToken() {
  try {
    localStorage.removeItem(LS_BLINKSTREAM_JWT)
    localStorage.removeItem(LS_BLINKSTREAM_REFRESH)
    localStorage.removeItem(LS_BLINKSTREAM_EXPIRES)
    localStorage.removeItem(LS_BLINKSTREAM_USER_ID)
  } catch {  }

  clearBlinkstreamRefreshToken().catch(() => {  })

  getClearAuthBrokenFlag().then(fn => { if (fn) fn() }).catch(() => {  })
}

export async function refreshBlinkstreamToken() {

  const refresh = await getBlinkstreamRefreshTokenAsync()
  if (!refresh) return null
  try {
    const res = await fetch(`${EDGE_FN}?refresh=${encodeURIComponent(refresh)}`)
    if (!res.ok) return null
    const data = await res.json()
    if (data?.ok && data?.supabase_jwt) {
      saveBlinkstreamToken({
        jwt: data.supabase_jwt,
        refreshToken: data.supabase_refresh_token,
        expiresIn: data.supabase_expires_in,
        userId: null,
      })
      return data.supabase_jwt
    }
    return null
  } catch {
    return null
  }
}
