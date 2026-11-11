import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useOfficialVideoSlot } from './useOfficialVideoSlot'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
const slot = { x: 0.05, y: 0.1, width: 0.55, height: 0.5 }
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  invoke.mockResolvedValue(slot)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('reads geometry only, deduplicates unchanged measurements and cancels its timer on exit', async () => {
  const ref = { current: 'session-a' }
  const view = renderHook(() => useOfficialVideoSlot(true, ref, 'a'))
  await act(async () => {})
  expect(view.result.current).toEqual(slot)
  const first = view.result.current
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(view.result.current).toBe(first)
  expect(invoke).toHaveBeenCalledWith('get_official_modview_video_bounds', { session: 'session-a' })
  view.unmount()
  const calls = invoke.mock.calls.length
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  expect(invoke).toHaveBeenCalledTimes(calls)
})

it('drops stale measurements after channel or scale changes', async () => {
  let finish
  invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const ref = { current: 'session-a' }
  const view = renderHook(({ scope }) => useOfficialVideoSlot(true, ref, scope), { initialProps: { scope: 'a' } })
  view.rerender({ scope: 'b' })
  await act(async () => {})
  expect(view.result.current).toEqual(slot)
  await act(async () => { finish({ ...slot, x: 0.2 }) })
  expect(view.result.current).toEqual(slot)
})

it('shows no overlay for invalid, absent or rejected geometry', async () => {
  invoke.mockResolvedValueOnce({ ...slot, x: 0.9 }).mockResolvedValueOnce(null).mockRejectedValueOnce(Error('unavailable'))
  const ref = { current: 'session-a' }
  const view = renderHook(() => useOfficialVideoSlot(true, ref, 'a'))
  await act(async () => {})
  expect(view.result.current).toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(view.result.current).toBeNull()
})

it('does not query hidden documents or disabled layouts', async () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  const ref = { current: 'session-a' }
  const view = renderHook(({ enabled }) => useOfficialVideoSlot(enabled, ref, 'a'), { initialProps: { enabled: true } })
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(invoke).not.toHaveBeenCalled()
  view.rerender({ enabled: false })
  expect(view.result.current).toBeNull()
})

it('reports unavailable geometry only for the active measurement', async () => {
  let finish
  invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const unavailable = vi.fn()
  const ref = { current: 'session-a' }
  const view = renderHook(({ scope }) => useOfficialVideoSlot(true, ref, scope, unavailable), { initialProps: { scope: 'a' } })
  view.rerender({ scope: 'b' })
  await act(async () => {})
  await act(async () => { finish(null) })
  expect(unavailable).not.toHaveBeenCalled()
  invoke.mockResolvedValue(null)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(unavailable).toHaveBeenCalledOnce()
})
