import { PUBLIC_CLIENT_ID } from './twitch'

export async function fetchUserDropsInventory(token, channel = null) {
  if (!token) return { campaigns: [], inventory: [] }

  const cleanChannel = typeof channel === 'string' ? channel.trim().toLowerCase() : null

  const query = cleanChannel
    ? `
      query UserDropInventoryWithChannel($channelLogin: String!) {
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
        user(login: $channelLogin) {
          id
          viewerDropCampaigns {
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
    `
    : `
      query UserDropInventory {
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
    `

  try {
    const res = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: {
        'Client-ID': PUBLIC_CLIENT_ID,
        'Authorization': `OAuth ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        ...(cleanChannel ? { variables: { channelLogin: cleanChannel } } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) return { campaigns: [], inventory: [] }
    const data = await res.json()

    const inventoryCampaigns =
      data?.data?.currentUser?.inventory?.dropCampaignsInProgress ||
      data?.data?.currentUser?.dropCampaignsInProgress ||
      []

    const channelCampaigns = data?.data?.user?.viewerDropCampaigns || []

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

    for (const c of channelCampaigns) {
      if (c?.id) {
        if (!campaignMap.has(c.id)) {
          campaignMap.set(c.id, parseCampaign(c, true))
        } else {
          // Mark existing campaign as current channel active
          const existing = campaignMap.get(c.id)
          existing.isCurrentChannel = true
        }
      }
    }

    const campaigns = Array.from(campaignMap.values())

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
