// ============================================================
// Twitch API Client IDs
// ============================================================
// Dos Client-IDs separados por endpoint:
//
// PUBLIC_CLIENT_ID (hardcodeado a kimne78kx3ncx6brgo4mv6wki5h1ko) // ALLOWED-REGRESSION: Twitch GQL first-party Client ID
//   → GQL (gql.twitch.tv). Este endpoint SOLO acepta el Client-ID
//     first-party de la web de Twitch. IDs de apps registradas
//     por el usuario son rechazados con 400. Por eso el ID va
//     hardcodeado (no configurable por el usuario).
//
// APP_CLIENT_ID (de VITE_TWITCH_CLIENT_ID / VITE_TWITCH_APP_CLIENT_ID)
//   → Helix (api.twitch.tv). Requiere el ID de la app registrada
//     del usuario + token OAuth. docs/TWITCH_APP_SETUP.md.
//
// FIX WT-20260628-138: se restaura el ID first-party (kimne78...) en
// PUBLIC_CLIENT_ID porque el intento previo de pureza (FIX-134) rompio
// GQL: Twitch rechaza el App Client ID del usuario en gql.twitch.tv con
// HTTP 400 en TODAS las queries (clip, vod, chat, streamInfo, alerts).
// El pre-build hook lo permitira via el comentario ALLOWED-REGRESSION
// en la linea del export.
// ============================================================

import { measureFetch } from './perf'
import { AppError, ErrorCode, logError, formatUserMessage } from './errors'
import { logEvent } from './eventLog'
import { isTauri } from './tauriEnv'

// ============================================================
// isTauri(): detecta runtime Tauri (sirve para feature-detect).
// Reutilizado por getAppToken y cualquier helper que tenga fallback
// desktop-only. Marcado con CWE-200/CWE-522 en mente: cuando hay un
// fallback con secretos, hay que cortar el path en PROD web.
// ============================================================
// FIX WT-20260628-34: re-export desde tauriEnv para tener una sola
// fuente de verdad. Se mantiene el export para no romper consumidores
// externos que importan `isTauri` desde `./utils/twitch`.
export { isTauri }

// ============================================================
// FIX-5 (Hank / P0): sanitizacion defensiva de canales para GraphQL.
// ============================================================
// Twitch exige que el `login` del canal cumpla `^[a-z0-9_]{3,25}$`
// (case-insensitive, pero en queries lo pasamos lowercase). Sin
// embargo, si un input externo (URL, deep-link, IPC) llega sin
// validar y se INTERPOLA dentro de un string de query, un canal
// como `foo"} maliciousFragment { ... } { x(login: "bar` rompe la
// query y permite exfiltrar data del viewer (CWE-94: Code Injection,
// CWE-20: Improper Input Validation).
//
// Esta funcion es defense-in-depth: SIEMPRE usarla antes de pasar
// el canal a cualquier GQL, ademas de preferir variables (que es la
// unica defensa real contra inyeccion en query languages).
// ============================================================

/**
 * Regex Twitch login: solo letras (case-insensitive), digitos y
 * underscore, longitud 3-25. Exportada para tests.
 * @type {RegExp}
 */
export const TWITCH_LOGIN_REGEX = /^[a-z0-9_]{3,25}$/

/**
 * Valida que un canal Twitch cumple el formato esperado.
 * @param {string} channel
 * @returns {boolean}
 */
export function isValidTwitchLogin(channel) {
  if (typeof channel !== 'string') return false
  return TWITCH_LOGIN_REGEX.test(channel.toLowerCase())
}

/**
 * Genera un entero aleatorio criptograficamente seguro en [0, max).
 * FIX 1 (Hank / P1): sustituye a Math.random() para cache-busting
 * y cualquier otro uso donde la predictibilidad del PRNG del engine
 * JS pueda ser explotada. CWE-330: Use of Insufficiently Random Values.
 *
 * - Usa crypto.getRandomValues (WebCrypto) cuando esta disponible.
 * - Cae a Math.random() solo como ultimo recurso (sin CSPRNG),
 *   porque aunque el parametro no es criptografico (cache-buster),
 *   la consistencia con el resto del modulo exige que el fallback
 *   se mantenga explicito.
 *
 * Exportada para tests de regresion.
 *
 * @param {number} max - Limite superior exclusivo (debe ser > 0)
 * @returns {number} entero en [0, max)
 */
export function secureRandomInt(max) {
  if (typeof max !== 'number' || max <= 0 || !Number.isFinite(max)) {
    throw new RangeError('secureRandomInt: max must be a positive finite number')
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    // Uint32Array -> 32 bits -> % max reduce al rango deseado
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return buf[0] % Math.floor(max)
  }
  return Math.floor(Math.random() * max)
}

