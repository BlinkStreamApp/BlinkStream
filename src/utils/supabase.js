// Utilidades de Supabase + twitch-auth edge function.
// Mantiene la URL publica + el poll del OAuth de Twitch intacto (no se rompe
// pollAuthToken) y añade helpers para el JWT de Supabase que valida
// blinkstream-data (F-1 fix, ver WT-20260625-26).
//
// Estrategia: NO instanciamos createClient de @supabase/supabase-js en el
// cliente. Esa depedencia fue removida en v1.0.3 (PLAN I2) por ser innecesaria:
// los tokens de Supabase los emite el server (twitch-auth) y los recibimos
// como JSON del polling. Aqui solo los guardamos en localStorage y los
// servimos a quien los pida.

export const SUPABASE_URL = 'https://oncbojnqxpxctwnhehau.supabase.co'

const EDGE_FN = `${SUPABASE_URL}/functions/v1/twitch-auth`

// localStorage keys para los tokens de Supabase emitidos por twitch-auth.
// Separados de los de Twitch (LS_TOKEN, LS_USERNAME) para que un eventual
// logout solo borre lo que corresponde.
export const LS_BLINKSTREAM_JWT = 'blinkstream_supabase_jwt'
export const LS_BLINKSTREAM_REFRESH = 'blinkstream_supabase_refresh'
export const LS_BLINKSTREAM_EXPIRES = 'blinkstream_supabase_expires'
export const LS_BLINKSTREAM_USER_ID = 'blinkstream_supabase_user_id'

export async function pollAuthToken(requestId, { signal, interval = 1500 } = {}) {
  const pollUrl = `${EDGE_FN}?fetch=${encodeURIComponent(requestId)}`

  while (!signal?.aborted) {
    try {
      const res = await fetch(pollUrl)
      if (!res.ok) {
        await sleep(interval, signal)
        continue
      }

      const data = await res.json()
      if (data?.found && data?.access_token) {
        // F-1 fix: si el server devolvio un JWT de Supabase, lo guardamos
        // para que favoritesSync.js pueda usarlo. No rompe el flujo previo:
        // si no viene, seguimos como siempre.
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
    } catch {
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

// ─── Token storage helpers ────────────────────────────────────────────────
// Lectura sincrona para usar como cabecera en cada fetch. Devuelve null
// si no hay token guardado o si ya expiro. La renovacion es lazy y se
// hace la primera vez que alguien pide un token vencido.

export function getBlinkstreamToken() {
  try {
    const jwt = localStorage.getItem(LS_BLINKSTREAM_JWT)
    const expiresAt = Number(localStorage.getItem(LS_BLINKSTREAM_EXPIRES) || 0)
    if (!jwt) return null
    // Margen de 60s: si expira en menos de 60s lo damos por vencido.
    if (Date.now() >= expiresAt - 60_000) return null
    return jwt
  } catch {
    return null
  }
}

export function getBlinkstreamRefreshToken() {
  try { return localStorage.getItem(LS_BLINKSTREAM_REFRESH) || null } catch { return null }
}

function saveBlinkstreamToken({ jwt, refreshToken, expiresIn, userId }) {
  try {
    localStorage.setItem(LS_BLINKSTREAM_JWT, jwt)
    if (refreshToken) localStorage.setItem(LS_BLINKSTREAM_REFRESH, refreshToken)
    // expiresIn viene en segundos. Guardamos timestamp absoluto en ms.
    const expiresAtMs = Date.now() + (Number(expiresIn) || 3600) * 1000
    localStorage.setItem(LS_BLINKSTREAM_EXPIRES, String(expiresAtMs))
    if (userId) localStorage.setItem(LS_BLINKSTREAM_USER_ID, userId)
  } catch { /* localStorage lleno o deshabilitado */ }
}

export function clearBlinkstreamToken() {
  try {
    localStorage.removeItem(LS_BLINKSTREAM_JWT)
    localStorage.removeItem(LS_BLINKSTREAM_REFRESH)
    localStorage.removeItem(LS_BLINKSTREAM_EXPIRES)
    localStorage.removeItem(LS_BLINKSTREAM_USER_ID)
  } catch { /* ignore */ }
}

// Renovacion lazy: si el token esta vencido, intenta refrescarlo contra
// twitch-auth. Devuelve un JWT valido o null. Se usa dentro de fetch
// helpers de favoritos (vease favoritesSync.js) para reintentos en 401.
export async function refreshBlinkstreamToken() {
  const refresh = getBlinkstreamRefreshToken()
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
