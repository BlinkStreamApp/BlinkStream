import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useDropsProgress } from './useDropsProgress'

vi.mock('../utils/tauriEnv', () => ({ isTauri: () => true }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
let receive
const payload = (accountLogin = 'alice', channel = 'channel', updatedAt = 100) => ({ accountLogin, channel, updatedAt,
  channelCampaigns: [{ id: 'c', timeBasedDrops: [{ id: 'd', requiredMinutesWatched: 60, self: { currentMinutesWatched: 27 } }] }] })
beforeEach(() => {
  invoke.mockResolvedValue(payload())
  listen.mockImplementation(async (_name, callback) => { receive = callback; return vi.fn() })
})
afterEach(cleanup)
it('shows confirmed current-channel progress and rejects other accounts, channels and older events', async () => {
  const { result, rerender } = renderHook(({ account }) => useDropsProgress('channel', account), { initialProps: { account: 'alice' } })
  await waitFor(() => expect(result.current?.drop.currentMinutes).toBe(27))
  act(() => receive({ payload: payload('alice', 'other', 200) }))
  expect(result.current.drop.currentMinutes).toBe(27)
  act(() => receive({ payload: { ...payload('alice', 'channel', 90), channelCampaigns: [] } }))
  expect(result.current.drop.currentMinutes).toBe(27)
  rerender({ account: 'bob' })
  expect(result.current).toBeNull()
  await waitFor(() => expect(listen).toHaveBeenCalledTimes(2))
  act(() => receive({ payload: payload('bob', 'channel', 300) }))
  expect(result.current.drop.currentMinutes).toBe(27)
  act(() => receive({ payload: { authRequired: true } }))
  expect(result.current).toBeNull()
})
