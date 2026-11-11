import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useTwitchDrops } from './useTwitchDrops'
import { bindDropsAccount, checkDropsSession, connectDropsSession, disconnectDropsSession, getDropsSnapshot, setDropsAutoClaim, setDropsRemember } from '../utils/dropsSession'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
const campaigns = () => [{ id: 'c', name: 'Campaign', game: { name: 'Game' }, timeBasedDrops: [
  { id: 'd', name: 'Reward', requiredMinutesWatched: 60, self: { currentMinutesWatched: 60, isClaimed: false, dropInstanceID: 'issued' } },
  { id: 'e', name: 'Second', requiredMinutesWatched: 120, self: { currentMinutesWatched: 120, isClaimed: false, dropInstanceID: 'second' } },
] }]
const inventory = () => ({ accountLogin: 'alice', accountId: '100', campaigns: campaigns(), catalogCampaigns: [], updatedAt: 1000 })

beforeEach(async () => {
  await disconnectDropsSession()
  bindDropsAccount('')
  vi.stubGlobal('isTauri', true)
  invoke.mockReset().mockImplementation(async (command, args) => command === 'experimental_drops_status'
    ? { enabled: true, phase: args?.session ? 'connected' : 'idle', login: 'alice', accountId: '100' }
    : command === 'experimental_drops_probe' ? inventory() : undefined)
})
afterEach(async () => { cleanup(); await disconnectDropsSession(); vi.useRealTimers(); vi.unstubAllGlobals() })

async function connected() {
  const hook = renderHook(() => useTwitchDrops('alice'))
  await act(async () => { await connectDropsSession() })
  await act(async () => { await checkDropsSession() })
  expect(hook.result.current.phase).toBe('ready')
  return hook
}

it('does not authorize, start a legacy watcher or claim automatically on mount', async () => {
  const { result } = renderHook(() => useTwitchDrops('alice'))
  await act(async () => {})
  expect(result.current.phase).toBe('idle')
  expect(result.current.campaigns).toEqual([])
  expect(invoke.mock.calls.every(([command]) => command === 'experimental_drops_status')).toBe(true)
})

it('loads automatically after same-account approval and shares one result between subscribers', async () => {
  const first = await connected()
  const second = renderHook(() => useTwitchDrops('alice'))
  await act(async () => {})
  expect(first.result.current.claimableCount).toBe(2)
  expect(second.result.current.campaigns).toEqual(first.result.current.campaigns)
  expect(invoke.mock.calls.filter(([command]) => command === 'experimental_drops_probe')).toHaveLength(1)
})

it('keeps the connection and data when the panel closes and reopens', async () => {
  const first = await connected()
  const session = first.result.current.session
  first.unmount()
  const second = renderHook(() => useTwitchDrops('alice'))
  await act(async () => {})
  expect(second.result.current.session).toBe(session)
  expect(second.result.current.claimableCount).toBe(2)
  expect(invoke.mock.calls.some(([command]) => command === 'disconnect_experimental_drops')).toBe(false)
})

it('deduplicates refreshes and permits later inventory updates on the same connection', async () => {
  const hook = await connected()
  let resolve
  invoke.mockImplementation(command => command === 'experimental_drops_probe' ? new Promise(done => { resolve = done }) : Promise.resolve())
  let first, second
  act(() => { first = hook.result.current.refresh(); second = hook.result.current.refresh() })
  expect(first).toBe(second)
  await act(async () => { resolve({ ...inventory(), updatedAt: 2000 }); await first })
  expect(hook.result.current.updatedAt).toBe(2000)
  expect(hook.result.current.phase).toBe('ready')
})

