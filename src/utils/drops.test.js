import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchUserDropsInventory, claimDropReward } from './drops'

describe('drops utility', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty campaigns when token is missing', async () => {
    const result = await fetchUserDropsInventory('')
    expect(result.campaigns).toEqual([])
  })

  it('parses in-progress drop campaigns correctly', async () => {
    const fakeData = {
      data: {
        currentUser: {
          id: '12345',
          dropCampaignsInProgress: [
            {
              id: 'camp_1',
              name: 'Valorant Champions Drop',
              game: { name: 'VALORANT', boxArtURL: 'https://art.jpg' },
              timeBasedDrops: [
                {
                  id: 'drop_1',
                  name: 'Gun Buddy',
                  requiredMinutesWatched: 60,
                  self: {
                    currentMinutesWatched: 60,
                    isClaimed: false,
                    dropInstanceID: 'inst_999',
                  },
                  benefitEdges: [{ benefit: { name: 'Gun Buddy Item', imageAssetURL: 'https://item.jpg' } }],
                },
              ],
            },
          ],
        },
      },
    }

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => fakeData,
    })

    const result = await fetchUserDropsInventory('oauth_token')

    expect(result.campaigns.length).toBe(1)
    const drop = result.campaigns[0].drops[0]
    expect(drop.name).toBe('Gun Buddy')
    expect(drop.percent).toBe(100)
    expect(drop.isReadyToClaim).toBe(true)
    expect(drop.dropInstanceId).toBe('inst_999')
  })

  it('parses currentUser.inventory.dropCampaignsInProgress correctly', async () => {
    const fakeData = {
      data: {
        currentUser: {
          id: '12345',
          inventory: {
            dropCampaignsInProgress: [
              {
                id: 'camp_nested',
                name: 'Call of Duty Modern Warfare Drop',
                game: { name: 'Call of Duty', boxArtURL: 'https://cod.jpg' },
                timeBasedDrops: [
                  {
                    id: 'drop_cod_1',
                    name: 'Tactical Emblem',
                    requiredMinutesWatched: 15,
                    self: {
                      currentMinutesWatched: 5,
                      isClaimed: false,
                      dropInstanceID: 'inst_cod',
                    },
                    benefitEdges: [{ benefit: { name: 'Tactical Emblem', imageAssetURL: 'https://emblem.jpg' } }],
                  },
                ],
              },
            ],
          },
        },
      },
    }

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => fakeData,
    })

    const result = await fetchUserDropsInventory('oauth_token')
    expect(result.campaigns.length).toBe(1)
    expect(result.campaigns[0].name).toBe('Call of Duty Modern Warfare Drop')
    expect(result.campaigns[0].drops[0].currentMinutes).toBe(5)
    expect(result.campaigns[0].drops[0].requiredMinutes).toBe(15)
    expect(result.campaigns[0].drops[0].percent).toBe(33)
  })

  it('handles empty inventory gracefully', async () => {
    const fakeData = {
      data: {
        currentUser: {
          id: '12345',
          inventory: {
            dropCampaignsInProgress: [],
          },
        },
      },
    }

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => fakeData,
    })

    const result = await fetchUserDropsInventory('oauth_token', 'streamer_login')
    expect(result.campaigns).toEqual([])
  })

  it('claims drop successfully with claimDropReward', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          claimCommunityPointsDrop: {
            dropInstanceID: 'inst_999',
            status: 'SUCCESS',
          },
        },
      }),
    })

    const res = await claimDropReward('inst_999', 'oauth_token')
    expect(res.success).toBe(true)
    expect(res.dropInstanceId).toBe('inst_999')
  })
})
