

import { measureFetch } from './perf'
import { AppError, ErrorCode, logError, formatUserMessage } from './errors'
import { logEvent } from './eventLog'
import { isTauri } from './tauriEnv'

export { isTauri }

export const TWITCH_LOGIN_REGEX = /^[a-z0-9_]{3,25}$/

export function isValidTwitchLogin(channel) {
  if (typeof channel !== 'string') return false
  return TWITCH_LOGIN_REGEX.test(channel.toLowerCase())
}

export function secureRandomInt(max) {
  if (typeof max !== 'number' || max <= 0 || !Number.isFinite(max)) {
    throw new RangeError('secureRandomInt: max must be a positive finite number')
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {

    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return buf[0] % Math.floor(max)
  }
  return Math.floor(Math.random() * max)
}

export function sanitizeChannelForGraphQL(channel) {
  if (typeof channel !== 'string') return null
  const lower = channel.toLowerCase().trim()
  if (!isValidTwitchLogin(lower)) return null
  return lower
}

function ok(value) {
  return { success: true, value }
}

function err(code, message, meta = {}, silent = false) {
  const codeStr = code || ErrorCode.MOD_ACTION_FAILED
  const ae = new AppError(codeStr, message, meta)
  if (!silent && !meta?.silent) {
    logError(ae, meta)
  }
  return { success: false, error: ae }
}

async function helixFetch(url, opts = {}, meta = {}, signal) {
  try {
    const headers = await getHeaders()

    const timeoutSignal = safeTimeout(5000)
    let combinedSignal = timeoutSignal
    if (signal) {
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
        combinedSignal = AbortSignal.any([timeoutSignal, signal])
      } else if (!timeoutSignal.aborted && !signal.aborted) {

        const ctrl = new AbortController()
        const onAbort = () => ctrl.abort()
        timeoutSignal.addEventListener('abort', onAbort, { once: true })
        signal.addEventListener('abort', onAbort, { once: true })
        combinedSignal = ctrl.signal
      }
    }
    const finalOpts = {
      ...opts,
      headers: { ...headers, ...(opts.headers || {}) },
      signal: combinedSignal,
    }
    const res = await measureFetch(url, finalOpts)
    const status = res.status
    if (!res.ok) {

      const msg =
        status === 403 ? 'Sin permisos para esta accion' :
        status === 404 ? 'Recurso no encontrado' :
        status === 429 ? 'Rate limit de Twitch alcanzado' :
        status >= 500 ? 'Error del servidor de Twitch' :
        `Helix fallo (HTTP ${status})`
      return err(ErrorCode.MOD_ACTION_FAILED, msg, { ...meta, url, status })
    }

    if (status === 204 || (opts.method || 'GET').toUpperCase() === 'DELETE') {
      return ok( (null))
    }
    const data = await res.json().catch(() => null)
    return ok( (data))
  } catch (e) {

    return err(
      ErrorCode.MOD_ACTION_FAILED,
      e?.name === 'AbortError' ? 'Timeout (5s) llamando a Twitch' : (e?.message || 'Fallo de red'),
      { ...meta, url, errName: e?.name },
    )
  }
}

const _APP_FROM_ENV = import.meta.env.VITE_TWITCH_APP_CLIENT_ID?.trim()
const _PUBLIC_FROM_ENV = import.meta.env.VITE_TWITCH_CLIENT_ID?.trim()
export const APP_CLIENT_ID = _APP_FROM_ENV || _PUBLIC_FROM_ENV || ''

// ALLOWED-REGRESSION: Twitch GQL solo acepta first-party Client ID (kimne78...); APP token NO funciona en gql.twitch.tv
export const PUBLIC_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko' // ALLOWED-REGRESSION: Twitch GQL first-party Client ID

export function getHelixClientId() {
  const oauthClientId = typeof localStorage !== 'undefined' ? localStorage.getItem('blinkstream_oauth_client_id') : null
  if (oauthClientId && oauthClientId.trim() !== '') return oauthClientId.trim()
  if (APP_CLIENT_ID && APP_CLIENT_ID.trim() !== '') return APP_CLIENT_ID.trim()
  return PUBLIC_CLIENT_ID
}

if (!_APP_FROM_ENV && !_PUBLIC_FROM_ENV) {
  console.warn(
    '%c[BlinkStream] VITE_TWITCH_CLIENT_ID no configurado — Helix usará el Client-ID descubierto del token OAuth o el de respaldo.',
    'color:#f59e0b;font-weight:bold',
    '\n  https://dev.twitch.tv/console/apps',
  )
}

function safeTimeout(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
}

export async function getStoredToken() {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const token = await invoke('get_secret', { key: 'twitch_token' })
       if (token) return token.replace(/^oauth:/i, '')
    } catch {  }
  }
  try {
    const token = localStorage.getItem('blinkstream_twitch_token') || null
    return token ? token.replace(/^oauth:/i, '') : null
  } catch { return null }
}

export async function clearStoredToken() {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('delete_secret', { key: 'twitch_token' })
    } catch {  }
  }
  try {
    localStorage.removeItem('blinkstream_twitch_token')
    localStorage.removeItem('blinkstream_twitch_username')
    localStorage.removeItem('blinkstream_oauth_client_id')
  } catch {  }
}