it('discards a previous account immediately and ignores its delayed response', async () => {
  const hook = await connected()
  let resolve
  invoke.mockImplementation(command => command === 'experimental_drops_probe' ? new Promise(done => { resolve = done }) : Promise.resolve())
  let pending
  act(() => { pending = hook.result.current.refresh() })
  act(() => bindDropsAccount('bob'))
  expect(getDropsSnapshot().campaigns).toEqual([])
  await act(async () => { resolve(inventory()); await pending })
  expect(getDropsSnapshot().account).toBe('bob')
  expect(getDropsSnapshot().campaigns).toEqual([])
})

it('rejects inventory belonging to another account and clears the native session', async () => {
  const hook = await connected()
  invoke.mockImplementation(async command => command === 'experimental_drops_probe' ? { ...inventory(), accountId: '200' } : undefined)
  await act(async () => { await hook.result.current.refresh() })
  expect(hook.result.current.campaigns).toEqual([])
  expect(hook.result.current.session).toBeNull()
  expect(hook.result.current.error).toBe('account')
  expect(invoke).toHaveBeenCalledWith('disconnect_experimental_drops', expect.any(Object))
})

it('uses the native-verified Twitch ID even when the interface account label differs', async () => {
  const hook = renderHook(() => useTwitchDrops('Display Alias'))
  await act(async () => { await connectDropsSession(); await checkDropsSession() })
  expect(hook.result.current.phase).toBe('ready')
  expect(hook.result.current.accountId).toBe('100')
  expect(hook.result.current.verifiedLogin).toBe('alice')
  expect(hook.result.current.claimableCount).toBe(2)
})

it('does not load inventory without the native-verified account ID and offers reconnection', async () => {
  invoke.mockResolvedValue({ enabled: true, phase: 'connected', login: 'alice' })
  const hook = renderHook(() => useTwitchDrops('alice'))
  await act(async () => { await connectDropsSession(); await checkDropsSession() })
  expect(hook.result.current.session).toBeNull()
  expect(hook.result.current.phase).toBe('idle')
  expect(hook.result.current.error).toBe('account')
  expect(invoke.mock.calls.some(([command]) => command === 'experimental_drops_probe')).toBe(false)
})

it('serializes a manual claim, waits for confirmed inventory and allows a distinct next reward', async () => {
  const hook = await connected()
  let resolve
  invoke.mockImplementation(command => command === 'claim_experimental_drop' ? new Promise(done => { resolve = done }) : Promise.resolve())
  let pending
  act(() => { pending = hook.result.current.claimDrop('issued'); void hook.result.current.claimDrop('issued') })
  expect(invoke.mock.calls.filter(([command]) => command === 'claim_experimental_drop')).toHaveLength(1)
  expect(hook.result.current.claimOutcome).toBeNull()
  const claimed = campaigns()
  claimed[0].timeBasedDrops[0].self.isClaimed = true
  await act(async () => { resolve({ outcome: 'claimed', campaigns: claimed, updatedAt: 2000 }); await pending })
  expect(hook.result.current.claimableCount).toBe(1)
  expect(hook.result.current.claimOutcome).toBe('claimed')
  act(() => { pending = hook.result.current.claimDrop('second') })
  expect(invoke.mock.calls.filter(([command]) => command === 'claim_experimental_drop')).toHaveLength(2)
  claimed[0].timeBasedDrops[1].self.isClaimed = true
  await act(async () => { resolve({ outcome: 'already-claimed', campaigns: claimed, updatedAt: 3000 }); await pending })
  expect(hook.result.current.claimOutcome).toBe('already-claimed')
})

it('pauses all claims after an unconfirmed result and keeps the pause across panel remounts', async () => {
  const hook = await connected()
  invoke.mockResolvedValue({ status: 'ELIGIBLE_FOR_ALL' })
  await act(async () => { await hook.result.current.claimDrop('issued') })
  expect(hook.result.current.claimBlocked).toBe(true)
  expect(hook.result.current.claimOutcome).toBeNull()
  hook.unmount()
  const second = renderHook(() => useTwitchDrops('alice'))
  await act(async () => { await second.result.current.claimDrop('second') })
  expect(invoke.mock.calls.filter(([command]) => command === 'claim_experimental_drop')).toHaveLength(1)
})

