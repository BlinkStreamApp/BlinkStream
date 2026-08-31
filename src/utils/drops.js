import { getHelixClientId, PUBLIC_CLIENT_ID, getStoredToken } from './twitch'

export async function callTwitchGql({ query, variables, token, clientId }) {
  const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke('fetch_twitch_gql', {
        query,
        variables: variables || null,
        token: token || null,
        clientId: clientId || null,
      })
    } catch (err) {
      console.warn('[drops] Tauri GQL invoke error, intentando fetch fallback:', err)
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

export async function fetchUserDropsInventory(token, _channel = null) {
  let cleanToken = token ? token.replace(/^oauth:/i, '').replace(/^Bearer\s+/i, '').trim() : null
  if (!cleanToken) {
    const stored = await getStoredToken()
    if (stored) {
      cleanToken = stored.replace(/^oauth:/i, '').replace(/^Bearer\s+/i, '').trim()
    }
  }
  if (!cleanToken) return { campaigns: [], inventory: [] }

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

      console.log('[drops] GQL response:', data)

      if (data?.errors && data.errors.length > 0) {
        console.warn('[drops] GQL GraphQL errors:', data.errors)
      }

      const inventoryCampaigns =
        data?.data?.currentUser?.inventory?.dropCampaignsInProgress ||
        data?.data?.currentUser?.dropCampaignsInProgress ||
        []

      const campaignMap = new Map()

      const parseCampaign = (c, isCurrentChannel = false) => {
        const drops = (c.timeBasedDrops || []).map(d => {
          const required = d.requiredMinutesWatched || 60
          const current = d.self?.currentMinutesWatched || 0
          const percent = Math.min(100, Math.floor((current / required) * 100))
          const isReadyToClaim = percent >= 100 && !d.self?.isClaimed

          return {
            id: d.id,
            name: d.name,
            requiredMinutes: required,
            currentMinutes: current,
            percent,
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

      for (const c of inventoryCampaigns) {
        if (c?.id) {
          campaignMap.set(c.id, parseCampaign(c, false))
        }
      }

      const campaigns = Array.from(campaignMap.values())
      return { campaigns }
    } catch (err) {
      console.warn(`[drops] Fallo con Client-ID ${clientId}:`, err)
    }
  }

  return { campaigns: [], inventory: [] }
}

export async function claimDropReward(dropInstanceId, token) {
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
          mutation ClaimCommunityPointsDrop($input: ClaimCommunityPointsDropInput!) {
            claimCommunityPointsDrop(input: $input) {
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

      const status = data?.data?.claimCommunityPointsDrop?.status
      return {
        success: true,
        status: status || 'CLAIMED',
        dropInstanceId,
      }
    } catch (err) {
      console.warn(`[drops] Error al reclamar con Client-ID ${clientId}:`, err)
    }
  }

  throw new Error('No se pudo reclamar el Drop en Twitch')
}