export async function validateToken(token) {
  if (!token) return false
  const cleanToken = token.replace(/^oauth:/i, '')
  try {
    const valRes = await measureFetch('https://id.twitch.tv/oauth2/validate', {
      headers: { 'Authorization': `OAuth ${cleanToken}` },
      signal: safeTimeout(5000),
    })
    if (valRes.status === 401) return false
    if (valRes.ok) {
      const data = await valRes.json()
      if (data?.client_id) {
        try { localStorage.setItem('blinkstream_oauth_client_id', data.client_id) } catch {  }
      }
      return true
    }
  } catch {  }

  try {
    const res = await measureFetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': getHelixClientId(),
        'Authorization': `Bearer ${cleanToken}`,
      },
      signal: safeTimeout(5000),
    })
    return res.ok
  } catch { return false }
}

export async function getHeaders() {
  const token = await getStoredToken()
  const cleanToken = token?.replace(/^oauth:/i, '') || null
  const headers = {
    'Client-ID': cleanToken ? getHelixClientId() : PUBLIC_CLIENT_ID,
  }
  if (cleanToken) {
    headers['Authorization'] = `Bearer ${cleanToken}`
  }
  return headers
}

export function getGqlHeaders() {
  return {
    'Client-ID': PUBLIC_CLIENT_ID,
    'Content-Type': 'application/json',
  }
}

export async function getAccessToken(channel, type = 'stream', customSignal = null) {
  if (customSignal?.aborted) throw new Error('Aborted')
  const isVod = type === 'video'
  const sanitized = isVod ? String(channel).replace(/[^0-9]/g, '') : sanitizeChannelForGraphQL(channel)
  if (!sanitized) throw new Error('GQL: canal/VOD invalido')
  const query = isVod
    ? 'query($id: ID!) { video(id: $id) { playbackAccessToken(params: {platform: "web", playerBackend: "mediaplayer", playerType: "site"}) { value signature } } }'
    : 'query($channelName: String!) { streamPlaybackAccessToken(channelName: $channelName, params: {platform: "web", playerBackend: "mediaplayer", playerType: "site"}) { value signature } }'
  const variables = isVod ? { id: sanitized } : { channelName: sanitized }
  const fieldName = isVod ? 'playbackAccessToken' : 'streamPlaybackAccessToken'
  const gqlRes = await measureFetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Client-ID': PUBLIC_CLIENT_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: customSignal || safeTimeout(8000),
  })
  if (!gqlRes.ok) throw new Error('GQL access token failed')
  const gqlData = await gqlRes.json()
  const at = isVod ? gqlData?.data?.video?.[fieldName] : gqlData?.data?.streamPlaybackAccessToken
  if (!at?.value || !at?.signature) throw new Error('GQL: no token')
  return { value: at.value, signature: at.signature }
}

export async function getDirectStreamUrl(channel, quality = '1080p60', customSignal = null) {
  if (customSignal?.aborted) throw new Error('Aborted')
  const at = await getAccessToken(channel, 'stream', customSignal)
  const token = at.value; const sig = at.signature

  const params = new URLSearchParams({
    player: 'twitchweb',
    token: token,
    sig: sig,
    allow_audio_only: 'true',
    allow_source: 'true',
    type: 'any',

    p: String(secureRandomInt(1e7)),
  })

  const usherUrl = `https://usher.ttvnw.net/api/channel/hls/${encodeURIComponent(channel)}.m3u8?${params}`
  const res = await measureFetch(usherUrl, {
    headers: { 'Client-ID': PUBLIC_CLIENT_ID },
    signal: customSignal || safeTimeout(10000),
  })
  if (!res.ok) throw new Error(`Usher: HTTP ${res.status}`)

  if (quality === 'audio_only' || quality === 'best' || quality === 'chunked') {
    return res.url
  }

  const m3u8 = await res.text()
  const lines = m3u8.split('\n')

  const variants = [quality]
  const match = quality.match(/^(\d+)p\d+$/)
  if (match) {
    variants.push(match[1] + 'p')
    if (!variants.includes(match[1])) variants.push(match[1])
  }

  for (const variant of variants) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(variant) && lines[i].includes('NAME="')) {
        for (let j = i + 1; j < lines.length; j++) {
          if (!lines[j].startsWith('#') && lines[j].trim()) {
            return lines[j].trim()
          }
        }
      }
    }
  }

  return res.url
}

export async function getStreamInfo(channel, customSignal = null) {
  if (customSignal?.aborted) return null
  const headers = await getHeaders()
  const res = await measureFetch(
    `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channel)}`,
    { headers, signal: customSignal || safeTimeout(5000) }
  )
  if (!res.ok) return null
  const data = await res.json()
  return data.data?.[0] || null
}

export async function searchChannels(query) {
  const headers = await getHeaders()
  const res = await measureFetch(
    `https://api.twitch.tv/helix/search/channels?query=${encodeURIComponent(query)}&first=8`,
    { headers, signal: safeTimeout(5000) }
  )
  if (!res.ok) return []
  const data = await res.json()
  let results = (data.data || []).map(ch => ({
    login: ch.broadcaster_login,
    displayName: ch.display_name,
    avatar: ch.thumbnail_url,
    isLive: ch.is_live,
    game: ch.game_name,
    viewers: ch.viewer_count,
  }))
  results.sort((a, b) => (b.isLive ? 1 : 0) - (a.isLive ? 1 : 0))
  return results
}