it('clears campaigns and authorization on logout', async () => {
  const hook = await connected()
  act(() => bindDropsAccount(''))
  expect(hook.result.current.campaigns).toEqual([])
  expect(getDropsSnapshot().session).toBeNull()
})

it('does not accept a claimed outcome without the corresponding inventory state', async () => {
  const hook = await connected()
  invoke.mockResolvedValue({ outcome: 'claimed', campaigns: campaigns(), updatedAt: 2000 })
  await act(async () => { await hook.result.current.claimDrop('issued') })
  expect(hook.result.current.claimOutcome).toBeNull()
  expect(hook.result.current.claimBlocked).toBe(true)
  expect(hook.result.current.claimableCount).toBe(2)
})

it('uses one periodic refresh for multiple mounted subscribers', async () => {
  const ticks = []
  vi.spyOn(globalThis, 'setInterval').mockImplementation(callback => { ticks.push(callback); return 123 })
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  await connected()
  renderHook(() => useTwitchDrops('alice'))
  await act(async () => {})
  invoke.mockClear()
  expect(ticks).toHaveLength(1)
  await act(async () => { ticks[0]() })
  expect(invoke.mock.calls.filter(([command]) => command === 'experimental_drops_probe')).toHaveLength(1)
  vi.restoreAllMocks()
})


it('auto-claims distinct ready instances sequentially after a fresh inventory and never repeats them', async () => {
  const hook = await connected()
  const fresh = inventory()
  const order = []
  invoke.mockImplementation(async (command, args) => {
    if (command === 'experimental_drops_probe') { order.push('read'); return structuredClone(fresh) }
    if (command === 'claim_experimental_drop') {
      order.push(args.instance)
      fresh.campaigns[0].timeBasedDrops.find(drop => drop.self.dropInstanceID === args.instance).self.isClaimed = true
      return { outcome: 'claimed', campaigns: structuredClone(fresh.campaigns), updatedAt: 2000 }
    }
  })
  await act(async () => { await setDropsAutoClaim(true) })
  expect(order).toEqual(['read', 'issued', 'second'])
  expect(hook.result.current.claimableCount).toBe(0)
  await act(async () => { await hook.result.current.refresh() })
  expect(order).toEqual(['read', 'issued', 'second', 'read'])
})

it('stops the automatic queue on uncertain confirmation and does not restart after refresh or remount', async () => {
  await connected()
  invoke.mockImplementation(async command => command === 'experimental_drops_probe' ? inventory() : { outcome: 'claimed', campaigns: campaigns() })
  await act(async () => { await setDropsAutoClaim(true) })
  expect(getDropsSnapshot()).toMatchObject({ autoClaim: false, claimBlocked: true })
  await act(async () => { await setDropsAutoClaim(true) })
  expect(invoke.mock.calls.filter(([name]) => name === 'claim_experimental_drop')).toHaveLength(1)
})

it('stops after the in-flight claim when disabled and never sends the next one', async () => {
  await connected()
  let finish
  invoke.mockImplementation(command => command === 'experimental_drops_probe' ? Promise.resolve(inventory())
    : command === 'claim_experimental_drop' ? new Promise(resolve => { finish = resolve }) : Promise.resolve())
  let queue
  await act(async () => { queue = setDropsAutoClaim(true); await Promise.resolve(); await Promise.resolve() })
  expect(finish).toBeTypeOf('function')
  await act(async () => { await setDropsAutoClaim(false) })
  const claimed = campaigns(); claimed[0].timeBasedDrops[0].self.isClaimed = true
  await act(async () => { finish({ outcome: 'claimed', campaigns: claimed }); await queue })
  expect(invoke.mock.calls.filter(([name]) => name === 'claim_experimental_drop')).toHaveLength(1)
})

