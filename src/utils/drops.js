import { getHelixClientId, PUBLIC_CLIENT_ID, getStoredToken } from './twitch'
import { isTauri } from './tauriEnv'

const NATIVE_DROPS_REFRESH_TIMEOUT_MS = 20000

export function isDropsIntegrityError(error) {
  const message = typeof error === 'string' ? error : error?.message
  return typeof message === 'string' && /failed integrity check|IntegrityCheckFailed/i.test(message)
}
const CHANNEL_DROPS_QUERY = `query ChannelDrops($id: ID!) {
  channel(id: $id) { viewerDropCampaigns {
    id name game { name boxArtURL }
    timeBasedDrops { id name requiredMinutesWatched
      benefitEdges { benefit { name imageAssetURL } }
    }
  } }
}`

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export function parseCampaign(c, isCurrentChannel = false) {
  const drops = (c.timeBasedDrops || []).map(d => {
    const required = d.requiredMinutesWatched || 60
    const current = d.self?.currentMinutesWatched || 0
    const percent = Math.min(100, Math.floor((current / required) * 100))
    const isReadyToClaim = percent >= 100 && !d.self?.isClaimed && Boolean(d.self?.dropInstanceID)

    return {
      id: d.id,
      name: d.name,
      requiredMinutes: required,
      currentMinutes: current,
      percent,
      hasProgress: Boolean(d.self),
      isClaimed: Boolean(d.self?.isClaimed),
      isReadyToClaim,
      dropInstanceId: d.self?.dropInstanceID || null,
      benefitName: d.benefitEdges?.[0]?.benefit?.name || d.name,
      benefitImage: d.benefitEdges?.[0]?.benefit?.imageAssetURL || null,
    }
  })

  return {
    id: c.id,
    name: c.name,
    gameName: c.game?.name || '',
    boxArtUrl: c.game?.boxArtURL || '',
    isCurrentChannel,
    drops,
  }
}

export function parseDropsInventory(inventory) {
  const rawCampaigns = Array.isArray(inventory?.campaigns) ? inventory.campaigns : []
  const campaignMap = new Map()

  for (const campaign of Array.isArray(inventory?.channelCampaigns) ? inventory.channelCampaigns : []) {
    if (campaign?.id) campaignMap.set(campaign.id, parseCampaign(campaign, true))
  }

  for (const campaign of rawCampaigns) {
    if (campaign?.id) {
      const available = campaignMap.get(campaign.id)
      const parsed = parseCampaign(campaign, Boolean(available))
      const drops = new Map((available?.drops || []).map(drop => [drop.id, drop]))
      for (const drop of parsed.drops) {
        if (drop.hasProgress || !drops.get(drop.id)?.hasProgress) drops.set(drop.id, drop)
      }
      campaignMap.set(campaign.id, { ...parsed, drops: [...drops.values()] })
    }
  }

  return {
    campaigns: Array.from(campaignMap.values()),
    authRequired: Boolean(inventory?.authRequired),
    status: typeof inventory?.status === 'string' ? inventory.status : 'ready',
    error: typeof inventory?.error === 'string' && inventory.error ? inventory.error : null,
    updatedAt: Number.isFinite(inventory?.updatedAt) ? inventory.updatedAt : null,
  }
}

export async function callTwitchGql({ query, variables, token, clientId }) {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke('fetch_twitch_gql', {
        query,
        variables: variables || null,
        token: token || null,
        clientId: clientId || null,
      })
    } catch {
      // Ignorar fallback para evitar ruido si no está autorizado
      return null
    }
  }

  const cleanToken = token ? token.replace(/^oauth:/i, '').replace(/^Bearer\s+/i, '').trim() : null
  const headers = {
    'Client-ID': clientId || PUBLIC_CLIENT_ID,
    'Content-Type': 'application/json',
  }
  if (cleanToken) {
    headers['Authorization'] = `OAuth ${cleanToken}`
  }

  const res = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }

  return await res.json()
}

