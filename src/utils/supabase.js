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

import { isTauri } from './tauriEnv'

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

/**
 * Polling del OAuth de Twitch contra la edge function. Cada `interval`
 * ms pregunta si el flujo termino y trae el access_token. Si abortan
 * la signal, sale del bucle y devuelve null.
 *
 * @param {string} requestId
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {number}      [options.interval=1500]
 * @returns {Promise<{access_token: string, username: string} | null>}
 */
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
    } catch (pollErr) {
      // FIX P1-5: bind explicito del error para que reglas eslint de
      // "no-empty" / "no-unused-vars" no marquen el bloque. La
      // semantica no cambia: pollAuthToken reintenta tras `sleep`
      // y un fallo transitorio de red NO debe matar el bucle. Si en
      // el futuro queremos logear el fallo (telemetria, debug), el
      // pollErr ya esta disponible sin tocar la firma del catch.
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

// ─── Token storage helpers ────────────────────────────────────────────────
// Lectura sincrona para usar como cabecera en cada fetch. Devuelve null
// si no hay token guardado o si ya expiro. La renovacion es lazy y se
// hace la primera vez que alguien pide un token vencido.

/**
 * Lectura sincrona del JWT de Supabase guardado. Devuelve null si no
 * hay, si ya expiro (margen 60s) o si localStorage falla.
 *
 * @returns {string|null}
 */
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

/**
 * FIX-3 (Hank / P0): getBlinkstreamRefreshToken se ha renombrado a la
 * variante Sync para clarificar que solo lee localStorage (rapido, sin
 * latencia de keychain). La lectura con keychain-first vive en
 * `getBlinkstreamRefreshTokenAsync` y es la que DEBE usarse en cualquier
 * codigo que pueda permitirse un await (caso normal: refresh del JWT).
 *
 * Razon: el S-4 fix original decia "keychain first, LS fallback" pero
 * como keychain es async y la funcion era sync, el implementador original
 * (regresion) lo simplifico a "LS only", perdiendo la lectura del keychain.
 * Esto es una regresion: en usuarios con token ya migrado, el refresh
 * leeria del LS vacio y devolveria null, forzando un re-login.
 *
 * La migracion a keychain la dispara `storeBlinkstreamRefreshToken`.
 *
 * @returns {string|null}
 */
export function getBlinkstreamRefreshTokenSync() {
  try {
    const ls = localStorage.getItem(LS_BLINKSTREAM_REFRESH)
    if (ls) return ls
  } catch { /* ignore */ }
  return null
}

/**
 * FIX-3 (Hank / P0): lee el refresh token siguiendo la politica del S-4
 * fix: keychain primero, localStorage como fallback para tokens legacy.
 * Es async porque leer del keychain requiere invoke() de Tauri.
 *
 * Usar preferentemente esta variante en cualquier codigo async (refresh
 * de JWT, helpers de Supabase). Solo usar `getBlinkstreamRefreshTokenSync`
 * si estas en codigo que no puede esperar (legacy paths).
 *
 * @returns {Promise<string|null>}
 */
export async function getBlinkstreamRefreshTokenAsync() {
  // 1) Keychain (Tauri secret plugin). Si Tauri no esta disponible,
  //    el invoke falla silenciosamente y caemos al fallback.
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const fromKeychain = await invoke('get_secret', { key: KEYCHAIN_REFRESH_KEY })
      if (fromKeychain) return fromKeychain
    } catch { /* invoke fallo -> fallback */ }
  }
  // 2) Fallback legacy (localStorage).
  return getBlinkstreamRefreshTokenSync()
}

/**
 * S-4 fix: persiste el refresh token en el keychain del sistema operativo
 * (Tauri secret plugin). Si Tauri no esta disponible (dev web puro, build
 * sin plugin), cae a localStorage. Tras un store exitoso en keychain,
 * borra la copia en localStorage para evitar doble persistencia.
 *
 * @param {string} token
 * @returns {Promise<boolean>} true si quedo en keychain, false si quedo en localStorage
 */
export async function storeBlinkstreamRefreshToken(token) {
  if (!token) return false
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('store_secret', { key: KEYCHAIN_REFRESH_KEY, value: token })
      // Migracion silenciosa: si habia copia en localStorage, limpiarla.
      try { localStorage.removeItem(LS_BLINKSTREAM_REFRESH) } catch { /* ignore */ }
      return true
    } catch {
      // Si el invoke falla caemos a localStorage (modo dev / sin Tauri backend).
    }
  }
  // Fallback: localStorage (modo dev / sin Tauri)
  try { localStorage.setItem(LS_BLINKSTREAM_REFRESH, token) } catch { /* ignore */ }
  return false
}

/**
 * Lee el refresh token del keychain (async). Usado por el flow de
 * migracion: si en localStorage queda un refresh token pre-S-4, lo
 * movemos a keychain. Devuelve el token (de keychain o localStorage) o null.
 *
 * @returns {Promise<string|null>}
 */
export async function readBlinkstreamRefreshToken() {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const fromKeychain = await invoke('get_secret', { key: KEYCHAIN_REFRESH_KEY })
      if (fromKeychain) return fromKeychain
    } catch { /* invoke fallo → fallback */ }
  }
  try { return localStorage.getItem(LS_BLINKSTREAM_REFRESH) || null } catch { return null }
}

/**
 * Borra el refresh token del keychain y de localStorage. No lanza.
 * @returns {Promise<void>}
 */
export async function clearBlinkstreamRefreshToken() {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('delete_secret', { key: KEYCHAIN_REFRESH_KEY })
    } catch { /* ignore */ }
  }
  try { localStorage.removeItem(LS_BLINKSTREAM_REFRESH) } catch { /* ignore */ }
}

// S-4 fix: migracion silenciosa. Si encontramos un refresh token en
// localStorage (formato pre-fix), lo movemos a keychain y limpiamos
// la copia vieja. Solo actua si Tauri esta disponible y la copia
// en keychain esta vacia.
async function migrateLegacyRefreshToken() {
  if (!isTauri()) return
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
  } catch { /* invoke fallo, mantener en localStorage */ }
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

/**
 * Borra todos los artefactos de sesion Supabase: JWT, refresh token,
 * expires, userId. Tambien dispara clear del keychain (fire-and-forget).
 * @returns {void}
 */
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

/**
 * Renovacion lazy: si el token esta vencido, intenta refrescarlo contra
 * twitch-auth. Devuelve un JWT valido o null. Se usa dentro de fetch
 * helpers de favoritos (vease favoritesSync.js) para reintentos en 401.
 *
 * @returns {Promise<string|null>}
 */
export async function refreshBlinkstreamToken() {
  // FIX-3 (Hank / P0): usar la variante async que lee keychain primero.
  // La sync solo leia localStorage (regresion del S-4 fix).
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