export async function getUserIdByLogin(login) {
  if (!login || typeof login !== 'string') return null
  const cacheKey = `bs.twitch.userid.${login.toLowerCase()}`
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) return cached
  } catch {  }

  const headers = await getHeaders()
  try {
    const res = await measureFetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login.toLowerCase())}`,
      { headers, signal: safeTimeout(5000) },
    )
    if (!res.ok) return null
    const data = await res.json()
    const id = data?.data?.[0]?.id
    if (id) {
      try { localStorage.setItem(cacheKey, id) } catch {  }
    }
    return id || null
  } catch { return null }
}

const CP_TIMEOUT_MS = 5000

const APP_TOKEN_RENEW_BEFORE_MS = 5 * 60 * 1000

function _cpResult(ok, data = undefined, error = undefined, code = undefined) {
  return { ok, data, error, code }
}

let _appTokenCache = null

function _readAppTokenCache() {
  return _appTokenCache
}

function _writeAppTokenCache(token, expiresAt) {
  _appTokenCache = { token, expiresAt }
}

export async function getAppToken() {

  const cached = _readAppTokenCache()
  if (cached && cached.expiresAt > Date.now() + APP_TOKEN_RENEW_BEFORE_MS) {
    return _cpResult(true, cached.token)
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    if (isTauri()) {
      const data = await invoke('get_app_token')
      if (data?.token && typeof data.expiresAt === 'number') {
        _writeAppTokenCache(data.token, data.expiresAt)
        return _cpResult(true, data.token)
      }
      const err = new AppError(ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED, 'Tauri get_app_token no devolvio un token valido', { action: 'get_app_token' })
      logError(err, { context: 'channel-points', action: 'get_app_token' })
      return _cpResult(false, undefined, formatUserMessage(err), ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED)
    }
  } catch (e) {

    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED,
      `Tauri invoke fallo: ${e?.message || 'unknown'}. Si acabas de instalar la app, asegurate de que WebView2 Runtime este instalado.`,
      { action: 'get_app_token', originalErrName: e?.name, originalErrMsg: e?.message, originalStack: e?.stack?.substring(0, 200) },
    )
    logError(wrapped, { context: 'channel-points', action: 'get_app_token' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED)
  }

  if (import.meta.env.PROD && !isTauri()) {
    const err = new AppError(
      ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED,
      'getAppToken via web no esta disponible en produccion; usa el desktop app',
      { action: 'get_app_token_web_blocked' },
    )
    logError(err, { context: 'channel-points', action: 'get_app_token' })
    return _cpResult(false, undefined, formatUserMessage(err), ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED)
  }

  const clientId = import.meta.env.VITE_TWITCH_APP_CLIENT_ID?.trim()
  const clientSecret = import.meta.env.VITE_TWITCH_APP_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    const err = new AppError(
      ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED,
      'Faltan VITE_TWITCH_APP_CLIENT_ID / VITE_TWITCH_APP_CLIENT_SECRET en el entorno web',
      { action: 'get_app_token_web' },
    )
    logError(err, { context: 'channel-points', action: 'get_app_token' })
    return _cpResult(false, undefined, formatUserMessage(err), ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED)
  }

  const _secretLen = clientSecret ? clientSecret.length : 0
  console.warn(
    `%c[BlinkStream] ⚠️ getAppToken via .env (web/dev). client_secret en bundle (len=${_secretLen}). En produccion usa Tauri.`,
    'color:#f59e0b;font-weight:bold',
  )

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    })
    const res = await measureFetch(`https://id.twitch.tv/oauth2/token?${params}`, {
      method: 'POST',
      signal: safeTimeout(CP_TIMEOUT_MS),
    })
    if (!res.ok) {
      const err = new AppError(
        ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED,
        `Twitch token endpoint HTTP ${res.status}`,
        { action: 'get_app_token_web' },
      )
      logError(err, { context: 'channel-points', action: 'get_app_token' })
      return _cpResult(false, undefined, formatUserMessage(err), ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED)
    }
    const data = await res.json()
    if (!data?.access_token || !data?.expires_in) {
      const err = new AppError(
        ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED,
        'Twitch token endpoint sin access_token/expires_in',
        { action: 'get_app_token_web' },
      )
      logError(err, { context: 'channel-points', action: 'get_app_token' })
      return _cpResult(false, undefined, formatUserMessage(err), ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED)
    }

    const expiresAt = Date.now() + (Number(data.expires_in) * 1000)
    _writeAppTokenCache(data.access_token, expiresAt)
    return _cpResult(true, data.access_token)
  } catch (e) {
    logError(e, { context: 'channel-points', action: 'get_app_token' })
    return _cpResult(false, undefined, formatUserMessage(e), ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED)
  }
}

export async function getCustomRewards(broadcasterId, manageToken) {
  if (!broadcasterId) return _cpResult(false, undefined, 'broadcasterId requerido', ErrorCode.CHANNEL_POINTS_LIST_FAILED)
  const tokenRes = manageToken ? _cpResult(true, manageToken) : await getAppToken()
  if (!tokenRes.ok) return _cpResult(false, undefined, tokenRes.error, tokenRes.code)

  try {
    const res = await measureFetch(
      `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(broadcasterId)}`,
      {
        headers: {
          'Client-ID': getHelixClientId(),
          'Authorization': `Bearer ${tokenRes.data}`,
        },
        signal: safeTimeout(CP_TIMEOUT_MS),
      },
    )
    if (!res.ok) {
      const err = new AppError(ErrorCode.CHANNEL_POINTS_LIST_FAILED, `Twitch HTTP ${res.status}`, { action: 'list_rewards' })
      logError(err, { context: 'channel-points', action: 'list_rewards' })
      return _cpResult(false, undefined, formatUserMessage(err), ErrorCode.CHANNEL_POINTS_LIST_FAILED)
    }
    const data = await res.json()
    return _cpResult(true, data?.data || [])
  } catch (e) {

    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_LIST_FAILED,
      e?.message || 'Error al cargar recompensas del canal',
      { action: 'list_rewards', originalErrName: e?.name, originalErrMsg: e?.message },
    )
    logError(wrapped, { context: 'channel-points', action: 'list_rewards' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_LIST_FAILED)
  }
}