it('does not start auto-claims while hidden or pass work to another account', async () => {
  await connected()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  await act(async () => { await setDropsAutoClaim(true) })
  expect(invoke.mock.calls.some(([name]) => name === 'claim_experimental_drop')).toBe(false)
  act(() => bindDropsAccount('bob'))
  expect(getDropsSnapshot()).toMatchObject({ autoClaim: false, remember: false, campaigns: [] })
  vi.restoreAllMocks()
})

it('remembers only after native storage succeeds and preserves the old value if it fails', async () => {
  await connected()
  invoke.mockResolvedValue(undefined)
  await act(async () => { await setDropsRemember(true) })
  expect(getDropsSnapshot().remember).toBe(true)
  expect(invoke).toHaveBeenCalledWith('remember_drops_connection', expect.objectContaining({ remember: true }))
  invoke.mockRejectedValue('storage')
  await act(async () => { await setDropsRemember(false) })
  expect(getDropsSnapshot()).toMatchObject({ remember: true, error: 'storage', savingPreference: false })
})

it('restores a native verified session with automation off and its previous uncertainty retained', async () => {
  invoke.mockImplementation(async command => command === 'experimental_drops_status'
    ? { enabled: true, phase: 'connected', session: 'b'.repeat(32), login: 'alice', accountId: '100', remember: true, claimBlocked: true }
    : inventory())
  const hook = renderHook(() => useTwitchDrops('alice'))
  await act(async () => {})
  expect(hook.result.current).toMatchObject({ phase: 'ready', remember: true, autoClaim: false, claimBlocked: true, accountId: '100' })
  expect(invoke.mock.calls.some(([name]) => name === 'claim_experimental_drop')).toBe(false)
})

it('leaves explicit connection available when a saved credential is expired or storage is unavailable', async () => {
  invoke.mockRejectedValue('authorization')
  const hook = renderHook(() => useTwitchDrops('alice'))
  await act(async () => {})
  expect(hook.result.current).toMatchObject({ phase: 'idle', enabled: true, session: null, error: 'authorization' })
})


it('cancels the remaining queue on account change and discards an old confirmation', async () => {
  await connected()
  let finish
  invoke.mockImplementation(command => command === 'experimental_drops_probe' ? Promise.resolve(inventory())
    : command === 'claim_experimental_drop' ? new Promise(resolve => { finish = resolve }) : Promise.resolve())
  let queue
  await act(async () => { queue = setDropsAutoClaim(true); await Promise.resolve(); await Promise.resolve() })
  act(() => bindDropsAccount('bob'))
  const claimed = campaigns(); claimed[0].timeBasedDrops[0].self.isClaimed = true
  await act(async () => { finish({ outcome: 'claimed', campaigns: claimed }); await queue })
  expect(getDropsSnapshot()).toMatchObject({ account: 'bob', autoClaim: false, campaigns: [], claimOutcome: null })
  expect(invoke.mock.calls.filter(([name]) => name === 'claim_experimental_drop')).toHaveLength(1)
})

it('turns off automation and discards the expired connection before any mutation', async () => {
  await connected()
  invoke.mockRejectedValue('authorization')
  await act(async () => { await setDropsAutoClaim(true) })
  expect(getDropsSnapshot()).toMatchObject({ session: null, autoClaim: false, campaigns: [], error: 'authorization' })
  expect(invoke.mock.calls.some(([name]) => name === 'claim_experimental_drop')).toBe(false)
})

it('pauses automation after a read error without claiming from stale inventory', async () => {
  await connected()
  invoke.mockRejectedValue('network')
  await act(async () => { await setDropsAutoClaim(true) })
  expect(getDropsSnapshot()).toMatchObject({ phase: 'error', autoClaim: false })
  expect(invoke.mock.calls.some(([name]) => name === 'claim_experimental_drop')).toBe(false)
})