/**
 * Sanitiza un canal para uso seguro en queries GQL:
 *   - Si es valido, lo devuelve en lowercase.
 *   - Si NO es valido, devuelve `null` (NO lanza; el caller decide).
 *
 * Pensado para combinarse con el patron de variables GraphQL:
 *   const ch = sanitizeChannelForGraphQL(rawChannel)
 *   if (!ch) return null
 *   body = JSON.stringify({
 *     query: 'query($login: String!) { user(login: $login) { id } }',
 *     variables: { login: ch },
 *   })
 *
 * @param {string} channel
 * @returns {string|null}
 */
export function sanitizeChannelForGraphQL(channel) {
  if (typeof channel !== 'string') return null
  const lower = channel.toLowerCase().trim()
  if (!isValidTwitchLogin(lower)) return null
  return lower
}


// ============================================================
// Result type para mod helpers (M-1 / WT-20260628-13)
// ============================================================
// Patron explicito Result<T, AppError> para que los hooks (useChannelRole,
// useModeration) puedan branchear sin try/catch anidados. Mantenemos
// un wrapper interno en vez de exponer una libreria externa: ligero,
// zero-deps, y tipable mentalmente (success: true => T, success: false => AppError).
// ============================================================

/**
 * @template T
 * @typedef {{ success: true, value: T } | { success: false, error: AppError }} Result
 */

/**
 * Envoltorio OK. Anota contexto extra al AppError via `meta`.
 * @template T
 * @param {T} value
 * @returns {Result<T>}
 */
function ok(value) {
  return { success: true, value }
}

/**
 * Envoltorio ERROR. Construye un AppError tipado con codigo MOD_ACTION_FAILED
 * (o el que llegue) y contexto para que logError pueda correlacionar.
 * Loggea automaticamente via logError (M-6) salvo que silent=true.
 *
 * @param {string} code      - ErrorCode.MOD_ACTION_FAILED por defecto
 * @param {string} message
 * @param {object} [meta]    - { component, action, ... }
 * @param {boolean} [silent] - si true, no llama a logError
 * @returns {Result<never>}
 */
function err(code, message, meta = {}, silent = false) {
  const codeStr = code || ErrorCode.MOD_ACTION_FAILED
  const ae = new AppError(codeStr, message, meta)
  if (!silent && !meta?.silent) {
    logError(ae, meta)
  }
  return { success: false, error: ae }
}

/**
 * Helper interno: ejecuta un fetch Helix con timeout 5s, headers autenticados
 * y manejo de error uniforme. Devuelve Result<T> parseando JSON si response ok.
 *
 * Acepta un `signal` externo (del caller) que se combina con el timeout
 * interno via `AbortSignal.any(...)` para que el caller pueda abortar
 * (p. ej. cambio rapido de canal en un hook) sin necesidad de re-implementar
 * la logica de timeout.
 *
 * @template T
 * @param {string} url
 * @param {RequestInit} [opts]
 * @param {object} [meta] - contexto para AppError/log
 * @param {AbortSignal} [signal] - signal externo del caller (opcional)
 * @returns {Promise<Result<T>>}
 */
async function helixFetch(url, opts = {}, meta = {}, signal) {
  try {
    const headers = await getHeaders()
    // Combinamos el signal externo con el timeout interno. Si el caller
    // aborta O si pasan 5s, fetch se cancela. `AbortSignal.any` es el
    // patron oficial para combinar signals (soportado en browsers 2024+
    // y Node 20+). Fallback a un Merge manual si no esta disponible.
    const timeoutSignal = safeTimeout(5000)
    let combinedSignal = timeoutSignal
    if (signal) {
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
        combinedSignal = AbortSignal.any([timeoutSignal, signal])
      } else if (!timeoutSignal.aborted && !signal.aborted) {
        // Fallback: combinamos manualmente. Si uno aborta, abortamos el otro.
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
      // Mensaje informativo segun status
      const msg =
        status === 403 ? 'Sin permisos para esta accion' :
        status === 404 ? 'Recurso no encontrado' :
        status === 429 ? 'Rate limit de Twitch alcanzado' :
        status >= 500 ? 'Error del servidor de Twitch' :
        `Helix fallo (HTTP ${status})`
      return err(ErrorCode.MOD_ACTION_FAILED, msg, { ...meta, url, status })
    }
    // DELETE no devuelve body
    if (status === 204 || (opts.method || 'GET').toUpperCase() === 'DELETE') {
      return ok(/** @type {any} */ (null))
    }
    const data = await res.json().catch(() => null)
    return ok(/** @type {any} */ (data))
  } catch (e) {
    // AbortError u otros fallos de red
    return err(
      ErrorCode.MOD_ACTION_FAILED,
      e?.name === 'AbortError' ? 'Timeout (5s) llamando a Twitch' : (e?.message || 'Fallo de red'),
      { ...meta, url, errName: e?.name },
    )
  }
}

// Helix Client-ID: el ID de la app registrada por el usuario. Se usa con
// el token OAuth del usuario para llamadas autenticadas a api.twitch.tv.
// Lee en este orden: VITE_TWITCH_APP_CLIENT_ID > VITE_TWITCH_CLIENT_ID.
// Si ninguno esta, devuelve string vacio y las llamadas daran 400.
const _APP_FROM_ENV = import.meta.env.VITE_TWITCH_APP_CLIENT_ID?.trim()
const _PUBLIC_FROM_ENV = import.meta.env.VITE_TWITCH_CLIENT_ID?.trim()
export const APP_CLIENT_ID = _APP_FROM_ENV || _PUBLIC_FROM_ENV || ''