export async function getCustomRewardsGQL(channelLogin, _userToken) {
  void _userToken
  if (!channelLogin) return _cpResult(false, undefined, 'channelLogin requerido', ErrorCode.CHANNEL_POINTS_LIST_FAILED)
  try {
    const headers = {
      'Client-ID': PUBLIC_CLIENT_ID,
      'Content-Type': 'application/json',
    }

    const bodyStr = JSON.stringify({
      operationName: 'ChannelPointsContext',
      variables: { channelLogin },
      query: `
        query ChannelPointsContext($channelLogin: String!) {
          channel(name: $channelLogin) {
            id
            displayName
            self {
              communityPoints {
                balance
              }
            }
            communityPointsSettings {
              customRewards {
                id
                title
                prompt
                cost
                isEnabled
                isPaused
                isInStock
                backgroundColor
                defaultImage { url }
                image { url }
              }
            }
          }
        }
      `,
    })

    const res = await measureFetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers,
      body: bodyStr,
      signal: safeTimeout(CP_TIMEOUT_MS),
    })
    if (!res.ok) return _cpResult(false, undefined, `Twitch GQL HTTP ${res.status}`, ErrorCode.CHANNEL_POINTS_LIST_FAILED)
    const json = await res.json()
    const channel = json?.data?.channel
    if (!channel) {

      const resVal = _cpResult(true, [])
      resVal.balance = null
      return resVal
    }

    const rawRewards = channel.communityPointsSettings?.customRewards || []
    const balance = channel.self?.communityPoints?.balance ?? null

    const rewards = rawRewards.map(r => {
      const img = r.image || r.defaultImage || {}
      return {
        id: r.id,
        title: r.title,
        prompt: r.prompt || '',
        cost: r.cost || 0,
        is_enabled: r.isEnabled,
        is_in_stock: r.isInStock ?? true,
        is_paused: r.isPaused,
        background_color: r.backgroundColor || '#9146ff',
        image: {
          url_1x: img.url || img.url1x,
          url_2x: img.url ? img.url.replace('-1.png', '-2.png') : (img.url2x || img.url),
          url_4x: img.url ? img.url.replace('-1.png', '-4.png') : (img.url4x || img.url),
        },
      }
    })

    const resVal = _cpResult(true, rewards)
    resVal.balance = balance
    return resVal
  } catch (e) {
    return _cpResult(false, undefined, e.message || 'Error GQL channel points', ErrorCode.CHANNEL_POINTS_LIST_FAILED)
  }
}

export async function getCustomReward(broadcasterId, rewardId, manageToken) {
  if (!broadcasterId || !rewardId) return _cpResult(false, undefined, 'broadcasterId y rewardId requeridos', ErrorCode.CHANNEL_POINTS_LIST_FAILED)
  const tokenRes = manageToken ? _cpResult(true, manageToken) : await getAppToken()
  if (!tokenRes.ok) return _cpResult(false, undefined, tokenRes.error, tokenRes.code)

  try {
    const res = await measureFetch(
      `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(broadcasterId)}&id=${encodeURIComponent(rewardId)}`,
      {
        headers: {
          'Client-ID': getHelixClientId(),
          'Authorization': `Bearer ${tokenRes.data}`,
        },
        signal: safeTimeout(CP_TIMEOUT_MS),
      },
    )
    if (!res.ok) {
      const err = new AppError(ErrorCode.CHANNEL_POINTS_LIST_FAILED, `Twitch HTTP ${res.status}`, { action: 'get_reward' })
      logError(err, { context: 'channel-points', action: 'get_reward' })
      return _cpResult(false, undefined, formatUserMessage(err), ErrorCode.CHANNEL_POINTS_LIST_FAILED)
    }
    const data = await res.json()
    const reward = data?.data?.[0]
    if (!reward) return _cpResult(false, undefined, 'Recompensa no encontrada', ErrorCode.CHANNEL_POINTS_LIST_FAILED)
    return _cpResult(true, reward)
  } catch (e) {

    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_LIST_FAILED,
      e?.message || 'Error al obtener la recompensa',
      { action: 'get_reward', originalErrName: e?.name, originalErrMsg: e?.message },
    )
    logError(wrapped, { context: 'channel-points', action: 'get_reward' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_LIST_FAILED)
  }
}

