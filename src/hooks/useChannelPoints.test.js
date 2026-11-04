import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChannelPoints, __clearRewardsCache } from './useChannelPoints'
import { getCustomRewards, getCustomRewardsGQL, getRedemptions } from '../utils/twitch'

vi.mock('../utils/twitch', () => ({
  getCustomRewards: vi.fn(), getCustomRewardsGQL: vi.fn(), getRedemptions: vi.fn(),
  redeemCustomReward: vi.fn(async () => ({ ok: false, code: 'CHANNEL_POINTS_OFFICIAL_REQUIRED' })),
}))
beforeEach(() => { vi.clearAllMocks(); __clearRewardsCache(); getCustomRewards.mockResolvedValue({ ok: true, data: [] }) })
const props = { broadcasterId: '123', userId: 'alice', userToken: 'test-token' }

describe('viewer reward catalog', () => {
  it('does not query without a channel and never queries creator redemption history as a viewer', async () => {
    const { result } = renderHook(() => useChannelPoints())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(getCustomRewards).not.toHaveBeenCalled()
    expect(getRedemptions).not.toHaveBeenCalled()
  })
  it('loads rewards and keeps an unavailable balance distinct from zero', async () => {
    getCustomRewards.mockResolvedValue({ ok: true, data: [{ id: 'r1' }], balance: 0 })
    const { result } = renderHook(() => useChannelPoints(props))
    await waitFor(() => expect(result.current.rewards).toEqual([{ id: 'r1' }]))
    expect(result.current.balance).toBe(0)
    getCustomRewards.mockResolvedValue({ ok: true, data: [{ id: 'r1' }] })
    await act(async () => result.current.refresh())
    expect(result.current.balance).toBeNull()
    expect(getRedemptions).not.toHaveBeenCalled()
  })
  it('uses cached data only for the same authenticated account and channel', async () => {
    getCustomRewards.mockResolvedValue({ ok: true, data: [{ id: 'r1' }], balance: 50 })
    const first = renderHook(() => useChannelPoints(props))
    await waitFor(() => expect(first.result.current.balance).toBe(50))
    renderHook(() => useChannelPoints(props))
    expect(getCustomRewards).toHaveBeenCalledTimes(1)
    const other = renderHook(() => useChannelPoints({ ...props, userId: 'bob' }))
    await waitFor(() => expect(other.result.current.loading).toBe(false))
    expect(getCustomRewards).toHaveBeenCalledTimes(2)
  })
  it('refresh invalidates a channel-login cache even without a broadcaster id', async () => {
    getCustomRewardsGQL.mockResolvedValue({ ok: true, data: [], balance: 50 })
    const { result } = renderHook(() => useChannelPoints({ userId: 'alice', userToken: 't', channel: 'kokoop' }))
    await waitFor(() => expect(result.current.balance).toBe(50))
    getCustomRewardsGQL.mockResolvedValue({ ok: true, data: [], balance: 80 })
    await act(async () => result.current.refresh())
    expect(result.current.balance).toBe(80)
  })
  it('ignores a previous account response arriving after the new one', async () => {
    let previous
    getCustomRewards.mockImplementationOnce(() => new Promise(resolve => { previous = resolve }))
    const { result, rerender } = renderHook(p => useChannelPoints(p), { initialProps: props })
    getCustomRewards.mockResolvedValue({ ok: true, data: [{ id: 'bob' }], balance: 20 })
    rerender({ ...props, userId: 'bob' })
    await waitFor(() => expect(result.current.balance).toBe(20))
    await act(async () => previous({ ok: true, data: [{ id: 'alice' }], balance: 100 }))
    expect(result.current.balance).toBe(20)
    expect(result.current.rewards).toEqual([{ id: 'bob' }])
  })
  it('does not reuse a signed-in balance after logout', async () => {
    getCustomRewards.mockResolvedValueOnce({ ok: true, data: [], balance: 50 })
    const { result, rerender } = renderHook(p => useChannelPoints(p), { initialProps: props })
    await waitFor(() => expect(result.current.balance).toBe(50))
    getCustomRewards.mockResolvedValue({ ok: false, error: 'Session required' })
    rerender({ ...props, userToken: null })
    await waitFor(() => expect(result.current.error).toBe('Session required'))
    expect(result.current.balance).toBeNull()
    getCustomRewards.mockResolvedValue({ ok: true, data: [], balance: 80 })
    rerender(props)
    await waitFor(() => expect(result.current.balance).toBe(80))
  })
  it('retains explicit read failures instead of calling them an empty catalog', async () => {
    getCustomRewards.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useChannelPoints(props))
    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.loading).toBe(false)
    expect(result.current.balance).toBeNull()
  })
  it('legacy redemption callers get official-required without a success result', async () => {
    const { result } = renderHook(() => useChannelPoints(props))
    let answer
    await act(async () => { answer = await result.current.redeem('r1') })
    expect(answer).toEqual({ ok: false, code: 'CHANNEL_POINTS_OFFICIAL_REQUIRED' })
  })
})