export async function fetchUserDropsInventory(token, _channel = null, { force = false } = {}) {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const cached = await invoke('get_cached_drops_inventory')
      const cleanChannel = String(_channel || '').trim().toLowerCase()
      if (force || cached?.status !== 'ready' || cached?.channel !== cleanChannel || Date.now() - (cached?.updatedAt || 0) >= 15000) {
        if (cached?.status === 'starting' || cached?.channel !== cleanChannel) {
          if (/^[a-z0-9_]{3,25}$/.test(cleanChannel)) {
            await invoke('start_drops_watcher', { channel: cleanChannel })
          }
        }
        const refreshed = await withTimeout(
          invoke('force_refresh_drops_watcher', { channel: cleanChannel || null }),
          NATIVE_DROPS_REFRESH_TIMEOUT_MS,
          'La sincronización nativa de Drops agotó el tiempo de espera.',
        )
        return parseDropsInventory(refreshed)
      }
      return parseDropsInventory(cached)
    } catch (error) {
      return {
        campaigns: [],
        authRequired: false,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        updatedAt: null,
      }
    }
  }

  let cleanToken = token ? token.replace(/^oauth:/i, '').replace(/^Bearer\s+/i, '').trim() : null
  if (!cleanToken) {
    const stored = await getStoredToken()
    if (stored) {
      cleanToken = stored.replace(/^oauth:/i, '').replace(/^Bearer\s+/i, '').trim()
    }
  }
  if (!cleanToken) {
    return {
      campaigns: [],
      inventory: [],
      authRequired: true,
      status: 'auth-required',
      error: null,
      updatedAt: null,
    }
  }

  const query = `
    query Inventory {
      currentUser {
        id
        inventory {
          dropCampaignsInProgress {
            id
            name
            status
            game {
              id
              name
              boxArtURL
            }
            timeBasedDrops {
              id
              name
              requiredMinutesWatched
              benefitEdges {
                benefit {
                  id
                  name
                  imageAssetURL
                }
              }
              self {
                currentMinutesWatched
                isClaimed
                dropInstanceID
              }
            }
          }
        }
      }
    }
  `

  const clientIdsToTry = Array.from(new Set([getHelixClientId(), PUBLIC_CLIENT_ID])).filter(Boolean)

  for (const clientId of clientIdsToTry) {
    try {
      const data = await callTwitchGql({
        query,
        token: cleanToken,
        clientId,
      })

      if (!data) continue
      if (data.errors?.length) throw new Error(data.errors[0].message || 'Twitch rechazó la consulta de Drops')
      if (data.data?.currentUser === null) {
        return parseDropsInventory({ campaigns: [], authRequired: true, status: 'auth-required' })
      }

      const inventoryCampaigns =
        data?.data?.currentUser?.inventory?.dropCampaignsInProgress ||
        data?.data?.currentUser?.dropCampaignsInProgress ||
        null
      if (!Array.isArray(inventoryCampaigns)) throw new Error('Respuesta de inventario inválida')
      let channelCampaigns = []
      let channelError = null
      if (_channel) {
        try {
          const user = await callTwitchGql({ query: 'query DropChannel($login: String!) { user(login: $login) { id } }', variables: { login: _channel }, clientId })
          const id = user?.data?.user?.id
          if (!id) throw new Error('No se pudo consultar el canal de Drops')
          const available = await callTwitchGql({ query: CHANNEL_DROPS_QUERY, variables: { id }, clientId })
          if (available?.errors?.length) throw new Error(available.errors[0].message)
          channelCampaigns = available?.data?.channel?.viewerDropCampaigns
          if (!Array.isArray(channelCampaigns)) throw new Error('No se pudieron consultar los Drops del canal')
        } catch (error) {
          channelError = error.message
        }
      }
      return parseDropsInventory({
        campaigns: inventoryCampaigns,
        channelCampaigns,
        authRequired: false,
        status: channelError ? 'partial' : 'ready',
        error: channelError,
        updatedAt: Date.now(),
      })
    } catch (err) {
      console.warn(`[drops] Fallo con Client-ID ${clientId}:`, err)
    }
  }

  return {
    campaigns: [],
    inventory: [],
    authRequired: false,
    status: 'error',
    error: 'Twitch no devolvió el inventario de Drops',
    updatedAt: null,
  }
}

export async function claimDropReward(dropInstanceId, token, inventorySession = null) {
  if (isTauri() && dropInstanceId) {
    if (!inventorySession) throw new Error('Abre el inventario integrado antes de reclamar')
    const { invoke } = await import('@tauri-apps/api/core')
    const confirmed = await invoke('claim_twitch_drop', { dropInstanceId, inventorySession })
    if (confirmed !== true) throw new Error('Twitch no confirmó el reclamo del Drop')
    return { success: true, status: 'CLAIMED', dropInstanceId }
  }

  let cleanToken = token ? token.replace(/^oauth:/i, '').replace(/^Bearer\s+/i, '').trim() : null
  if (!cleanToken) {
    const stored = await getStoredToken()
    if (stored) {
      cleanToken = stored.replace(/^oauth:/i, '').replace(/^Bearer\s+/i, '').trim()
    }
  }
  if (!dropInstanceId || !cleanToken) {
    throw new Error('ID de Drop o Token no proporcionado')
  }

  const clientIdsToTry = Array.from(new Set([getHelixClientId(), PUBLIC_CLIENT_ID])).filter(Boolean)

  for (const clientId of clientIdsToTry) {
    try {
      const data = await callTwitchGql({
        query: `
          mutation ClaimDrop($input: ClaimDropRewardsInput!) {
            claimDropRewards(input: $input) {
              dropInstanceID
              status
            }
          }
        `,
        variables: {
          input: {
            dropInstanceID: dropInstanceId,
          },
        },
        token: cleanToken,
        clientId,
      })

      if (data?.errors?.length) throw new Error(data.errors[0].message || 'Twitch rechazó el reclamo')
      const status = data?.data?.claimDropRewards?.status
      if (!['ELIGIBLE_FOR_ALL', 'DROP_INSTANCE_ALREADY_CLAIMED'].includes(status)) {
        throw new Error('Twitch no confirmó el reclamo del Drop')
      }
      return {
        success: true,
        status,
        dropInstanceId,
      }
    } catch (err) {
      if (isDropsIntegrityError(err)) throw err
      console.warn(`[drops] Error al reclamar con Client-ID ${clientId}:`, err)
    }
  }

  throw new Error('No se pudo reclamar el Drop en Twitch')
}