export async function createCustomReward(broadcasterId, rewardData, manageToken) {
  if (!broadcasterId || !rewardData?.title || typeof rewardData?.cost !== 'number') {
    return _cpResult(false, undefined, 'Faltan campos requeridos (title, cost)', ErrorCode.CHANNEL_POINTS_CREATE_FAILED)
  }
  const tokenRes = manageToken ? _cpResult(true, manageToken) : await getAppToken()
  if (!tokenRes.ok) return _cpResult(false, undefined, tokenRes.error, tokenRes.code)

  const params = new URLSearchParams()
  params.set('broadcaster_id', broadcasterId)
  params.set('title', rewardData.title)
  params.set('cost', String(rewardData.cost))
  if (rewardData.prompt != null) params.set('prompt', String(rewardData.prompt))
  if (rewardData.background_color) params.set('background_color', rewardData.background_color)
  if (rewardData.is_enabled != null) params.set('is_enabled', String(rewardData.is_enabled))
  if (rewardData.is_user_input_required != null) params.set('is_user_input_required', String(rewardData.is_user_input_required))
  if (rewardData.max_per_stream != null) params.set('max_per_stream', String(rewardData.max_per_stream))
  if (rewardData.max_per_user_per_stream != null) params.set('max_per_user_per_stream', String(rewardData.max_per_user_per_stream))
  if (rewardData.global_cooldown_seconds != null) params.set('global_cooldown_seconds', String(rewardData.global_cooldown_seconds))
  if (rewardData.is_max_per_stream_enabled != null) params.set('is_max_per_stream_enabled', String(rewardData.is_max_per_stream_enabled))
  if (rewardData.is_global_cooldown_enabled != null) params.set('is_global_cooldown_enabled', String(rewardData.is_global_cooldown_enabled))

  try {
    const res = await measureFetch(
      `https://api.twitch.tv/helix/channel_points/custom_rewards?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          'Client-ID': getHelixClientId(),
          'Authorization': `Bearer ${tokenRes.data}`,
        },
        signal: safeTimeout(CP_TIMEOUT_MS),
      },
    )
    if (!res.ok) {
      const err = new AppError(ErrorCode.CHANNEL_POINTS_CREATE_FAILED, `Twitch HTTP ${res.status}`, { action: 'create_reward' })
      logError(err, { context: 'channel-points', action: 'create_reward' })
      return _cpResult(false, undefined, formatUserMessage(err), ErrorCode.CHANNEL_POINTS_CREATE_FAILED)
    }
    const data = await res.json()
    const created = data?.data?.[0]
    if (!created) return _cpResult(false, undefined, 'Twitch no devolvio la recompensa creada', ErrorCode.CHANNEL_POINTS_CREATE_FAILED)
    logEvent('channel_points', 'reward.created', { broadcasterId, rewardId: created.id })
    return _cpResult(true, created)
  } catch (e) {

    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_CREATE_FAILED,
      e?.message || 'Error al crear la recompensa',
      { action: 'create_reward', originalErrName: e?.name, originalErrMsg: e?.message },
    )
    logError(wrapped, { context: 'channel-points', action: 'create_reward' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_CREATE_FAILED)
  }
}

export async function updateCustomReward(broadcasterId, rewardId, rewardData, manageToken) {
  if (!broadcasterId || !rewardId) return _cpResult(false, undefined, 'broadcasterId y rewardId requeridos', ErrorCode.CHANNEL_POINTS_UPDATE_FAILED)
  const tokenRes = manageToken ? _cpResult(true, manageToken) : await getAppToken()
  if (!tokenRes.ok) return _cpResult(false, undefined, tokenRes.error, tokenRes.code)

  const params = new URLSearchParams()
  params.set('broadcaster_id', broadcasterId)
  params.set('id', rewardId)

  for (const [k, v] of Object.entries(rewardData || {})) {
    if (v == null) continue
    params.set(k, String(v))
  }

  try {
    const res = await measureFetch(
      `https://api.twitch.tv/helix/channel_points/custom_rewards?${params.toString()}`,
      {
        method: 'PATCH',
        headers: {
          'Client-ID': getHelixClientId(),
          'Authorization': `Bearer ${tokenRes.data}`,
        },
        signal: safeTimeout(CP_TIMEOUT_MS),
      },
    )
    if (!res.ok) {
      const err = new AppError(ErrorCode.CHANNEL_POINTS_UPDATE_FAILED, `Twitch HTTP ${res.status}`, { action: 'update_reward' })
      logError(err, { context: 'channel-points', action: 'update_reward' })
      return _cpResult(false, undefined, formatUserMessage(err), ErrorCode.CHANNEL_POINTS_UPDATE_FAILED)
    }
    const data = await res.json()
    const updated = data?.data?.[0]
    if (!updated) return _cpResult(false, undefined, 'Twitch no devolvio la recompensa actualizada', ErrorCode.CHANNEL_POINTS_UPDATE_FAILED)
    logEvent('channel_points', 'reward.updated', { broadcasterId, rewardId })
    return _cpResult(true, updated)
  } catch (e) {

    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_UPDATE_FAILED,
      e?.message || 'Error al actualizar la recompensa',
      { action: 'update_reward', originalErrName: e?.name, originalErrMsg: e?.message },
    )
    logError(wrapped, { context: 'channel-points', action: 'update_reward' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_UPDATE_FAILED)
  }
}

