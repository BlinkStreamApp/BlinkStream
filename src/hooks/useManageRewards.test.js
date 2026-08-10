

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const cpMocks = {
  getCustomRewards: vi.fn(),
  createCustomReward: vi.fn(),
  updateCustomReward: vi.fn(),
  deleteCustomReward: vi.fn(),
  getRedemptions: vi.fn(),
  updateRedemptionStatus: vi.fn(),
}
vi.mock('../utils/twitch', () => ({
  getCustomRewards: (...args) => cpMocks.getCustomRewards(...args),
  createCustomReward: (...args) => cpMocks.createCustomReward(...args),
  updateCustomReward: (...args) => cpMocks.updateCustomReward(...args),
  deleteCustomReward: (...args) => cpMocks.deleteCustomReward(...args),
  getRedemptions: (...args) => cpMocks.getRedemptions(...args),
  updateRedemptionStatus: (...args) => cpMocks.updateRedemptionStatus(...args),
}))

const { useManageRewards } = await import('./useManageRewards')

describe('useManageRewards', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.values(cpMocks).forEach(m => m.mockReset())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sin broadcasterId: no fetchea y queda en estado vacio', async () => {
    const { result } = renderHook(() => useManageRewards({ broadcasterId: null }))
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(cpMocks.getCustomRewards).not.toHaveBeenCalled()
    expect(result.current.rewards).toEqual([])
    expect(result.current.pendingRedemptions).toEqual([])
  })

  it('fetch inicial carga rewards', async () => {
    cpMocks.getCustomRewards.mockResolvedValue({
      ok: true,
      data: [{ id: 'r1', title: 'Reward 1', is_enabled: true }],
    })
    cpMocks.getRedemptions.mockResolvedValue({ ok: true, data: { data: [], cursor: null } })

    const { result } = renderHook(() => useManageRewards({ broadcasterId: '123', pollIntervalMs: 0 }))

    await waitFor(() => {
      expect(result.current.rewards.length).toBe(1)
    })
    expect(result.current.rewards[0].id).toBe('r1')
  })

  it('createReward: agrega la reward a la lista en caso de exito', async () => {
    cpMocks.getCustomRewards.mockResolvedValue({ ok: true, data: [] })
    cpMocks.getRedemptions.mockResolvedValue({ ok: true, data: { data: [], cursor: null } })
    cpMocks.createCustomReward.mockResolvedValue({
      ok: true,
      data: { id: 'r-new', title: 'New Reward', cost: 100 },
    })
    const { result } = renderHook(() => useManageRewards({ broadcasterId: '123', pollIntervalMs: 0 }))

    await waitFor(() => expect(result.current.loading).toBe(false))

    let res
    await act(async () => {
      res = await result.current.createReward({ title: 'New Reward', cost: 100 })
    })
    expect(res.ok).toBe(true)
    expect(result.current.rewards.length).toBe(1)
    expect(result.current.rewards[0].id).toBe('r-new')
  })

  it('createReward: no agrega si falla', async () => {
    cpMocks.getCustomRewards.mockResolvedValue({ ok: true, data: [] })
    cpMocks.getRedemptions.mockResolvedValue({ ok: true, data: { data: [], cursor: null } })
    cpMocks.createCustomReward.mockResolvedValue({ ok: false, error: 'Invalid' })
    const { result } = renderHook(() => useManageRewards({ broadcasterId: '123', pollIntervalMs: 0 }))

    await waitFor(() => expect(result.current.loading).toBe(false))

    let res
    await act(async () => {
      res = await result.current.createReward({ title: '', cost: 0 })
    })
    expect(res.ok).toBe(false)
    expect(result.current.rewards).toEqual([])
  })

  it('toggleReward: llama updateCustomReward con isEnabled invertido', async () => {
    cpMocks.getCustomRewards.mockResolvedValue({
      ok: true,
      data: [{ id: 'r1', is_enabled: true }],
    })
    cpMocks.getRedemptions.mockResolvedValue({ ok: true, data: { data: [], cursor: null } })
    cpMocks.updateCustomReward.mockResolvedValue({
      ok: true,
      data: { id: 'r1', is_enabled: false },
    })

    const { result } = renderHook(() => useManageRewards({ broadcasterId: '123', pollIntervalMs: 0 }))
    await waitFor(() => expect(result.current.rewards.length).toBe(1))

    await act(async () => {
      await result.current.toggleReward('r1', false)
    })

    expect(cpMocks.updateCustomReward).toHaveBeenCalledWith('123', 'r1', { is_enabled: false })
    expect(result.current.rewards[0].is_enabled).toBe(false)
  })

  it('archiveReward: elimina la reward de la lista', async () => {
    cpMocks.getCustomRewards.mockResolvedValue({
      ok: true,
      data: [{ id: 'r1' }, { id: 'r2' }],
    })
    cpMocks.getRedemptions.mockResolvedValue({ ok: true, data: { data: [], cursor: null } })
    cpMocks.deleteCustomReward.mockResolvedValue({ ok: true, data: { id: 'r1' } })

    const { result } = renderHook(() => useManageRewards({ broadcasterId: '123', pollIntervalMs: 0 }))
    await waitFor(() => expect(result.current.rewards.length).toBe(2))

    await act(async () => {
      await result.current.archiveReward('r1')
    })

    expect(result.current.rewards.length).toBe(1)
    expect(result.current.rewards[0].id).toBe('r2')
  })

  it('fulfillRedemption: remueve de pending y llama updateRedemptionStatus', async () => {
    const pending = [
      { id: 'rd-1', reward_id: 'r1', user_name: 'alice', redeemed_at: '2026-01-01T00:00:00Z' },
      { id: 'rd-2', reward_id: 'r1', user_name: 'bob', redeemed_at: '2026-01-02T00:00:00Z' },
    ]
    cpMocks.getCustomRewards.mockResolvedValue({
      ok: true,
      data: [{ id: 'r1', title: 'R1' }],
    })
    cpMocks.getRedemptions.mockResolvedValue({
      ok: true,
      data: { data: pending, cursor: null },
    })
    cpMocks.updateRedemptionStatus.mockResolvedValue({ ok: true })

    const { result } = renderHook(() => useManageRewards({ broadcasterId: '123', pollIntervalMs: 0 }))
    await waitFor(() => expect(result.current.pendingRedemptions.length).toBe(2))

    await act(async () => {
      await result.current.fulfillRedemption('rd-1')
    })

    expect(cpMocks.updateRedemptionStatus).toHaveBeenCalledWith('123', 'r1', ['rd-1'], 'FULFILLED')
    expect(result.current.pendingRedemptions.length).toBe(1)
    expect(result.current.pendingRedemptions[0].id).toBe('rd-2')
  })

  it('bulkFulfill: agrupa por reward_id y aprueba en bloque', async () => {
    const pendingByReward = {
      r1: [
        { id: 'rd-1', reward_id: 'r1' },
        { id: 'rd-2', reward_id: 'r1' },
      ],
      r2: [
        { id: 'rd-3', reward_id: 'r2' },
      ],
    }
    cpMocks.getCustomRewards.mockResolvedValue({
      ok: true,
      data: [{ id: 'r1', title: 'R1' }, { id: 'r2', title: 'R2' }],
    })
    cpMocks.getRedemptions.mockImplementation(async (bId, rewardId) => {
      const list = pendingByReward[rewardId] || []
      return { ok: true, data: { data: list, cursor: null } }
    })
    cpMocks.updateRedemptionStatus.mockResolvedValue({ ok: true })

    const { result } = renderHook(() => useManageRewards({ broadcasterId: '123', pollIntervalMs: 0 }))
    await waitFor(() => expect(result.current.pendingRedemptions.length).toBe(3))

    await act(async () => {
      await result.current.bulkFulfill(['rd-1', 'rd-3'])
    })

    expect(cpMocks.updateRedemptionStatus).toHaveBeenCalledTimes(2)
    expect(cpMocks.updateRedemptionStatus).toHaveBeenCalledWith('123', 'r1', ['rd-1'], 'FULFILLED')
    expect(cpMocks.updateRedemptionStatus).toHaveBeenCalledWith('123', 'r2', ['rd-3'], 'FULFILLED')
    expect(result.current.pendingRedemptions.length).toBe(1) 
  })

  it('refresh() refetchea rewards y pending', async () => {
    cpMocks.getCustomRewards
      .mockResolvedValueOnce({ ok: true, data: [{ id: 'r1' }] })
      .mockResolvedValueOnce({ ok: true, data: [{ id: 'r1' }, { id: 'r2' }] })
    cpMocks.getRedemptions.mockResolvedValue({ ok: true, data: { data: [], cursor: null } })

    const { result } = renderHook(() => useManageRewards({ broadcasterId: '123', pollIntervalMs: 0 }))
    await waitFor(() => expect(result.current.rewards.length).toBe(1))

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.rewards.length).toBe(2)
    expect(cpMocks.getCustomRewards).toHaveBeenCalledTimes(2)
  })

  it('FIX P0-2: una reward que falla (404 archivada) no rompe el poll de las demas', async () => {

    cpMocks.getCustomRewards.mockResolvedValue({
      ok: true,
      data: [
        { id: 'r-ok-1', title: 'Reward OK 1' },
        { id: 'r-bad', title: 'Reward Archived' },  
        { id: 'r-ok-2', title: 'Reward OK 2' },
      ],
    })

    cpMocks.getRedemptions.mockImplementation(async (_bId, rewardId) => {
      if (rewardId === 'r-bad') {
        return { ok: false, error: 'Twitch HTTP 404', code: 'CHANNEL_POINTS_LIST_FAILED' }
      }
      return {
        ok: true,
        data: {
          data: [
            { id: `rd-${rewardId}-1`, reward_id: rewardId, user_name: 'user1', redeemed_at: '2026-01-01T00:00:00Z' },
          ],
          cursor: null,
        },
      }
    })
    const { result } = renderHook(() => useManageRewards({ broadcasterId: '123', pollIntervalMs: 0 }))

    await waitFor(() => expect(result.current.pendingRedemptions.length).toBe(2))
    const rewardIds = result.current.pendingRedemptions.map(p => p.reward_id)
    expect(rewardIds).toContain('r-ok-1')
    expect(rewardIds).toContain('r-ok-2')
    expect(rewardIds).not.toContain('r-bad')

    expect(result.current.error).toBeNull()
  })

  it('FIX P0-2: si TODAS las rewards fallan, el state queda vacio y NO crashea', async () => {

    cpMocks.getCustomRewards.mockResolvedValue({
      ok: true,
      data: [{ id: 'r1' }, { id: 'r2' }],
    })
    cpMocks.getRedemptions.mockResolvedValue({
      ok: false,
      error: 'Twitch HTTP 500',
      code: 'CHANNEL_POINTS_LIST_FAILED',
    })
    const { result } = renderHook(() => useManageRewards({ broadcasterId: '123', pollIntervalMs: 0 }))

    await waitFor(() => expect(result.current.rewards.length).toBe(2))

    await new Promise(r => setTimeout(r, 20))
    expect(result.current.pendingRedemptions).toEqual([])
  })

  it('FIX P1-3: rewardsRef se sincroniza en useEffect (NO mutacion durante render)', async () => {

    cpMocks.getCustomRewards.mockResolvedValue({ ok: true, data: [] })
    cpMocks.getRedemptions.mockResolvedValue({ ok: true, data: { data: [], cursor: null } })
    cpMocks.createCustomReward.mockResolvedValue({
      ok: true,
      data: { id: 'r-1', title: 'R1' },
    })
    cpMocks.deleteCustomReward.mockResolvedValue({ ok: true, data: { id: 'r-1' } })
    const { result } = renderHook(() => useManageRewards({ broadcasterId: '123', pollIntervalMs: 0 }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.createReward({ title: 'R1' })
    })
    expect(result.current.rewards.length).toBe(1)

    await act(async () => {
      await result.current.archiveReward('r-1')
    })
    expect(result.current.rewards.length).toBe(0)
    expect(cpMocks.deleteCustomReward).toHaveBeenCalledWith('123', 'r-1')
  })
})
