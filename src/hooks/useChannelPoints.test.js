

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const cpMocks = {
  getCustomRewards: vi.fn(),
  getRedemptions: vi.fn(),
  redeemCustomReward: vi.fn(),
}
vi.mock('../utils/twitch', () => ({
  getCustomRewards: (...args) => cpMocks.getCustomRewards(...args),
  getRedemptions: (...args) => cpMocks.getRedemptions(...args),
  redeemCustomReward: (...args) => cpMocks.redeemCustomReward(...args),
}))

const { useChannelPoints, __clearRewardsCache } = await import('./useChannelPoints')

describe('useChannelPoints', () => {
  beforeEach(() => {
    localStorage.clear()
    __clearRewardsCache()
    cpMocks.getCustomRewards.mockReset()
    cpMocks.getRedemptions.mockReset()
    cpMocks.redeemCustomReward.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('estado inicial: loading=true, sin rewards, sin error', async () => {
    cpMocks.getCustomRewards.mockResolvedValue({ ok: true, data: [] })
    cpMocks.getRedemptions.mockResolvedValue({ ok: true, data: { data: [], cursor: null } })

    const { result } = renderHook(() => useChannelPoints({ broadcasterId: '123' }))
    expect(result.current.loading).toBe(true)
    expect(result.current.rewards).toEqual([])
    expect(result.current.error).toBeNull()

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })

  it('sin broadcasterId: NO hace fetch y queda en estado vacio', async () => {
    const { result } = renderHook(() => useChannelPoints({ broadcasterId: null }))
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(cpMocks.getCustomRewards).not.toHaveBeenCalled()
    expect(result.current.rewards).toEqual([])
  })

  it('fetch exitoso: rewards se cargan y error queda null', async () => {
    const mockRewards = [
      { id: 'r1', title: 'Hydrate', cost: 50 },
      { id: 'r2', title: 'Make a joke', cost: 100 },
    ]
    cpMocks.getCustomRewards.mockResolvedValue({ ok: true, data: mockRewards })
    cpMocks.getRedemptions.mockResolvedValue({ ok: true, data: { data: [], cursor: null } })

    const { result } = renderHook(() => useChannelPoints({ broadcasterId: '123' }))

    await waitFor(() => {
      expect(result.current.rewards).toEqual(mockRewards)
    })
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('cache: segundo mount con mismo broadcasterId no vuelve a fetchear', async () => {
    cpMocks.getCustomRewards.mockResolvedValue({ ok: true, data: [{ id: 'r1', cost: 50 }] })
    cpMocks.getRedemptions.mockResolvedValue({ ok: true, data: { data: [], cursor: null } })

    const { result: r1 } = renderHook(() => useChannelPoints({ broadcasterId: 'cache-test' }))
    await waitFor(() => expect(r1.current.rewards.length).toBe(1))
    expect(cpMocks.getCustomRewards).toHaveBeenCalledTimes(1)

    const { result: r2 } = renderHook(() => useChannelPoints({ broadcasterId: 'cache-test' }))
    await waitFor(() => expect(r2.current.rewards.length).toBe(1))

    expect(cpMocks.getCustomRewards).toHaveBeenCalledTimes(1)
  })

  it('refresh() invalida la cache y refetchea', async () => {
    cpMocks.getCustomRewards.mockResolvedValueOnce({ ok: true, data: [{ id: 'r1', cost: 50 }] })
    cpMocks.getRedemptions.mockResolvedValue({ ok: true, data: { data: [], cursor: null } })

    const { result } = renderHook(() => useChannelPoints({ broadcasterId: 'refresh-test' }))
    await waitFor(() => expect(result.current.rewards.length).toBe(1))

    cpMocks.getCustomRewards.mockResolvedValueOnce({ ok: true, data: [{ id: 'r1' }, { id: 'r2' }] })
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.rewards.length).toBe(2)
    expect(cpMocks.getCustomRewards).toHaveBeenCalledTimes(2)
  })

  it('redeem() exitoso devuelve ok=true y NO actualiza rewards', async () => {
    cpMocks.getCustomRewards.mockResolvedValue({ ok: true, data: [{ id: 'r1', cost: 50 }] })
    cpMocks.getRedemptions.mockResolvedValue({ ok: true, data: { data: [], cursor: null } })
    cpMocks.redeemCustomReward.mockResolvedValue({ ok: true, data: { id: 'rd-1' } })

    const { result } = renderHook(() =>
      useChannelPoints({ broadcasterId: '123', userToken: 'user_tok' }),
    )
    await waitFor(() => expect(result.current.rewards.length).toBe(1))

    let res
    await act(async () => {
      res = await result.current.redeem('r1', 'hello world')
    })
    expect(res.ok).toBe(true)
    expect(cpMocks.redeemCustomReward).toHaveBeenCalledWith('123', 'r1', 'hello world', 'user_tok')
  })

  it('redeem() sin userToken devuelve ok=false sin pegarle a Twitch', async () => {
    cpMocks.getCustomRewards.mockResolvedValue({ ok: true, data: [] })
    cpMocks.getRedemptions.mockResolvedValue({ ok: true, data: { data: [], cursor: null } })

    const { result } = renderHook(() =>
      useChannelPoints({ broadcasterId: '123', userToken: null }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    let res
    await act(async () => {
      res = await result.current.redeem('r1')
    })
    expect(res.ok).toBe(false)
    expect(cpMocks.redeemCustomReward).not.toHaveBeenCalled()
  })

  it('fetch con error: setea error y deja rewards vacio', async () => {
    cpMocks.getCustomRewards.mockResolvedValue({ ok: false, error: 'Twitch HTTP 401', code: 'AUTH_FAILED' })
    cpMocks.getRedemptions.mockResolvedValue({ ok: true, data: { data: [], cursor: null } })

    const { result } = renderHook(() => useChannelPoints({ broadcasterId: 'fail-test' }))

    await waitFor(() => {
      expect(result.current.error).toBe('Twitch HTTP 401')
    })
    expect(result.current.rewards).toEqual([])
  })

  it('myRedemptions se cargan despues del fetch inicial', async () => {
    const rewards = [
      { id: 'r1', title: 'Reward 1' },
      { id: 'r2', title: 'Reward 2' },
    ]

    cpMocks.getCustomRewards.mockResolvedValue({ ok: true, data: rewards })
    cpMocks.getRedemptions.mockImplementation(async (bId, rId) => {
      if (rId === 'r1') {
        return { ok: true, data: { data: [
          { id: 'rd-1', user_id: '999', reward_id: 'r1', redeemed_at: '2026-01-01T00:00:00Z', status: 'FULFILLED' },
        ], cursor: null } }
      }
      return { ok: true, data: { data: [], cursor: null } }
    })

    const { result } = renderHook(() =>
      useChannelPoints({ broadcasterId: '123', userId: '999' }),
    )
    await waitFor(() => {
      expect(result.current.myRedemptions.length).toBe(1)
    })
    expect(result.current.myRedemptions[0].id).toBe('rd-1')
  })

  it('FIX 1: fetchMyRedemptions paraleliza con concurrency<=3', async () => {

    const rewards = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, title: `R${i}` }))
    cpMocks.getCustomRewards.mockResolvedValue({ ok: true, data: rewards })

    let inFlight = 0
    let maxInFlight = 0
    cpMocks.getRedemptions.mockImplementation(async (_bId, rId) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)

      await new Promise((r) => setTimeout(r, 10))
      inFlight -= 1
      return {
        ok: true,
        data: { data: [
          { id: `rd-${rId}`, user_id: '999', reward_id: rId, redeemed_at: '2026-01-01T00:00:00Z', status: 'FULFILLED' },
        ], cursor: null },
      }
    })

    const { result } = renderHook(() =>
      useChannelPoints({ broadcasterId: '123', userId: '999' }),
    )
    await waitFor(() => {
      expect(result.current.myRedemptions.length).toBe(5)
    })

    expect(maxInFlight).toBeLessThanOrEqual(3)
    expect(maxInFlight).toBeGreaterThan(1) 
    expect(cpMocks.getRedemptions).toHaveBeenCalledTimes(5)
  })
})
