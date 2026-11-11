import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useDropsProgress } from './useDropsProgress'
import { bindDropsAccount, checkDropsSession, connectDropsSession, disconnectDropsSession } from '../utils/dropsSession'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
afterEach(async () => { cleanup(); await disconnectDropsSession(); vi.unstubAllGlobals() })

it('uses the same native session as the center and hides data from other accounts immediately', async () => {
  vi.stubGlobal('isTauri', true)
  invoke.mockImplementation(async command => command === 'experimental_drops_status'
    ? { enabled: true, phase: 'connected', login: 'alice', accountId: '100' }
    : { accountLogin: 'alice', accountId: '100', updatedAt: 1000, campaigns: [{ id: 'c', timeBasedDrops: [
      { id: 'd', requiredMinutesWatched: 60, self: { currentMinutesWatched: 27, isClaimed: false } },
    ] }] })
  bindDropsAccount('alice')
  const hook = renderHook(({ account }) => useDropsProgress('channel', account), { initialProps: { account: 'alice' } })
  await act(async () => { await connectDropsSession(); await checkDropsSession() })
  expect(hook.result.current.drop.currentMinutes).toBe(27)
  hook.rerender({ account: 'bob' })
  expect(hook.result.current).toBeNull()
  expect(invoke.mock.calls.some(([command]) => command === 'get_cached_drops_inventory')).toBe(false)
})
