import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTwitchDrops } from './useTwitchDrops'
import * as dropsUtil from '../utils/drops'

describe('useTwitchDrops', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes with default autoClaim true and empty campaigns without token', () => {
    const { result } = renderHook(() => useTwitchDrops(''))
    expect(result.current.campaigns).toEqual([])
    expect(result.current.autoClaim).toBe(true)
  })

  it('fetches campaigns on mount and computes claimable count', async () => {
    const fakeCampaigns = [
      {
        id: 'c1',
        name: 'Apex Legends Drop',
        drops: [
          {
            id: 'd1',
            name: 'Apex Skin',
            percent: 100,
            isReadyToClaim: true,
            dropInstanceId: 'inst_1',
          },
        ],
      },
    ]

    vi.spyOn(dropsUtil, 'fetchUserDropsInventory').mockResolvedValue({
      campaigns: fakeCampaigns,
    })
    vi.spyOn(dropsUtil, 'claimDropReward').mockResolvedValue({ success: true })

    const { result } = renderHook(() => useTwitchDrops('oauth_token'))

    await waitFor(() => {
      expect(result.current.campaigns.length).toBe(1)
    })

    expect(result.current.claimableCount).toBe(1)
  })

  it('toggles autoClaim and persists to localStorage', () => {
    const { result } = renderHook(() => useTwitchDrops('oauth_token'))

    expect(result.current.autoClaim).toBe(true)

    act(() => {
      result.current.toggleAutoClaim()
    })

    expect(result.current.autoClaim).toBe(false)
    expect(localStorage.getItem('blinkstream_drops_autoclaim')).toBe('false')
  })
})