// GQL Client-ID: Twitch SOLO acepta el first-party Client ID de su web
// en gql.twitch.tv. IDs de apps registradas (z8bat49...) son rechazados
// con HTTP 400. Por eso PUBLIC_CLIENT_ID se hardcodea a ese ID first-party
// y APP_CLIENT_ID (Helix) sigue siendo configurable via .env.
// docs/TWITCH_APP_SETUP.md.
// ALLOWED-REGRESSION: Twitch GQL solo acepta first-party Client ID (kimne78...); APP token NO funciona en gql.twitch.tv
export const PUBLIC_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko' // ALLOWED-REGRESSION: Twitch GQL first-party Client ID

/**
 * Obtiene de forma dinámica el Client ID real asociado al token OAuth en uso.
 * Twitch requiere que en peticiones Helix a api.twitch.tv el cabecero Client-ID sea
 * exactamente el mismo que emitió el token OAuth (descubierto vía id.twitch.tv/oauth2/validate).
 * Esto erradica el deslogueo automático y los errores 401 si VITE_TWITCH_APP_CLIENT_ID está vacío o es incorrecto.
 *
 * @returns {string}
 */
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

/**
 * Recupera el token de Twitch persistido. Prioriza keychain (Tauri),
 * cae a localStorage. Devuelve null si no hay token o si el acceso
 * a almacenamiento falla.
 *
 * @returns {Promise<string|null>}
 */
export async function getStoredToken() {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const token = await invoke('get_secret', { key: 'twitch_token' })
       if (token) return token.replace(/^oauth:/i, '')
    } catch { /* invoke fallo -> fallback */ }
  }
  try {
    const token = localStorage.getItem('blinkstream_twitch_token') || null
    return token ? token.replace(/^oauth:/i, '') : null
  } catch { return null }
}

/**
 * Borra el token de Twitch y caché del Client ID de keychain y localStorage. No lanza.
 * @returns {Promise<void>}
 */
export async function clearStoredToken() {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('delete_secret', { key: 'twitch_token' })
    } catch { /* ignore */ }
  }
  try {
    localStorage.removeItem('blinkstream_twitch_token')
    localStorage.removeItem('blinkstream_twitch_username')
    localStorage.removeItem('blinkstream_oauth_client_id')
  } catch { /* ignore */ }
}

/**
 * Verifica que un token sigue siendo válido usando primero el endpoint oficial
 * OAuth de Twitch (que no requiere Client-ID y nos devuelve el Client-ID auténtico del token).
 * @param {string|null|undefined} token
 * @returns {Promise<boolean>}
 */
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
        try { localStorage.setItem('blinkstream_oauth_client_id', data.client_id) } catch { /* ignore */ }
      }
      return true
    }
  } catch { /* Si el validador falla por red, caer al intento en Helix */ }

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

/**
 * Construye las cabeceras para llamadas Helix. Si hay token persistido
 * lo añade como Authorization Bearer y usa getHelixClientId() en ese caso.
 *
 * @returns {Promise<Record<string, string>>}
 */
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

/**
 * Cabeceras para llamadas GQL publicas (no requieren token de usuario).
 * @returns {{'Client-ID': string, 'Content-Type': string}}
 */
export function getGqlHeaders() {
  return {
    'Client-ID': PUBLIC_CLIENT_ID,
    'Content-Type': 'application/json',
  }
}

/**
 * Pide a Twitch GQL el playback access token para un canal o VOD.
 * Usado por el reproductor para obtener la URL firmada del HLS.
 *
 * @param {string} channel - login del canal o id del VOD
 * @param {'stream'|'video'} [type='stream']
 * @returns {Promise<{value: string, signature: string}>}
 * @throws {Error} si la peticion falla o la respuesta no trae token
 */
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

/**
 * Resuelve la URL HLS directa del stream. Primero pide el access token
 * via GQL, luego hace la peticion a usher y parsea el m3u8 para
 * encontrar la variante de calidad pedida. Si pide audio_only/best/
 * chunked devuelve la URL base del m3u8.
 *
 * @param {string} channel
 * @param {string} [quality='1080p60']
 * @returns {Promise<string>}
 * @throws {Error} si la peticion a usher falla
 */
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
    // FIX 1 (Hank / P1): CSPRNG para cache-buster. Math.random() es
    // predecible (PRNG del engine JS) y constituye CWE-330. Se usa
    // crypto.getRandomValues cuando esta disponible. Rango: [0, 1e7).
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

/**
 * Devuelve info de stream en vivo de un canal. Null si no esta en vivo
 * o si la peticion falla.
 *
 * @param {string} channel
 * @returns {Promise<object|null>}
 */
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

