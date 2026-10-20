

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
let memorySession = null
let memoryRefresh = null
let authEpoch = 0
let secretQueue = Promise.resolve()
function secretOperation(command, args, epoch) {
  const next = secretQueue.catch(() => {}).then(async () => {
    if (epoch !== undefined && epoch !== authEpoch) return
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke(command, args)
  })
  secretQueue = next
  return next
}

export async function pollAuthToken(requestId, { signal, interval = 1500 } = {}) {
  const epoch = authEpoch
  const pollUrl = `${EDGE_FN}?fetch=${encodeURIComponent(requestId)}`

  await migrateLegacyRefreshToken().catch(() => {  })
  // Preserve the old Supabase owner when reauthorizing a pre-user_id account,
  // including after restart when only its refresh token is in the keychain.
  const continuityJwt = getBlinkstreamToken() || await refreshBlinkstreamToken()

  while (!signal?.aborted) {
    try {
      const res = await fetch(pollUrl, {
        signal,
        headers: continuityJwt ? { Authorization: `Bearer ${continuityJwt}` } : undefined,
      })
      if (!res.ok) {
        await sleep(interval, signal)
        continue
      }

      const data = await res.json()
      if (signal?.aborted || epoch !== authEpoch) return null
      if (data?.found && data?.access_token) {

        if (data.supabase_jwt) {
          await saveBlinkstreamToken({
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
    const legacyJwt = localStorage.getItem(LS_BLINKSTREAM_JWT)
    if (legacyJwt) {
      memorySession = { jwt: legacyJwt, expiresAt: Number(localStorage.getItem(LS_BLINKSTREAM_EXPIRES) || 0) }
      localStorage.removeItem(LS_BLINKSTREAM_JWT)
    }
    const { jwt, expiresAt } = memorySession || {}
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
    if (ls) {
      memoryRefresh = ls
      localStorage.removeItem(LS_BLINKSTREAM_REFRESH)
    }
  } catch {  }
  return memoryRefresh
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

export async function storeBlinkstreamRefreshToken(token, epoch = authEpoch) {
  if (epoch !== authEpoch) return false
  if (!token) return false
  memoryRefresh = token
  try { localStorage.removeItem(LS_BLINKSTREAM_REFRESH) } catch { /* Memory-only fallback. */ }
  if (isTauri()) {
    try {
      await secretOperation('store_secret', { key: KEYCHAIN_REFRESH_KEY, value: token }, epoch)

      try { localStorage.removeItem(LS_BLINKSTREAM_REFRESH) } catch {  }
      return true
    } catch {

    }
  }

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
  return getBlinkstreamRefreshTokenSync()
}

export async function clearBlinkstreamRefreshToken() {
  memoryRefresh = null
  if (isTauri()) {
    try {
      await secretOperation('delete_secret', { key: KEYCHAIN_REFRESH_KEY })
    } catch {  }
  }
  try { localStorage.removeItem(LS_BLINKSTREAM_REFRESH) } catch {  }
}

async function migrateLegacyRefreshToken() {
  const epoch = authEpoch
  if (!isTauri()) return
  try {
    const lsToken = localStorage.getItem(LS_BLINKSTREAM_REFRESH)
    if (!lsToken) return
    const { invoke } = await import('@tauri-apps/api/core')
    const existing = await invoke('get_secret', { key: KEYCHAIN_REFRESH_KEY })
    if (epoch !== authEpoch) return
    if (existing) {

      localStorage.removeItem(LS_BLINKSTREAM_REFRESH)
      return
    }
    await storeBlinkstreamRefreshToken(lsToken, epoch)
    localStorage.removeItem(LS_BLINKSTREAM_REFRESH)
  } catch {  }
}

async function saveBlinkstreamToken({ jwt, refreshToken, expiresIn, userId }) {
  const epoch = authEpoch
  try {
    const expiresAtMs = Date.now() + (Number(expiresIn) || 3600) * 1000
    memorySession = jwt ? { jwt, expiresAt: expiresAtMs } : null
    localStorage.removeItem(LS_BLINKSTREAM_JWT)
    localStorage.setItem(LS_BLINKSTREAM_EXPIRES, String(expiresAtMs))
    if (userId) localStorage.setItem(LS_BLINKSTREAM_USER_ID, userId)

    const clearFlag = await getClearAuthBrokenFlag()
    if (epoch !== authEpoch) return
    if (clearFlag) clearFlag()

    if (refreshToken) {
      await storeBlinkstreamRefreshToken(refreshToken, epoch)
    }
  } catch {  }
}

export function clearBlinkstreamToken() {
  authEpoch++
  memorySession = null
  memoryRefresh = null
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
  const epoch = authEpoch
  const refresh = await getBlinkstreamRefreshTokenAsync()
  if (!refresh) return null
  try {
    const res = await fetch(EDGE_FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }) })
    if (!res.ok) return null
    const data = await res.json()
    if (epoch !== authEpoch) return null
    if (data?.ok && data?.supabase_jwt) {
      await saveBlinkstreamToken({
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

export async function revokeBlinkstreamSessions(twitchAccessToken, { timeoutMs = 5000 } = {}) {
  const supabaseAccessToken = getBlinkstreamToken()
  const memorySnapshot = getBlinkstreamRefreshTokenSync()
  // Queue the read before clearBlinkstreamToken queues deletion. The native
  // refresh token is still available after restarting the application.
  const refreshSnapshot = memorySnapshot ? Promise.resolve(memorySnapshot)
    : isTauri() ? secretOperation('get_secret', { key: KEYCHAIN_REFRESH_KEY }).catch(() => null)
      : Promise.resolve(null)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const supabaseRefreshToken = await Promise.race([
      refreshSnapshot,
      new Promise(resolve => controller.signal.addEventListener('abort', () => resolve(null), { once: true })),
    ])
    if (controller.signal.aborted) return false
    if (!twitchAccessToken && !supabaseAccessToken && !supabaseRefreshToken) return true
    const res = await fetch(EDGE_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'logout',
        twitch_access_token: twitchAccessToken || undefined,
        supabase_access_token: supabaseAccessToken || undefined,
        supabase_refresh_token: supabaseRefreshToken || undefined,
      }),
      signal: controller.signal,
    })
    if (!res.ok) return false
    const data = await res.json()
    return data?.ok === true && data?.twitch_revoked === true && data?.supabase_revoked === true
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}
