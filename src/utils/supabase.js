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

// Keychain key para el refresh token. El JWT y los expires quedan en
// localStorage (cambian a menudo y leerlos sync es critico para los
// fetch helpers), pero el refresh token es credencial de larga vida y
// debe vivir en el keychain del sistema (S-4 fix).
const KEYCHAIN_REFRESH_KEY = 'blinkstream_refresh_token'

export async function pollAuthToken(requestId, { signal, interval = 1500 } = {}) {
  const pollUrl = `${EDGE_FN}?fetch=${encodeURIComponent(requestId)}`

  // S-4 fix: si hay un refresh token legacy en localStorage, moverlo a
  // keychain. Fire-and-forget — no bloqueamos el polling en esto.
  migrateLegacyRefreshToken().catch(() => { /* ignore */ })

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
  // S-4 fix: el refresh token debe leerse del keychain. Mantenemos fallback
  // a localStorage para usuarios con tokens pre-existentes (migrados en el
  // primer login) o entornos sin Tauri.
  // Como leer del keychain es async pero esta funcion es sync, primero
  // intentamos localStorage (rapido y cubre el caso comun post-migracion).
  // La migracion a keychain se dispara en storeBlinkstreamRefreshToken.
  try {
    const ls = localStorage.getItem(LS_BLINKSTREAM_REFRESH)
    if (ls) return ls
  } catch { /* ignore */ }
  return null
}

// S-4 fix: persiste el refresh token en el keychain del sistema operativo
// (Tauri secret plugin). Si Tauri no esta disponible (dev web puro, build
// sin plugin), cae a localStorage. Tras un store exitoso en keychain,
// borra la copia en localStorage para evitar doble persistencia.
export async function storeBlinkstreamRefreshToken(token) {
  if (!token) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('store_secret', { key: KEYCHAIN_REFRESH_KEY, value: token })
    // Migracion silenciosa: si habia copia en localStorage, limpiarla.
    try { localStorage.removeItem(LS_BLINKSTREAM_REFRESH) } catch { /* ignore */ }
    return true
  } catch {
    // Fallback: localStorage (modo dev / sin Tauri)
    try { localStorage.setItem(LS_BLINKSTREAM_REFRESH, token) } catch { /* ignore */ }
    return false
  }
}

// Lee el refresh token del keychain (async). Usado por el flow de
// migracion: si en localStorage queda un refresh token pre-S-4, lo
// movemos a keychain. Devuelve el token (de keychain o localStorage) o null.
export async function readBlinkstreamRefreshToken() {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const fromKeychain = await invoke('get_secret', { key: KEYCHAIN_REFRESH_KEY })
    if (fromKeychain) return fromKeychain
  } catch { /* Tauri no disponible → fallback */ }
  try { return localStorage.getItem(LS_BLINKSTREAM_REFRESH) || null } catch { return null }
}

// Borra el refresh token del keychain. Usado en logout / clear.
export async function clearBlinkstreamRefreshToken() {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('delete_secret', { key: KEYCHAIN_REFRESH_KEY })
  } catch { /* ignore */ }
  try { localStorage.removeItem(LS_BLINKSTREAM_REFRESH) } catch { /* ignore */ }
}

// S-4 fix: migracion silenciosa. Si encontramos un refresh token en
// localStorage (formato pre-fix), lo movemos a keychain y limpiamos
// la copia vieja. Solo actua si Tauri esta disponible y la copia
// en keychain esta vacia.
async function migrateLegacyRefreshToken() {
  try {
    const lsToken = localStorage.getItem(LS_BLINKSTREAM_REFRESH)
    if (!lsToken) return
    const { invoke } = await import('@tauri-apps/api/core')
    const existing = await invoke('get_secret', { key: KEYCHAIN_REFRESH_KEY })
    if (existing) {
      // Ya hay uno en keychain, solo limpiamos la copia legacy.
      localStorage.removeItem(LS_BLINKSTREAM_REFRESH)
      return
    }
    await invoke('store_secret', { key: KEYCHAIN_REFRESH_KEY, value: lsToken })
    localStorage.removeItem(LS_BLINKSTREAM_REFRESH)
  } catch { /* Tauri no disponible, mantener en localStorage */ }
}

async function saveBlinkstreamToken({ jwt, refreshToken, expiresIn, userId }) {
  try {
    localStorage.setItem(LS_BLINKSTREAM_JWT, jwt)
    // expiresIn viene en segundos. Guardamos timestamp absoluto en ms.
    const expiresAtMs = Date.now() + (Number(expiresIn) || 3600) * 1000
    localStorage.setItem(LS_BLINKSTREAM_EXPIRES, String(expiresAtMs))
    if (userId) localStorage.setItem(LS_BLINKSTREAM_USER_ID, userId)

    // S-4 fix: el refresh token va al keychain, no a localStorage.
    if (refreshToken) {
      await storeBlinkstreamRefreshToken(refreshToken)
    }
  } catch { /* localStorage lleno o deshabilitado */ }
}

export function clearBlinkstreamToken() {
  try {
    localStorage.removeItem(LS_BLINKSTREAM_JWT)
    localStorage.removeItem(LS_BLINKSTREAM_REFRESH)
    localStorage.removeItem(LS_BLINKSTREAM_EXPIRES)
    localStorage.removeItem(LS_BLINKSTREAM_USER_ID)
  } catch { /* ignore */ }
  // S-4 fix: tambien limpiar del keychain. Es fire-and-forget porque
  // clearBlinkstreamToken se invoca en paths sincronos (logout) y no
  // esperamos al keychain.
  clearBlinkstreamRefreshToken().catch(() => { /* ignore */ })
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