/**
 * Busca canales en Twitch. Ordena los que estan en vivo primero.
 * Devuelve array vacio si la query falla o no hay resultados.
 *
 * @param {string} query
 * @returns {Promise<Array<{login: string, displayName: string, avatar: string, isLive: boolean, game: string, viewers: number}>>}
 */
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

/**
 * Resuelve un login de Twitch (e.g. "ninja") a su user_id numerico
 * (e.g. "19571641"). Necesario para Channel Points y mod endpoints
 * que solo aceptan broadcaster_id, no login. Cache de 1h en localStorage.
 *
 * Devuelve null si el canal no existe o si la peticion falla.
 *
 * @param {string} login
 * @returns {Promise<string|null>}
 */
export async function getUserIdByLogin(login) {
  if (!login || typeof login !== 'string') return null
  const cacheKey = `bs.twitch.userid.${login.toLowerCase()}`
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) return cached
  } catch { /* ignore */ }

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
      try { localStorage.setItem(cacheKey, id) } catch { /* ignore */ }
    }
    return id || null
  } catch { return null }
}

// ============================================================
// Channel Points (Helix /channel_points/*) — WT-20260628-14
// ============================================================
// Twitch exige un APP ACCESS TOKEN (client_credentials) para los
// endpoints de manage, pero los endpoints de viewer (redeem) usan
// el token del usuario. Por eso separamos dos "canales" de auth.
//
// Todas las funciones devuelven { ok, data, error } para que el
// caller pueda manejar el caso de fallo sin try/catch redundantes.
// Internamente miden con measureFetch, loggean con logError
// (contexto: 'channel-points') y se protegen con AbortSignal.timeout(5s).
//
// Los actions que cada logError lleva son strings estables para que
// el eventLog y DebugPanel puedan correlacionar / filtrar.
// ============================================================

const CP_TIMEOUT_MS = 5000
// FIX 4 (Hank / P1): eliminada la persistencia en localStorage del
// App Access Token. CWE-922: Insecure Storage of Sensitive Information.
// El App Token de Twitch NO es del usuario, pero:
//   1) tiene poder de actuar como la app registrada (scopes de
//      manage channel_points, moderation, etc),
//   2) cualquier XSS que robe este token puede pivotar hacia la
//      infraestructura de BlinkStream sin pasar por el keychain.
// Ahora vive solo en memoria del modulo (variable privada). Si el
// proceso se reinicia, expiramos y pedimos uno nuevo al backend.
const APP_TOKEN_RENEW_BEFORE_MS = 5 * 60 * 1000
// App tokens de Twitch duran ~1h (expires_in suele ser 3600-4900s).
// Pedimos uno nuevo cuando faltan < 5 min, para evitar edge cases de
// expiracion durante una operacion larga.

/**
 * @typedef {object} ChannelPointsResult
 * @property {boolean} ok
 * @property {*=}    data   - payload si ok=true
 * @property {string=} error - mensaje user-friendly si ok=false
 * @property {string=} code  - ErrorCode.* para filtrar
 */

/**
 * Helper interno: shape de retorno uniforme. Lo usan TODOS los
 * helpers de Channel Points para que el caller siempre reciba la
 * misma estructura (un solo patrón de manejo en el hook).
 *
 * @param {boolean} ok
 * @param {*=}      data
 * @param {string=} error
 * @param {string=} code
 * @returns {ChannelPointsResult}
 */
function _cpResult(ok, data = undefined, error = undefined, code = undefined) {
  return { ok, data, error, code }
}

/**
 * Cache en memoria + localStorage del App Access Token. La cache
 * vive en el módulo (singleton) y se sincroniza con localStorage
 * para sobrevivir recargas sin pedir un token nuevo cada vez.
 *
 * Estructura interna: { token: string, expiresAt: number (ms) }
 */
let _appTokenCache = null

function _readAppTokenCache() {
  return _appTokenCache
}

function _writeAppTokenCache(token, expiresAt) {
  _appTokenCache = { token, expiresAt }
}

/**
 * Devuelve un App Access Token de Twitch (client_credentials flow).
 * Usa cache en localStorage con TTL de `expires_in - 5min` para no
 * pedir uno nuevo en cada llamada. Si estamos en Tauri, llama al
 * command Rust `get_app_token` (que tiene el client_secret).
 * En web/dev puro, intenta con `VITE_TWITCH_APP_CLIENT_ID` +
 * `VITE_TWITCH_APP_CLIENT_SECRET` del .env y avisa con warning
 * (DEV ONLY: el secret NUNCA debe estar en build de produccion web).
 *
 * @returns {Promise<ChannelPointsResult>}
 */