export async function deleteCustomReward(broadcasterId, rewardId, manageToken) {
  if (!broadcasterId || !rewardId) return _cpResult(false, undefined, 'broadcasterId y rewardId requeridos', ErrorCode.CHANNEL_POINTS_DELETE_FAILED)
  const tokenRes = manageToken ? _cpResult(true, manageToken) : await getAppToken()
  if (!tokenRes.ok) return _cpResult(false, undefined, tokenRes.error, tokenRes.code)

  const params = new URLSearchParams()
  params.set('broadcaster_id', broadcasterId)
  params.set('id', rewardId)

  try {
    const res = await measureFetch(
      `https://api.twitch.tv/helix/channel_points/custom_rewards?${params.toString()}`,
      {
        method: 'DELETE',
        headers: {
          'Client-ID': getHelixClientId(),
          'Authorization': `Bearer ${tokenRes.data}`,
        },
        signal: safeTimeout(CP_TIMEOUT_MS),
      },
    )
    if (!res.ok) {
      const err = new AppError(ErrorCode.CHANNEL_POINTS_DELETE_FAILED, `Twitch HTTP ${res.status}`, { action: 'delete_reward' })
      logError(err, { context: 'channel-points', action: 'delete_reward' })
      return _cpResult(false, undefined, formatUserMessage(err), ErrorCode.CHANNEL_POINTS_DELETE_FAILED)
    }
    logEvent('channel_points', 'reward.deleted', { broadcasterId, rewardId })
    return _cpResult(true, { id: rewardId })
  } catch (e) {

    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_DELETE_FAILED,
      e?.message || 'Error al eliminar la recompensa',
      { action: 'delete_reward', originalErrName: e?.name, originalErrMsg: e?.message },
    )
    logError(wrapped, { context: 'channel-points', action: 'delete_reward' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_DELETE_FAILED)
  }
}

export async function getRedemptions(broadcasterId, rewardId, status = 'UNFULFILLED', manageToken, userId, first = 50, after) {
  if (!broadcasterId || !rewardId) return _cpResult(false, undefined, 'broadcasterId y rewardId requeridos', ErrorCode.CHANNEL_POINTS_LIST_FAILED)
  if (!manageToken || manageToken === 'viewer') return _cpResult(true, { data: [], cursor: null }) 
  const tokenRes = _cpResult(true, manageToken)

  const params = new URLSearchParams()
  params.set('broadcaster_id', broadcasterId)
  params.set('reward_id', rewardId)
  params.set('status', status)
  params.set('first', String(Math.min(Math.max(first, 1), 50)))
  if (userId) params.set('user_id', userId)
  if (after) params.set('after', after)

  try {
    const res = await measureFetch(
      `https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions?${params.toString()}`,
      {
        headers: {
          'Client-ID': getHelixClientId(),
          'Authorization': `Bearer ${tokenRes.data}`,
        },
        signal: safeTimeout(CP_TIMEOUT_MS),
      },
    )
    if (!res.ok) {
      if (res.status === 401 || res.status === 403 || res.status === 400) {
        return _cpResult(true, { data: [], cursor: null })
      }
      const err = new AppError(ErrorCode.CHANNEL_POINTS_LIST_FAILED, `Twitch HTTP ${res.status}`, { action: 'list_redemptions' })
      logError(err, { context: 'channel-points', action: 'list_redemptions' })
      return _cpResult(false, undefined, formatUserMessage(err), ErrorCode.CHANNEL_POINTS_LIST_FAILED)
    }
    const data = await res.json()
    return _cpResult(true, { data: data?.data || [], cursor: data?.pagination?.cursor || null })
  } catch (e) {

    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_LIST_FAILED,
      e?.message || 'Error al listar redenciones',
      { action: 'list_redemptions', originalErrName: e?.name, originalErrMsg: e?.message },
    )
    logError(wrapped, { context: 'channel-points', action: 'list_redemptions' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_LIST_FAILED)
  }
}

export async function updateRedemptionStatus(broadcasterId, rewardId, redemptionIds, status, manageToken) {
  if (!broadcasterId || !rewardId || !Array.isArray(redemptionIds) || redemptionIds.length === 0) {
    return _cpResult(false, undefined, 'Faltan campos requeridos (redemptionIds no vacio)', ErrorCode.CHANNEL_POINTS_REDEMPTION_FULFILL_FAILED)
  }
  if (status !== 'FULFILLED' && status !== 'CANCELED') {
    return _cpResult(false, undefined, 'status debe ser FULFILLED o CANCELED', ErrorCode.CHANNEL_POINTS_REDEMPTION_FULFILL_FAILED)
  }
  const tokenRes = manageToken ? _cpResult(true, manageToken) : await getAppToken()
  if (!tokenRes.ok) return _cpResult(false, undefined, tokenRes.error, tokenRes.code)

  const chunks = []
  for (let i = 0; i < redemptionIds.length; i += 50) {
    chunks.push(redemptionIds.slice(i, i + 50))
  }
  const results = await Promise.all(chunks.map(async (ids) => {
    const params = new URLSearchParams()
    params.set('broadcaster_id', broadcasterId)
    params.set('reward_id', rewardId)
    params.set('status', status)
    ids.forEach(id => params.append('id', id))
    try {
      const res = await measureFetch(
        `https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions?${params.toString()}`,
        {
          method: 'PATCH',
          headers: {
            'Client-ID': getHelixClientId(),
            'Authorization': `Bearer ${tokenRes.data}`,
          },
          signal: safeTimeout(CP_TIMEOUT_MS),
        },
      )
      if (!res.ok) {
        const err = new AppError(ErrorCode.CHANNEL_POINTS_REDEMPTION_FULFILL_FAILED, `Twitch HTTP ${res.status}`, { action: 'update_redemption', chunkSize: ids.length })
        logError(err, { context: 'channel-points', action: 'update_redemption' })
        return _cpResult(false, ids, formatUserMessage(err), ErrorCode.CHANNEL_POINTS_REDEMPTION_FULFILL_FAILED)
      }
      logEvent('channel_points', `redemption.${status.toLowerCase()}`, { broadcasterId, rewardId, count: ids.length })
      return _cpResult(true, ids)
    } catch (e) {

      const wrapped = new AppError(
        ErrorCode.CHANNEL_POINTS_REDEMPTION_FULFILL_FAILED,
        e?.message || 'Error al aprobar/rechazar la redencion',
        { action: 'update_redemption', originalErrName: e?.name, originalErrMsg: e?.message },
      )
      logError(wrapped, { context: 'channel-points', action: 'update_redemption' })
      return _cpResult(false, ids, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_REDEMPTION_FULFILL_FAILED)
    }
  }))
  const failed = results.filter(r => !r.ok)
  if (failed.length > 0) {
    return _cpResult(false, results, failed[0].error, failed[0].code)
  }
  return _cpResult(true, results)
}

