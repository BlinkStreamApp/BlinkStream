import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTwitchDrops } from './useTwitchDrops'
import * as dropsUtil from '../utils/drops'

describe('useTwitchDrops', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('waits for the integrated host before requesting a claim and passes its session', async () => {
    localStorage.setItem('blinkstream_drops_autoclaim', 'false')
    let ready
    const prepare = vi.fn(() => new Promise(resolve => { ready = resolve }))
    vi.spyOn(dropsUtil, 'fetchUserDropsInventory').mockResolvedValue({ campaigns: [], status: 'ready' })
    const claim = vi.spyOn(dropsUtil, 'claimDropReward').mockResolvedValue({ success: true })
    const { result, unmount } = renderHook(() => useTwitchDrops('token', null, prepare))
    let pending
    await act(async () => { pending = result.current.claimDrop('instance') })
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(claim).not.toHaveBeenCalled()
    await act(async () => { ready('a'.repeat(32)); await pending })
    expect(claim).toHaveBeenCalledWith('instance', 'token', 'a'.repeat(32))
    unmount()
  })

  it('does not reclaim and refresh repeatedly while Twitch still returns the same completed Drop', async () => {
    let refreshCount = 0
    vi.spyOn(dropsUtil, 'fetchUserDropsInventory').mockImplementation(async () => ({
      campaigns: ++refreshCount > 6 ? [] : [{ id: 'c1', drops: [{ id: 'd1',
        isReadyToClaim: true, dropInstanceId: 'completed-instance', benefitName: 'Voucher' }] }],
      status: 'ready',
    }))
    const claim = vi.spyOn(dropsUtil, 'claimDropReward').mockResolvedValue({ success: true })
    const { result, unmount } = renderHook(() => useTwitchDrops('token', 'cahos_gaming'))
    await waitFor(() => expect(result.current.lastClaimedDrop?.id).toBe('completed-instance'))
    await act(async () => {})
    expect(claim).toHaveBeenCalledTimes(1)
    expect(refreshCount).toBe(2)
    unmount()
  })

  it('silently polls without overlapping slow inventory requests', async () => {
    vi.useFakeTimers()
    let resolveInventory
    const fetch = vi.spyOn(dropsUtil, 'fetchUserDropsInventory').mockImplementation(() => new Promise(resolve => { resolveInventory = resolve }))
    const { result, unmount } = renderHook(() => useTwitchDrops('token', 'cahos_gaming'))
    await act(async () => {})
    await act(async () => { await vi.advanceTimersByTimeAsync(45000) })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.current.loading).toBe(false)
    await act(async () => { resolveInventory({ campaigns: [], status: 'ready' }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result.current.loading).toBe(false)
    unmount()
    await act(async () => { resolveInventory({ campaigns: [], status: 'ready' }) })
  })

  it('backs off failed automatic claims rather than retrying on every inventory update', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(dropsUtil, 'fetchUserDropsInventory').mockImplementation(async () => ({
      campaigns: [{ id: 'c1', drops: [{ id: 'd1', isReadyToClaim: true, dropInstanceId: 'failed-instance' }] }], status: 'ready',
    }))
    const claim = vi.spyOn(dropsUtil, 'claimDropReward').mockRejectedValue(new Error('claim rejected'))
    const { result, unmount } = renderHook(() => useTwitchDrops('token'))
    await act(async () => {})
    expect(claim).toHaveBeenCalledTimes(1)
    expect(result.current.lastClaimedDrop).toBeNull()
    expect(result.current.claimError).toBe('claim rejected')
    await act(async () => { await vi.advanceTimersByTimeAsync(59999) })
    expect(claim).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(claim).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('pauses integrity-rejected claims across updates and modal remounts while still syncing progress', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetch = vi.spyOn(dropsUtil, 'fetchUserDropsInventory').mockImplementation(async () => ({
      campaigns: ['c1', 'c2'].map(id => ({ id, drops: [{ id, isReadyToClaim: true, dropInstanceId: id }] })), status: 'ready',
    }))
    const claim = vi.spyOn(dropsUtil, 'claimDropReward').mockRejectedValue('failed integrity check')
    const first = renderHook(() => useTwitchDrops('token'))
    await act(async () => {})
    expect(claim).toHaveBeenCalledTimes(1)
    expect(first.result.current.claimBlocked).toBe(true)
    expect(first.result.current.autoClaim).toBe(false)
    expect(first.result.current.lastClaimedDrop).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(180000) })
    expect(claim).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls.length).toBeGreaterThan(1)
    first.unmount()
    const second = renderHook(() => useTwitchDrops('token'))
    await act(async () => {})
    expect(second.result.current.claimBlocked).toBe(true)
    expect(second.result.current.autoClaim).toBe(false)
    expect(claim).toHaveBeenCalledTimes(1)
    await act(async () => { await second.result.current.claimDrop('c2') })
    expect(claim).toHaveBeenCalledTimes(1)
    act(() => second.result.current.toggleAutoClaim())
    await act(async () => {})
    expect(claim).toHaveBeenCalledTimes(2)
    expect(second.result.current.claimBlocked).toBe(true)
    second.unmount()
  })

  it('does not automatically repeat an official click whose outcome cannot be confirmed', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(dropsUtil, 'fetchUserDropsInventory').mockImplementation(async () => ({
      campaigns: [{ id: 'c1', drops: [{ id: 'd1', isReadyToClaim: true, dropInstanceId: 'instance' }] }], status: 'ready',
    }))
    const claim = vi.spyOn(dropsUtil, 'claimDropReward').mockRejectedValue(new Error('No se pudo confirmar el reclamo en la página oficial. Revisa esa ventana y actualiza el panel.'))
    const { result, unmount } = renderHook(() => useTwitchDrops('token'))
    await act(async () => {})
    await act(async () => { await vi.advanceTimersByTimeAsync(180000) })
    expect(claim).toHaveBeenCalledTimes(1)
    expect(result.current.lastClaimedDrop).toBeNull()
    await act(async () => { await result.current.claimDrop('instance') })
    expect(claim).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('exposes watcher authentication errors instead of treating them as an empty inventory', async () => {
    vi.spyOn(dropsUtil, 'fetchUserDropsInventory').mockResolvedValue({
      campaigns: [],
      authRequired: true,
      status: 'auth-required',
      error: 'Twitch GQL HTTP 401',
      updatedAt: 1234,
    })

    const { result } = renderHook(() => useTwitchDrops('oauth_token'))

    await waitFor(() => {
      expect(result.current.authRequired).toBe(true)
    })
    expect(result.current.syncStatus).toBe('auth-required')
    expect(result.current.syncError).toBe('Twitch GQL HTTP 401')
    expect(result.current.lastUpdatedAt).toBe(1234)
  })

  it('stops reopening the official window after closure and preserves the pause across modal remounts', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(dropsUtil, 'fetchUserDropsInventory').mockResolvedValue({
      campaigns: [{ id: 'c1', drops: [{ id: 'd1', isReadyToClaim: true, dropInstanceId: 'instance' }] }], status: 'ready',
    })
    const claim = vi.spyOn(dropsUtil, 'claimDropReward').mockRejectedValue(new Error('La ventana oficial de Drops se ha cerrado'))
    const first = renderHook(() => useTwitchDrops('token'))
    await act(async () => {})
    expect(first.result.current.autoClaim).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(180000) })
    expect(claim).toHaveBeenCalledTimes(1)
    await act(async () => { first.result.current.toggleAutoClaim() })
    expect(claim).toHaveBeenCalledTimes(2)
    expect(first.result.current.autoClaim).toBe(false)
    first.unmount()
    const second = renderHook(() => useTwitchDrops('token'))
    await act(async () => {})
    expect(second.result.current.autoClaim).toBe(false)
    expect(claim).toHaveBeenCalledTimes(2)
    second.unmount()
  })

  it('clears a closure error when inventory confirms the manually claimed Drop without its old instance ID', async () => {
    localStorage.setItem('blinkstream_drops_autoclaim', 'false')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetch = vi.spyOn(dropsUtil, 'fetchUserDropsInventory').mockResolvedValue({
      campaigns: [{ id: 'c1', drops: [{ id: 'd1', isReadyToClaim: true, dropInstanceId: 'instance' }] }], status: 'ready',
    })
    vi.spyOn(dropsUtil, 'claimDropReward').mockRejectedValue(new Error('La ventana oficial de Drops se ha cerrado'))
    const { result, unmount } = renderHook(() => useTwitchDrops('token'))
    await waitFor(() => expect(result.current.claimableCount).toBe(1))
    await act(async () => { await result.current.claimDrop('instance', 'Voucher') })
    expect(result.current.claimError).not.toBeNull()
    fetch.mockResolvedValue({ campaigns: [{ id: 'c1', drops: [{ id: 'd1', isClaimed: true, isReadyToClaim: false, dropInstanceId: null }] }], status: 'ready' })
    await act(async () => { await result.current.refreshDrops(false) })
    expect(result.current.claimError).toBeNull()
    expect(result.current.lastClaimedDrop?.id).toBe('instance')
    expect(result.current.claimableCount).toBe(0)
    unmount()
  })

  it('does not replace confirmed inventory with a late closure error from the native command', async () => {
    localStorage.setItem('blinkstream_drops_autoclaim', 'false')
    let rejectClaim
    const fetch = vi.spyOn(dropsUtil, 'fetchUserDropsInventory').mockResolvedValue({
      campaigns: [{ id: 'c1', drops: [{ id: 'd1', isReadyToClaim: true, dropInstanceId: 'instance' }] }], status: 'ready',
    })
    vi.spyOn(dropsUtil, 'claimDropReward').mockImplementation(() => new Promise((_, reject) => { rejectClaim = reject }))
    const { result, unmount } = renderHook(() => useTwitchDrops('token'))
    await waitFor(() => expect(result.current.claimableCount).toBe(1))
    let pending
    await act(async () => { pending = result.current.claimDrop('instance', 'Voucher') })
    fetch.mockResolvedValue({ campaigns: [{ id: 'c1', drops: [{ id: 'd1', isClaimed: true, isReadyToClaim: false, dropInstanceId: null }] }], status: 'ready' })
    await act(async () => { await result.current.refreshDrops(false) })
    await act(async () => { rejectClaim(new Error('La ventana oficial de Drops se ha cerrado')); await pending })
    expect(result.current.claimError).toBeNull()
    expect(result.current.lastClaimedDrop?.id).toBe('instance')
    expect(result.current.claimingIds.size).toBe(0)
    unmount()
  })

  it('replaces an indefinitely starting watcher with a visible timeout error', async () => {
    vi.useFakeTimers()
    vi.spyOn(dropsUtil, 'fetchUserDropsInventory').mockResolvedValue({
      campaigns: [],
      authRequired: false,
      status: 'starting',
      error: null,
      updatedAt: 1234,
    })

    const { result, unmount } = renderHook(() => useTwitchDrops('oauth_token'))
    await act(async () => {})

    act(() => {
      vi.advanceTimersByTime(22001)
    })

    expect(result.current.syncStatus).toBe('bridge-timeout')
    expect(result.current.syncError).toBe('La sincronización nativa de Drops no respondió a tiempo.')
    unmount()
  })
})