export async function getAppToken() {
  // 1) Cache: si tenemos uno válido, lo devolvemos sin tocar la red.
  const cached = _readAppTokenCache()
  if (cached && cached.expiresAt > Date.now() + APP_TOKEN_RENEW_BEFORE_MS) {
    return _cpResult(true, cached.token)
  }

  // 2) Tauri: command backend con el secret seguro.
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
    // FIX WT-20260628-64: antes el `formatUserMessage(e)` caia al
    // default ("Algo salio mal...") porque `e` es una excepcion JS
    // nativa sin `code`. Ahora envolvemos en AppError con el code
    // correcto para que formatUserMessage devuelva el mensaje
    // especifico de CHANNEL_POINTS_APP_TOKEN_FAILED en vez del
    // generico que confundia al usuario.
    //
    // FIX WT-20260628-71: enriquecemos el mensaje con un hint
    // accionable (WebView2 Runtime) y guardamos el stack recortado
    // en el context para que el usuario pueda reportar el error
    // real sin abrir la consola. El problema típico en una
    // instalación fresca de BlinkStream es que WebView2 Runtime
    // no viene preinstalado en Windows 7/8/10 antiguos.
    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED,
      `Tauri invoke fallo: ${e?.message || 'unknown'}. Si acabas de instalar la app, asegurate de que WebView2 Runtime este instalado.`,
      { action: 'get_app_token', originalErrName: e?.name, originalErrMsg: e?.message, originalStack: e?.stack?.substring(0, 200) },
    )
    logError(wrapped, { context: 'channel-points', action: 'get_app_token' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED)
  }

  // FIX-2 (Hank / P0): bloquear el path web de getAppToken en PRODUCCION.
  // Si llegamos aqui es porque NO estamos en Tauri (o el command fallo).
  // El path web usa VITE_TWITCH_APP_CLIENT_SECRET, que quedaria embebido
  // en el bundle de produccion (Vite sustituye import.meta.env en build).
  // CWE-522: Insufficiently Protected Credentials.
  // Solo permitimos el fallback en DEV (vite dev server) o cuando el
  // command de Tauri fallo (best-effort) — NUNCA en PROD web.
  if (import.meta.env.PROD && !isTauri()) {
    const err = new AppError(
      ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED,
      'getAppToken via web no esta disponible en produccion; usa el desktop app',
      { action: 'get_app_token_web_blocked' },
    )
    logError(err, { context: 'channel-points', action: 'get_app_token' })
    return _cpResult(false, undefined, formatUserMessage(err), ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED)
  }

  // 3) Web/dev puro: client_credentials con credenciales del .env.
  //    ADVERTENCIA: esto expone el client_secret al bundle web. Solo
  //    aceptable en dev puro (vite dev server). En produccion SIEMPRE
  //    debe ir por Tauri command.
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

   
  // FIX-2 (Hank / P0): redactar el secret del warning para que no quede
  // en logs persistentes. Mostramos solo longitud como fingerprint.
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
    // expires_in viene en segundos; lo guardamos como ms absolutos.
    const expiresAt = Date.now() + (Number(data.expires_in) * 1000)
    _writeAppTokenCache(data.access_token, expiresAt)
    return _cpResult(true, data.access_token)
  } catch (e) {
    logError(e, { context: 'channel-points', action: 'get_app_token' })
    return _cpResult(false, undefined, formatUserMessage(e), ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED)
  }
}

/**
 * Lista las recompensas personalizadas de un canal. Requiere
 * app access token (scope: channel:manage:redemptions). Si solo
 * lees para mostrarlas, el scope `channel:read:redemptions` es
 * suficiente — Twitch acepta el app token con cualquiera de los dos.
 *
 * @param {string} broadcasterId
 * @param {string} [manageToken] - app access token (opcional, se obtiene via getAppToken si falta)
 * @returns {Promise<ChannelPointsResult>}
 */
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
    // FIX WT-20260628-68: envolver e en AppError con el code correcto
    // ANTES de pasarlo a formatUserMessage. Si pasáramos e nativo (TypeError,
    // NetworkError, AbortError, etc.), formatUserMessage cae al default
    // "Algo salio mal..." porque esas excepciones no tienen `.code`. Ahora
    // garantizamos que formatUserMessage devuelva el mensaje user-friendly
    // especifico de la operacion (cargar recompensas, en este caso).
    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_LIST_FAILED,
      e?.message || 'Error al cargar recompensas del canal',
      { action: 'list_rewards', originalErrName: e?.name, originalErrMsg: e?.message },
    )
    logError(wrapped, { context: 'channel-points', action: 'list_rewards' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_LIST_FAILED)
  }
}

/**
 * Carga recompensas y balance en vivo de un canal utilizando Twitch GQL.
 * Así los espectadores pueden ver puntos y recompensas sin necesitar tokens con scopes de broadcaster ni client secrets.
 *
 * @param {string} channelLogin
 * @param {string} [userToken]
 * @returns {Promise<ChannelPointsResult>}
 */
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
      // Devolvemos lista vacía y balance null si el canal no tiene puntos habilitados
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

