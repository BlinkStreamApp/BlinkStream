import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useConnectedChannelPoints } from './useConnectedChannelPoints'
import * as drops from './useTwitchDrops'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
let connection
beforeEach(() => {
  connection = { session: 'a'.repeat(32), accountId: '100' }
  vi.spyOn(drops, 'useTwitchDrops').mockImplementation(() => connection)
  invoke.mockResolvedValue({ accountId: '100', channel: 'channel', balance: 0, pointsName: 'Stars' })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('loads balance with the opaque native session and preserves zero', async () => {
  const hook = renderHook(() => useConnectedChannelPoints('viewer', 'channel'))
  await waitFor(() => expect(hook.result.current.balance).toBe(0))
  expect(invoke).toHaveBeenCalledWith('read_connected_channel_points', { session: connection.session, channel: 'channel' })
  expect(hook.result.current.pointsName).toBe('Stars')
})
it('does not query without a connected verified account', async () => {
  connection = { session: null, accountId: null }
  invoke.mockClear()
  const hook = renderHook(() => useConnectedChannelPoints('viewer', 'channel'))
  await act(async () => {})
  expect(hook.result.current.balance).toBeNull()
  expect(invoke).not.toHaveBeenCalled()
})
it('deduplicates refresh and discards a response from a previous channel', async () => {
  let finish
  invoke.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const hook = renderHook(({ channel }) => useConnectedChannelPoints('viewer', channel), { initialProps: { channel: 'channel' } })
  const oldFinish = finish
  let first, second
  act(() => { first = hook.result.current.refresh(); second = hook.result.current.refresh() })
  expect(first).toBe(second)
  hook.rerender({ channel: 'other' })
  await act(async () => { oldFinish({ accountId: '100', channel: 'channel', balance: 500 }); await first })
  expect(hook.result.current.balance).toBeNull()
  await act(async () => { finish({ accountId: '100', channel: 'other', balance: 25 }) })
  expect(hook.result.current.balance).toBe(25)
})
it('rejects account or channel mismatch and never converts an error into zero', async () => {
  invoke.mockResolvedValue({ accountId: 'other', channel: 'channel', balance: 500 })
  const hook = renderHook(() => useConnectedChannelPoints('viewer', 'channel'))
  await waitFor(() => expect(hook.result.current.error).toBe('account'))
  expect(hook.result.current.balance).toBeNull()
})