export async function redeemCustomReward(broadcasterId, rewardId, userInput, userToken) {
  if (!broadcasterId || !rewardId || !userToken) {
    return _cpResult(false, undefined, 'Faltan campos requeridos (broadcasterId, rewardId, userToken)', ErrorCode.CHANNEL_POINTS_REDEEM_FAILED)
  }
  const params = new URLSearchParams()
  params.set('broadcaster_id', broadcasterId)
  params.set('reward_id', rewardId)
  if (userInput) params.set('user_input', userInput)

  try {
    const res = await measureFetch(
      `https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          'Client-ID': getHelixClientId(),
          'Authorization': `Bearer ${userToken}`,
        },
        signal: safeTimeout(CP_TIMEOUT_MS),
      },
    )
    if (!res.ok) {
      let bodyMsg = ''
      try {
        const body = await res.json()
        bodyMsg = body?.message || ''
      } catch {  }

      let code = ErrorCode.CHANNEL_POINTS_REDEEM_FAILED
      let customMsg = null

      const lower = bodyMsg.toLowerCase()
      if (lower.includes('created by the broadcaster') || lower.includes('another app') || lower.includes('not created by your app')) {
        customMsg = 'Por políticas de seguridad y privacidad de la API de Twitch, las recompensas creadas por el streamer solo se pueden canjear en la web o aplicación oficial de Twitch.'
      } else if (lower.includes('insufficient') || (lower.includes('points') && lower.includes('enough'))) {
        code = ErrorCode.CHANNEL_POINTS_INSUFFICIENT_BALANCE
      } else if (lower.includes('cooldown') || lower.includes('paused') || lower.includes('limit') || lower.includes('stock')) {
        customMsg = 'Esta recompensa está temporalmente en enfriamiento o ha alcanzado su límite de canjes por stream.'
      } else if (res.status === 400) {

        customMsg = `Por políticas de la API de Twitch, el canje de esta recompensa está reservado a su web oficial${bodyMsg ? ` (${bodyMsg})` : ''}.`
      }

      const err = new AppError(code, `Twitch HTTP ${res.status}: ${bodyMsg}`, { action: 'redeem' })
      logError(err, { context: 'channel-points', action: 'redeem', bodyMsg })
      return _cpResult(false, undefined, customMsg || formatUserMessage(err), code)
    }
    const data = await res.json()
    return _cpResult(true, data?.data?.[0] || null)
  } catch (e) {

    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_REDEEM_FAILED,
      e?.message || 'Error al canjear la recompensa',
      { action: 'redeem', originalErrName: e?.name, originalErrMsg: e?.message },
    )
    logError(wrapped, { context: 'channel-points', action: 'redeem' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_REDEEM_FAILED)
  }
}

export async function getChannelRole(broadcasterId, userId, signal) {
  if (!broadcasterId || !userId) {
    return ok('unknown')
  }
  if (broadcasterId === userId) {
    return ok('broadcaster')
  }

  const modRes = await helixFetch(
    `https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${encodeURIComponent(broadcasterId)}&user_id=${encodeURIComponent(userId)}`,
    { method: 'GET' },
    { component: 'twitch', action: 'getChannelRole.checkMod', silent: true },
    signal,
  )
  if (modRes.success && modRes.value?.data?.length > 0) {
    return ok('mod')
  }

  if (!modRes.success && (modRes.error?.context?.status === 401 || modRes.error?.context?.status === 403)) {
    return ok(modRes.error?.context?.status === 401 ? 'unknown' : 'viewer')
  }

  const vipRes = await helixFetch(
    `https://api.twitch.tv/helix/channels/vips?broadcaster_id=${encodeURIComponent(broadcasterId)}&user_id=${encodeURIComponent(userId)}`,
    { method: 'GET' },
    { component: 'twitch', action: 'getChannelRole.checkVip', silent: true },
    signal,
  )
  if (vipRes.success && vipRes.value?.data?.length > 0) {
    return ok('vip')
  }
  return ok('viewer')
}

export async function getModerators(broadcasterId) {
  if (!broadcasterId) {
    return err(ErrorCode.MOD_ACTION_FAILED, 'broadcasterId requerido', { action: 'getModerators' }, true)
  }
  const result = await helixFetch(
    `https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${encodeURIComponent(broadcasterId)}&first=100`,
    { method: 'GET' },
    { component: 'twitch', action: 'getModerators' },
  )
  if (!result.success) return result
  return ok(result.value?.data || [])
}

export async function getVips(broadcasterId) {
  if (!broadcasterId) {
    return err(ErrorCode.MOD_ACTION_FAILED, 'broadcasterId requerido', { action: 'getVips' }, true)
  }
  const result = await helixFetch(
    `https://api.twitch.tv/helix/channels/vips?broadcaster_id=${encodeURIComponent(broadcasterId)}&first=100`,
    { method: 'GET' },
    { component: 'twitch', action: 'getVips' },
  )
  if (!result.success) return result
  return ok(result.value?.data || [])
}

export async function getBannedUsers(broadcasterId, banType = 'permanent') {
  if (!broadcasterId) {
    return err(ErrorCode.MOD_ACTION_FAILED, 'broadcasterId requerido', { action: 'getBannedUsers' }, true)
  }
  const result = await helixFetch(
    `https://api.twitch.tv/helix/moderation/banned?broadcaster_id=${encodeURIComponent(broadcasterId)}&ban_type=${banType}&first=100`,
    { method: 'GET' },
    { component: 'twitch', action: 'getBannedUsers' },
  )
  if (!result.success) return result
  return ok(result.value?.data || [])
}

export async function getTimeouts(broadcasterId) {
  return getBannedUsers(broadcasterId, 'temporary')
}

export async function banUser(broadcasterId, moderatorId, userId, reason, duration) {
  if (!broadcasterId || !moderatorId || !userId) {
    return err(ErrorCode.MOD_ACTION_FAILED, 'broadcasterId, moderatorId y userId requeridos', { action: 'banUser' })
  }
  const body = { data: { user_id: userId } }
  if (reason) body.data.reason = String(reason).slice(0, 500)
  if (typeof duration === 'number' && duration > 0) body.data.duration = duration
  const url = `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${encodeURIComponent(broadcasterId)}&moderator_id=${encodeURIComponent(moderatorId)}`
  return helixFetch(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { component: 'twitch', action: 'banUser', broadcasterId, moderatorId, userId, duration },
  )
}

export async function unbanUser(broadcasterId, moderatorId, userId) {
  if (!broadcasterId || !moderatorId || !userId) {
    return err(ErrorCode.MOD_ACTION_FAILED, 'broadcasterId, moderatorId y userId requeridos', { action: 'unbanUser' })
  }
  return helixFetch(
    `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${encodeURIComponent(broadcasterId)}&moderator_id=${encodeURIComponent(moderatorId)}&user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
    { component: 'twitch', action: 'unbanUser', broadcasterId, moderatorId, userId },
  )
}

export async function deleteChatMessage(broadcasterId, moderatorId, messageId) {
  if (!broadcasterId || !moderatorId || !messageId) {
    return err(ErrorCode.MOD_ACTION_FAILED, 'broadcasterId, moderatorId y messageId requeridos', { action: 'deleteChatMessage' })
  }
  return helixFetch(
    `https://api.twitch.tv/helix/moderation/chat?broadcaster_id=${encodeURIComponent(broadcasterId)}&moderator_id=${encodeURIComponent(moderatorId)}&message_id=${encodeURIComponent(messageId)}`,
    { method: 'DELETE' },
    { component: 'twitch', action: 'deleteChatMessage', broadcasterId, moderatorId, messageId },
  )
}

export async function clearChatMessages(broadcasterId, moderatorId) {
  if (!broadcasterId || !moderatorId) {
    return err(ErrorCode.MOD_ACTION_FAILED, 'broadcasterId y moderatorId requeridos', { action: 'clearChatMessages' })
  }
  return helixFetch(
    `https://api.twitch.tv/helix/moderation/chat?broadcaster_id=${encodeURIComponent(broadcasterId)}&moderator_id=${encodeURIComponent(moderatorId)}`,
    { method: 'DELETE' },
    { component: 'twitch', action: 'clearChatMessages', broadcasterId, moderatorId },
  )
}

export async function getChatSettings(broadcasterId, moderatorId) {
  if (!broadcasterId) {
    return err(ErrorCode.MOD_ACTION_FAILED, 'broadcasterId requerido', { action: 'getChatSettings' })
  }
  const modParam = moderatorId ? `&moderator_id=${encodeURIComponent(moderatorId)}` : ''
  const result = await helixFetch(
    `https://api.twitch.tv/helix/chat/settings?broadcaster_id=${encodeURIComponent(broadcasterId)}${modParam}`,
    { method: 'GET' },
    { component: 'twitch', action: 'getChatSettings', broadcasterId, moderatorId },
  )
  if (!result.success) return result
  const list = result.value?.data || []
  return ok(list[0] || null)
}

export async function updateChatSettings(broadcasterId, moderatorId, settings) {
  if (!broadcasterId || !moderatorId || !settings) {
    return err(ErrorCode.MOD_ACTION_FAILED, 'broadcasterId, moderatorId y settings requeridos', { action: 'updateChatSettings' })
  }
  return helixFetch(
    `https://api.twitch.tv/helix/chat/settings?broadcaster_id=${encodeURIComponent(broadcasterId)}&moderator_id=${encodeURIComponent(moderatorId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    },
    { component: 'twitch', action: 'updateChatSettings', broadcasterId, moderatorId, settings },
  )
}