/**
 * Devuelve una sola recompensa por ID.
 *
 * @param {string} broadcasterId
 * @param {string} rewardId
 * @param {string} [manageToken]
 * @returns {Promise<ChannelPointsResult>}
 */
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
    // FIX WT-20260628-68: envolver error nativo en AppError para que
    // formatUserMessage reconozca el codigo y devuelva el mensaje
    // especifico en vez del generico "Algo salio mal...".
    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_LIST_FAILED,
      e?.message || 'Error al obtener la recompensa',
      { action: 'get_reward', originalErrName: e?.name, originalErrMsg: e?.message },
    )
    logError(wrapped, { context: 'channel-points', action: 'get_reward' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_LIST_FAILED)
  }
}

/**
 * Crea una recompensa personalizada. El body va como query params
 * (Twitch Helix para este endpoint no acepta JSON body, solo form).
 *
 * @param {string} broadcasterId
 * @param {object} rewardData  - { title, cost, prompt?, background_color?, is_enabled?, ... }
 * @param {string} [manageToken]
 * @returns {Promise<ChannelPointsResult>}
 */
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
    // FIX WT-20260628-68: envolver error nativo en AppError para que
    // formatUserMessage devuelva el mensaje especifico de create.
    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_CREATE_FAILED,
      e?.message || 'Error al crear la recompensa',
      { action: 'create_reward', originalErrName: e?.name, originalErrMsg: e?.message },
    )
    logError(wrapped, { context: 'channel-points', action: 'create_reward' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_CREATE_FAILED)
  }
}

/**
 * Actualiza una recompensa existente. Mismas reglas que create.
 *
 * @param {string} broadcasterId
 * @param {string} rewardId
 * @param {object} rewardData  - campos a modificar
 * @param {string} [manageToken]
 * @returns {Promise<ChannelPointsResult>}
 */
export async function updateCustomReward(broadcasterId, rewardId, rewardData, manageToken) {
  if (!broadcasterId || !rewardId) return _cpResult(false, undefined, 'broadcasterId y rewardId requeridos', ErrorCode.CHANNEL_POINTS_UPDATE_FAILED)
  const tokenRes = manageToken ? _cpResult(true, manageToken) : await getAppToken()
  if (!tokenRes.ok) return _cpResult(false, undefined, tokenRes.error, tokenRes.code)

  const params = new URLSearchParams()
  params.set('broadcaster_id', broadcasterId)
  params.set('id', rewardId)
  // Twitch permite mandar cualquier subconjunto de campos en PATCH.
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
    // FIX WT-20260628-68: envolver error nativo en AppError para que
    // formatUserMessage devuelva el mensaje especifico de update.
    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_UPDATE_FAILED,
      e?.message || 'Error al actualizar la recompensa',
      { action: 'update_reward', originalErrName: e?.name, originalErrMsg: e?.message },
    )
    logError(wrapped, { context: 'channel-points', action: 'update_reward' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_UPDATE_FAILED)
  }
}

/**
 * Elimina una recompensa. Twitch mueve la reward a "archivada" en la
 * UI del broadcaster (no se borra definitivamente), pero a nivel
 * de API devuelve 204 y desaparece de /custom_rewards.
 *
 * @param {string} broadcasterId
 * @param {string} rewardId
 * @param {string} [manageToken]
 * @returns {Promise<ChannelPointsResult>}
 */
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
    // FIX WT-20260628-68: envolver error nativo en AppError para que
    // formatUserMessage devuelva el mensaje especifico de delete.
    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_DELETE_FAILED,
      e?.message || 'Error al eliminar la recompensa',
      { action: 'delete_reward', originalErrName: e?.name, originalErrMsg: e?.message },
    )
    logError(wrapped, { context: 'channel-points', action: 'delete_reward' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_DELETE_FAILED)
  }
}

/**
 * Lista redenciones de una reward. status por defecto 'UNFULFILLED'
 * que es lo que usa la UI de Manage.
 *
 * @param {string} broadcasterId
 * @param {string} rewardId
 * @param {string} [status='UNFULFILLED']   - UNFULFILLED | FULFILLED | CANCELED
 * @param {string} [manageToken]
 * @param {string} [userId]                 - filtra por user_id (opcional)
 * @param {number} [first=50]               - limite de paginacion
 * @param {string} [after]                  - cursor de paginacion
 * @returns {Promise<ChannelPointsResult>}
 */
export async function getRedemptions(broadcasterId, rewardId, status = 'UNFULFILLED', manageToken, userId, first = 50, after) {
  if (!broadcasterId || !rewardId) return _cpResult(false, undefined, 'broadcasterId y rewardId requeridos', ErrorCode.CHANNEL_POINTS_LIST_FAILED)
  if (!manageToken || manageToken === 'viewer') return _cpResult(true, { data: [], cursor: null }) // Si el usuario es 'viewer' o no tiene token de gestión real
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
    // FIX WT-20260628-68: envolver error nativo en AppError para que
    // formatUserMessage devuelva el mensaje especifico de list.
    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_LIST_FAILED,
      e?.message || 'Error al listar redenciones',
      { action: 'list_redemptions', originalErrName: e?.name, originalErrMsg: e?.message },
    )
    logError(wrapped, { context: 'channel-points', action: 'list_redemptions' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_LIST_FAILED)
  }
}

