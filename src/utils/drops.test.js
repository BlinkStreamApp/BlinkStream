import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchUserDropsInventory, claimDropReward, parseDropsInventory } from './drops'
import { invoke } from '@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('drops utility', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    invoke.mockReset()
    delete window.__TAURI_INTERNALS__
    delete globalThis.isTauri
  })

  it('parses authentication state and accepts an empty inventory update', () => {
    const result = parseDropsInventory({
      campaigns: [],
      authRequired: true,
      status: 'auth-required',
      error: 'Twitch GQL HTTP 401',
      updatedAt: 1234,
    })

    expect(result).toEqual({
      campaigns: [],
      authRequired: true,
      status: 'auth-required',
      error: 'Twitch GQL HTTP 401',
      updatedAt: 1234,
    })
  })

  it('returns empty campaigns when token is missing', async () => {
    const result = await fetchUserDropsInventory('')
    expect(result.campaigns).toEqual([])
  })

  it('returns the direct native refresh result when the cache is starting', async () => {
    window.__TAURI_INTERNALS__ = {}
    invoke.mockImplementation(command => {
      if (command === 'get_cached_drops_inventory') {
        return Promise.resolve({
          campaigns: [],
          authRequired: false,
          status: 'starting',
          updatedAt: 1234,
        })
      }
      if (command === 'force_refresh_drops_watcher') {
        return Promise.resolve({
          campaigns: [],
          authRequired: false,
          status: 'ready',
          error: null,
          updatedAt: 5678,
        })
      }
      return Promise.resolve(undefined)
    })

    const result = await fetchUserDropsInventory('oauth_token', 'pinkyelpibe')

    expect(result.status).toBe('ready')
    expect(result.updatedAt).toBe(5678)
    expect(invoke).toHaveBeenCalledWith('start_drops_watcher', { channel: 'pinkyelpibe' })
    expect(invoke).toHaveBeenCalledWith('force_refresh_drops_watcher', { channel: 'pinkyelpibe' })
  })

  const availableCampaign = {
    id: 'aion', name: 'War for Atreia - Series 1', game: { name: 'AION 2' },
    timeBasedDrops: [{ id: 'voucher', name: 'Customization Voucher', requiredMinutesWatched: 30 }],
  }

  it('shows the current channel campaign even when personal inventory is empty', () => {
    const state = parseDropsInventory({ campaigns: [], channelCampaigns: [availableCampaign] })
    expect(state.campaigns[0]).toMatchObject({ gameName: 'AION 2', isCurrentChannel: true })
    expect(state.campaigns[0].drops[0]).toMatchObject({ hasProgress: false, isReadyToClaim: false })
  })

  it('merges channel availability with completed personal progress without duplicate campaigns or lost drops', () => {
    const state = parseDropsInventory({
      channelCampaigns: [{ ...availableCampaign, timeBasedDrops: [...availableCampaign.timeBasedDrops, { id: 'next', requiredMinutesWatched: 60 }] }],
      campaigns: [{ ...availableCampaign, timeBasedDrops: [{ ...availableCampaign.timeBasedDrops[0], self: { currentMinutesWatched: 30, isClaimed: false, dropInstanceID: 'claim-voucher' } }] }],
    })
    expect(state.campaigns).toHaveLength(1)
    expect(state.campaigns[0].drops).toHaveLength(2)
    expect(state.campaigns[0].drops[0]).toMatchObject({ hasProgress: true, percent: 100, isReadyToClaim: true, dropInstanceId: 'claim-voucher' })
  })

  it('does not offer a claim for progress without a claim instance', () => {
    const state = parseDropsInventory({ campaigns: [{ ...availableCampaign, timeBasedDrops: [{ ...availableCampaign.timeBasedDrops[0], self: { currentMinutesWatched: 30 } }] }] })
    expect(state.campaigns[0].drops[0].isReadyToClaim).toBe(false)
  })

  it('really refreshes a ready empty cache when requested', async () => {
    globalThis.isTauri = true
    invoke.mockImplementation(command => Promise.resolve(command === 'get_cached_drops_inventory'
      ? { campaigns: [], status: 'ready', channel: 'cahos_gaming', updatedAt: Date.now() }
      : { campaigns: [], channelCampaigns: [availableCampaign], channel: 'cahos_gaming', status: 'ready' }))
    const state = await fetchUserDropsInventory('token', 'cahos_gaming', { force: true })
    expect(state.campaigns).toHaveLength(1)
    expect(invoke).toHaveBeenCalledWith('force_refresh_drops_watcher', { channel: 'cahos_gaming' })
    expect(invoke).not.toHaveBeenCalledWith('start_drops_watcher', expect.anything())
  })

  it('combines actual channel query responses with an empty web inventory', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, options) => {
      const { query } = JSON.parse(options.body)
      return { ok: true, json: async () => query.includes('query ChannelDrops')
        ? { data: { channel: { viewerDropCampaigns: [availableCampaign] } } }
        : query.includes('query DropChannel') ? { data: { user: { id: '73456543' } } }
        : { data: { currentUser: { inventory: { dropCampaignsInProgress: [] } } } } }
    })
    const state = await fetchUserDropsInventory('token', 'cahos_gaming')
    expect(state.campaigns[0]).toMatchObject({ isCurrentChannel: true, gameName: 'AION 2' })
    expect(state.error).toBeNull()
  })

  it('does not turn GraphQL rejection into an empty successful inventory', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ errors: [{ message: 'failed integrity check' }] }) })
    const state = await fetchUserDropsInventory('token')
    expect(state.status).toBe('error')
    expect(state.authRequired).toBe(false)
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
          claimDropRewards: {
            dropInstanceID: 'inst_999',
            status: 'ELIGIBLE_FOR_ALL',
          },
        },
      }),
    })

    const res = await claimDropReward('inst_999', 'oauth_token')
    expect(res.success).toBe(true)
    expect(res.dropInstanceId).toBe('inst_999')
  })

  it('does not announce a successful claim on GraphQL errors or missing confirmation', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ errors: [{ message: 'rejected' }] }) })
    await expect(claimDropReward('instance', 'token')).rejects.toThrow()
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { claimDropRewards: null } }) })
    await expect(claimDropReward('instance', 'token')).rejects.toThrow()
  })

  it('propagates native claim failures without a web fallback or false success', async () => {
    globalThis.isTauri = true
    const fetch = vi.spyOn(global, 'fetch')
    invoke.mockRejectedValue(new Error('native claim rejected'))
    await expect(claimDropReward('instance', 'token', 'a'.repeat(32))).rejects.toThrow('native claim rejected')
    expect(fetch).not.toHaveBeenCalled()
    invoke.mockResolvedValue(false)
    await expect(claimDropReward('instance', 'token', 'a'.repeat(32))).rejects.toThrow('no confirmó')
  })

  it('requires an embedded host for native claims and forwards its session without any popup fallback', async () => {
    globalThis.isTauri = true
    const fetch = vi.spyOn(global, 'fetch')
    await expect(claimDropReward('instance', 'token')).rejects.toThrow('inventario integrado')
    expect(invoke).not.toHaveBeenCalled()
    invoke.mockResolvedValue(true)
    await claimDropReward('instance', 'token', 'b'.repeat(32))
    expect(invoke).toHaveBeenCalledWith('claim_twitch_drop', { dropInstanceId: 'instance', inventorySession: 'b'.repeat(32) })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stops trying other client IDs when Twitch rejects claim integrity', async () => {
    const fetch = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true,
      json: async () => ({ errors: [{ message: 'failed integrity check', extensions: { code: 'IntegrityCheckFailed' } }] }) })
    await expect(claimDropReward('instance', 'token')).rejects.toThrow('failed integrity check')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
