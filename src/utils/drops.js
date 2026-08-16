import { PUBLIC_CLIENT_ID } from './twitch'

export async function fetchUserDropsInventory(token) {
  if (!token) return { campaigns: [], inventory: [] }

  try {
    const res = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: {
        'Client-ID': PUBLIC_CLIENT_ID,
        'Authorization': `OAuth ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query UserDropInventory {
            currentUser {
              id
              dropCampaignsInProgress {
                id
                name
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
        `,
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) return { campaigns: [], inventory: [] }
    const data = await res.json()
    const inProgress = data?.data?.currentUser?.dropCampaignsInProgress || []

    const campaigns = inProgress.map(c => {
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
        drops,
      }
    })

    return { campaigns }
  } catch (err) {
    console.warn('[drops] Error fetching user drops inventory:', err)
    return { campaigns: [], inventory: [] }
  }
}

export async function claimDropReward(dropInstanceId, token) {
  if (!dropInstanceId || !token) {
    throw new Error('ID de Drop o Token no proporcionado')
  }

  try {
    const res = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: {
        'Client-ID': PUBLIC_CLIENT_ID,
        'Authorization': `OAuth ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      throw new Error(`Fallo HTTP al reclamar Drop: ${res.status}`)
    }

    const data = await res.json()
    const status = data?.data?.claimCommunityPointsDrop?.status
    return {
      success: true,
      status: status || 'CLAIMED',
      dropInstanceId,
    }
  } catch (err) {
    console.error('[drops] Error claiming drop:', err)
    throw err
  }
}