/**
 * Aprueba o rechaza redenciones en bulk. status debe ser FULFILLED
 * o CANCELED. Twitch exige que el broadcaster cumpla los requisitos
 * de la reward (puntos, cooldown, stock) o devuelve 400.
 *
 * @param {string} broadcasterId
 * @param {string} rewardId
 * @param {string[]} redemptionIds
 * @param {'FULFILLED'|'CANCELED'} status
 * @param {string} [manageToken]
 * @returns {Promise<ChannelPointsResult>}
 */
export async function updateRedemptionStatus(broadcasterId, rewardId, redemptionIds, status, manageToken) {
  if (!broadcasterId || !rewardId || !Array.isArray(redemptionIds) || redemptionIds.length === 0) {
    return _cpResult(false, undefined, 'Faltan campos requeridos (redemptionIds no vacio)', ErrorCode.CHANNEL_POINTS_REDEMPTION_FULFILL_FAILED)
  }
  if (status !== 'FULFILLED' && status !== 'CANCELED') {
    return _cpResult(false, undefined, 'status debe ser FULFILLED o CANCELED', ErrorCode.CHANNEL_POINTS_REDEMPTION_FULFILL_FAILED)
  }
  const tokenRes = manageToken ? _cpResult(true, manageToken) : await getAppToken()
  if (!tokenRes.ok) return _cpResult(false, undefined, tokenRes.error, tokenRes.code)

  // Twitch limita el bulk a 50 IDs por llamada. Si el caller pasa
  // mas, los troceamos en paralelo para no bloquear la UI.
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
      // FIX WT-20260628-68: envolver error nativo en AppError para que
      // formatUserMessage devuelva el mensaje especifico de fulfill.
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

/**
 * Canjea una recompensa del lado del VIEWER. Usa el token del
 * usuario, no un app token. El broadcasterId es el del canal donde
 * se hace el canje. Si la reward requiere input de usuario, pasarlo
 * en `userInput`; si no, dejar undefined.
 *
 * Twitch exige un channel points balance > cost o devuelve 400.
 *
 * @param {string} broadcasterId
 * @param {string} rewardId
 * @param {string|undefined} userInput
 * @param {string} userToken  - OAuth token del viewer
 * @returns {Promise<ChannelPointsResult>}
 */
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
      } catch { /* ignore */ }

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
        // En cualquier otro error 400 que no especifique saldo insuficiente, explicamos la política de privacidad de la API
        customMsg = `Por políticas de la API de Twitch, el canje de esta recompensa está reservado a su web oficial${bodyMsg ? ` (${bodyMsg})` : ''}.`
      }

      const err = new AppError(code, `Twitch HTTP ${res.status}: ${bodyMsg}`, { action: 'redeem' })
      logError(err, { context: 'channel-points', action: 'redeem', bodyMsg })
      return _cpResult(false, undefined, customMsg || formatUserMessage(err), code)
    }
    const data = await res.json()
    return _cpResult(true, data?.data?.[0] || null)
  } catch (e) {
    // FIX WT-20260628-68: envolver error nativo en AppError para que
    // formatUserMessage devuelva el mensaje especifico de redeem.
    const wrapped = new AppError(
      ErrorCode.CHANNEL_POINTS_REDEEM_FAILED,
      e?.message || 'Error al canjear la recompensa',
      { action: 'redeem', originalErrName: e?.name, originalErrMsg: e?.message },
    )
    logError(wrapped, { context: 'channel-points', action: 'redeem' })
    return _cpResult(false, undefined, formatUserMessage(wrapped), ErrorCode.CHANNEL_POINTS_REDEEM_FAILED)
  }
}

// ============================================================
// Moderation Helix helpers (M1 / WT-20260628-13)
// ============================================================
// Todos los helpers siguen el mismo contrato:
//   - Auth via getHeaders() (con token persistido o client-id publico).
//   - Timeout 5s.
//   - Miden latencia via measureFetch (M-8).
//   - Errores se loggean con ErrorCode.MOD_ACTION_FAILED y contexto (M-6).
//   - Devuelven Result<T, AppError> en vez de throw (callers branchan
//     con `if (result.success)` y obtienen AppError tipado si falla).
//
// Scopes necesarios (ya aplicadas en el flujo OAuth, commit 02b8c26):
//   - moderator:manage:chat_messages
//   - moderator:manage:banned_users
//   - moderator:manage:chat_settings
//   - moderation:read
//   - channel:read:vips
//   - channel:manage:vips
// ============================================================

/**
 * @typedef {object} HelixUser
 * @property {string} user_id
 * @property {string} user_login
 * @property {string} user_name
 */

