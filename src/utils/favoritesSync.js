import { APP_CLIENT_ID } from './twitch'
import { SUPABASE_URL } from './supabase'
import { getBlinkstreamToken, refreshBlinkstreamToken, clearBlinkstreamToken } from './supabase'

const DATA_FN = `${SUPABASE_URL}/functions/v1/blinkstream-data`

// FIX WT-20260628-82 (Bug A): circuit-breaker a nivel de modulo.
// Si la nube nos devuelve 401 definitivo (sin token post-refresh),
// seteamos authBroken=true. A partir de ahi TODOS los calls a
// authedFetch devuelven inmediatamente una Response 401 sintetica sin
// tocar la red. Asi cortamos el loop infinito de 500+ requests que
// se observaba en el log del .exe cuando el usuario no estaba
// logueado o su token estaba vencido.
//
// Se limpia (vuelve a false) cuando el usuario hace login exitoso
// (ver saveBlinkstreamToken en supabase.js) o logout (via
// clearBlinkstreamToken -> clearAuthBrokenFlag).
let authBroken = false

export function isAuthBroken() {
  return authBroken
}

export function clearAuthBrokenFlag() {
  authBroken = false
}

// Wrapper interno: hace fetch con Authorization Bearer y un unico retry
// automatico en 401 (rotando el JWT via twitch-auth?refresh=). Si despues
// del retry sigue 401, devolvemos el error para que el caller degrade
// elegantemente (favoritos quedan locales).
//
// FIX WT-20260628-82: antes del fetch, comprobar el circuit-breaker.
// Si esta abierto (authBroken=true), devolvemos una Response 401
// sintetica para no salir a la red.
async function authedFetch(url, options = {}) {
  // Circuit-breaker: si la ultima llamada cerro el circuito, no salir
  // a la red. Devolvemos 401 sintetico para que el caller degrade bien.
  if (authBroken) {
    return new Response(JSON.stringify({ error: 'auth_broken' }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const buildHeaders = (token) => ({
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  })

  let token = getBlinkstreamToken()
  if (!token) {
    authBroken = true
    return new Response(JSON.stringify({ error: 'no_token' }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' },
    })
  }
  let res = await fetch(url, { ...options, headers: buildHeaders(token) })

  if (res.status === 401) {
    if (token) {
      // Token vencido o invalido. Intentar refresh UNA vez.
      const fresh = await refreshBlinkstreamToken()
      if (fresh) {
        res = await fetch(url, { ...options, headers: buildHeaders(fresh) })
        if (res.status === 401) {
          // Refresh NO resolvio el 401. Abrir circuit-breaker.
          authBroken = true
          clearBlinkstreamToken()
        }
      } else {
        // No pudimos refrescar: limpiar estado y abrir circuit-breaker.
        authBroken = true
        clearBlinkstreamToken()
      }
    } else {
      // No hay token: 401 era esperable. Abrimos el circuit-breaker
      // para que los siguientes effects que se re-ejecuten (por
      // cambio de favorites u otros deps) NO spameen la red.
      // Se cierra cuando el usuario haga login.
      authBroken = true
    }
  }

  return res
}

/**
 * Lista los favoritos de un usuario desde la nube. Devuelve array vacio
 * si falla (la UI ya tiene fallback local).
 *
 * @param {string} username
 * @returns {Promise<string[]>}
 */
export async function fetchCloudFavorites(username) {
  if (!username) return []
  try {
    const res = await authedFetch(`${DATA_FN}?action=list&username=${encodeURIComponent(username)}`)
    if (!res.ok) return []
    const data = await res.json()
    return data?.channels || []
  } catch { return [] }
}

/**
 * Persiste un favorito en la nube. Fire-and-forget: no lanza y no
 * devuelve nada. Si falla, el favorito sigue en localStorage y se
 * reintentara en el proximo login.
 *
 * @param {string} username
 * @param {string} channel
 * @returns {Promise<void>}
 */
export async function addCloudFavorite(username, channel) {
  if (!username) return
  try {
    await authedFetch(DATA_FN, {
      method: 'POST',
      body: JSON.stringify({ action: 'fav_add', username, channel }),
    })
  } catch { /* fire-and-forget */ }
}

/**
 * Elimina un favorito de la nube. Fire-and-forget.
 * @param {string} username
 * @param {string} channel
 * @returns {Promise<void>}
 */
export async function removeCloudFavorite(username, channel) {
  if (!username) return
  try {
    await authedFetch(DATA_FN, {
      method: 'POST',
      body: JSON.stringify({ action: 'fav_remove', username, channel }),
    })
  } catch { /* fire-and-forget */ }
}

/**
 * Mezcla favoritos locales y nube, y sube los locales que no esten
 * en la nube en chunks de 10 en serie. Si la nube no responde,
 * devuelve solo los locales (merge idempotente).
 *
 * @param {string[]} localFavorites
 * @param {string} username
 * @returns {Promise<string[]>}
 */
export async function mergeFavorites(localFavorites, username) {
  if (!username) return localFavorites
  const cloud = await fetchCloudFavorites(username)
  const merged = [...new Set([...localFavorites, ...cloud])]

  // S-5 fix: throttling. Antes se lanzaban N requests simultaneas a la edge
  // function (una por favorito local no presente en la nube), lo que podia
  // tumbar el rate-limit del gateway y agotar el JWT por paralelismo.
  // Ahora: chunks de 10 en serie, cada chunk se lanza en paralelo pero
  // esperamos al siguiente chunk antes de empezar. Si un batch falla entero,
  // lo loggeamos y seguimos con el resto — no perdemos la merge, solo un lote.
  const toAdd = localFavorites.filter(ch => !cloud.includes(ch))
  if (toAdd.length === 0) return merged

  const CHUNK_SIZE = 10
  for (let i = 0; i < toAdd.length; i += CHUNK_SIZE) {
    const chunk = toAdd.slice(i, i + CHUNK_SIZE)
    try {
      const results = await Promise.allSettled(
        chunk.map(ch => addCloudFavorite(username, ch))
      )
      // addCloudFavorite ya hace swallow internamente, pero si todos
      // rechazan (p.ej. 401 global) lo dejamos constancia.
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed > 0) {
        // Mantener un log discreto — la UI ya degrada bien porque los
        // favoritos quedan locales y se reintentaran en el proximo login.
        console.warn(`[mergeFavorites] chunk ${i / CHUNK_SIZE + 1}: ${failed}/${chunk.length} failed`)
      }
    } catch (err) {
      // Promise.allSettled nunca lanza, pero por si acaso no abortamos
      // toda la merge: continuamos con el siguiente chunk.
      console.warn(`[mergeFavorites] chunk ${i / CHUNK_SIZE + 1} failed:`, err?.message || err)
    }
  }

  return merged
}

/**
 * Lista los canales que el usuario de un token sigue en Twitch.
 * Pagina hasta 5 paginas (500 canales max). Devuelve array de logins.
 *
 * @param {string} token - Bearer token de Twitch
 * @returns {Promise<string[]>}
 */
export async function fetchFollowedChannels(token) {
  if (!token) return []
  try {
    const userRes = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': APP_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
    })
    if (!userRes.ok) return []
    const userData = await userRes.json()
    const userId = userData?.data?.[0]?.id
    if (!userId) return []

    const follows = []
    let cursor = null
    for (let i = 0; i < 5; i++) {
      const url = `https://api.twitch.tv/helix/channels/followed?user_id=${userId}&first=100${cursor ? `&after=${cursor}` : ''}`
      const followRes = await fetch(url, {
        headers: {
          'Client-ID': APP_CLIENT_ID,
          'Authorization': `Bearer ${token}`,
        },
      })
      if (!followRes.ok) break
      const followData = await followRes.json()
      if (followData.data) {
        follows.push(...followData.data.map(f => f.broadcaster_login))
      }
      if (!followData.pagination?.cursor) break
      cursor = followData.pagination.cursor
    }
    return follows
  } catch { return [] }
}