/**
 * Resuelve el rol de un usuario en un canal. Estrategia:
 *   1) Si `userId === broadcasterId` → 'broadcaster'
 *   2) GET /helix/moderation/moderators?broadcaster_id=X&user_id=Y → 'mod'
 *   3) GET /helix/channels/vips?broadcaster_id=X&user_id=Y → 'vip'
 *   4) Si todo lo anterior falla o no encuentra → 'viewer' | 'unknown'
 *
 * NOTA: Twitch NO expone un endpoint directo "isSub". Por scope y paridad
 * con el cliente, solo distinguimos broad/mod/vip/viewer/unknown. La
 * pertenencia a sub se infiere por badges IRC, fuera del scope de Helix.
 *
 * Acepta un `signal` externo (del caller, tipicamente un AbortController
 * del hook) para cancelar la peticion si el componente se desmonta o
 * cambian los IDs. Esto cierra el race condition donde fetches viejos
 * sobrescriben el state nuevo cuando el usuario cambia de canal rapido.
 *
 * @param {string} broadcasterId
 * @param {string} userId
 * @param {AbortSignal} [signal] - signal externo del caller (opcional)
 * @returns {Promise<import('./twitch').Result<'broadcaster'|'mod'|'vip'|'viewer'|'unknown'>>}
 */
export async function getChannelRole(broadcasterId, userId, signal) {
  if (!broadcasterId || !userId) {
    return ok('unknown')
  }
  if (broadcasterId === userId) {
    return ok('broadcaster')
  }
  // Comprobamos mod primero
  const modRes = await helixFetch(
    `https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${encodeURIComponent(broadcasterId)}&user_id=${encodeURIComponent(userId)}`,
    { method: 'GET' },
    { component: 'twitch', action: 'getChannelRole.checkMod', silent: true },
    signal,
  )
  if (modRes.success && modRes.value?.data?.length > 0) {
    return ok('mod')
  }
  // Si modRes dio 401 o 403 (token caducado o sin permisos de moderación/dueño), no llamar a checkVip innecesariamente
  if (!modRes.success && (modRes.error?.context?.status === 401 || modRes.error?.context?.status === 403)) {
    return ok(modRes.error?.context?.status === 401 ? 'unknown' : 'viewer')
  }
  // Despues VIP
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

/**
 * Lista los moderadores de un canal.
 * @param {string} broadcasterId
 * @returns {Promise<import('./twitch').Result<HelixUser[]>>}
 */
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

/**
 * Lista los VIPs de un canal. Requiere scope `channel:read:vips`.
 * @param {string} broadcasterId
 * @returns {Promise<import('./twitch').Result<HelixUser[]>>}
 */
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

/**
 * Lista usuarios baneados de un canal (permanentes o temporales).
 * Para timeouts, usa `getTimeouts` (wrapper con `ban_type=timeout`).
 *
 * @param {string} broadcasterId
 * @param {'permanent'|'temporary'} [banType='permanent']
 * @returns {Promise<import('./twitch').Result<HelixUser[]>>}
 */
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

/**
 * Lista timeouts activos de un canal. Equivalente a `getBannedUsers`
 * con `ban_type=timeout`. La API de Twitch distingue por este param.
 *
 * @param {string} broadcasterId
 * @returns {Promise<import('./twitch').Result<HelixUser[]>>}
 */
export async function getTimeouts(broadcasterId) {
  return getBannedUsers(broadcasterId, 'temporary')
}

/**
 * Banea (o timeoutea) a un usuario del canal.
 * - Si `duration` es null/undefined → ban permanente.
 * - Si `duration` es numero positivo en segundos → timeout.
 *
 * @param {string}  broadcasterId
 * @param {string}  moderatorId - id del moderador que ejecuta la accion
 * @param {string}  userId      - id del usuario objetivo
 * @param {string}  [reason]   - hasta 500 chars
 * @param {number}  [duration] - segundos de timeout; undefined = permanente
 * @returns {Promise<import('./twitch').Result<null>>}
 */
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

/**
 * Desbanea / quita un timeout de un usuario.
 * Twitch usa el mismo endpoint con DELETE para ambos casos.
 *
 * @param {string} broadcasterId
 * @param {string} moderatorId - id del moderador que ejecuta la accion
 * @param {string} userId
 * @returns {Promise<import('./twitch').Result<null>>}
 */
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

/**
 * Borra un mensaje especifico del chat (mod action). El messageId viene
 * del tag `id` de IRC PRIVMSG.
 *
 * @param {string} broadcasterId
 * @param {string} moderatorId - id del moderador que ejecuta la accion
 * @param {string} messageId
 * @returns {Promise<import('./twitch').Result<null>>}
 */
export async function deleteChatMessage(broadcasterId, moderatorId, messageId) {
  if (!broadcasterId || !moderatorId || !messageId) {
    return err(ErrorCode.MOD_ACTION_FAILED, 'broadcasterId, moderatorId y messageId requeridos', { action: 'deleteChatMessage' })
  }
  return helixFetch(
    `https://api.twitch.tv/helix/moderation/chat_messages?broadcaster_id=${encodeURIComponent(broadcasterId)}&moderator_id=${encodeURIComponent(moderatorId)}&message_id=${encodeURIComponent(messageId)}`,
    { method: 'DELETE' },
    { component: 'twitch', action: 'deleteChatMessage', broadcasterId, moderatorId, messageId },
  )
}
