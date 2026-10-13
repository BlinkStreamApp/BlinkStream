import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCategoryFeed } from './useCategoryFeed'

const page = (ids, cursor = '') => ({ items: ids.map(id => ({ id })), cursor })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
async function tick(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

describe('category feed scopes', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('debounces and ignores completed requests from an old category', async () => {
    const old = deferred()
    const requestA = vi.fn(() => old.promise)
    const requestB = vi.fn(async () => page(['B']))
    const { result, rerender } = renderHook(props => useCategoryFeed(props), { initialProps: { scope: 'A', request: requestA, delay: 300 } })
    await tick(299)
    expect(requestA).not.toHaveBeenCalled()
    await tick(1)
    rerender({ scope: 'B', request: requestB, delay: 300 })
    expect(result.current.items).toEqual([])
    expect(requestA.mock.calls[0][0].signal.aborted).toBe(true)
    await tick(300)
    await act(async () => old.resolve(page(['A'])))
    expect(result.current.items).toEqual([{ id: 'B' }])
  })
  it('deduplicates pages and prevents duplicate in-flight loads', async () => {
    const more = deferred()
    const request = vi.fn().mockResolvedValueOnce(page(['1'], 'next')).mockReturnValueOnce(more.promise)
    const { result } = renderHook(() => useCategoryFeed({ scope: 'A', request }))
    await tick()
    act(() => { result.current.loadMore(); result.current.loadMore() })
    expect(request).toHaveBeenCalledTimes(2)
    await act(async () => more.resolve(page(['1', '2'], 'next')))
    expect(result.current.items.map(item => item.id)).toEqual(['1', '2'])
    expect(result.current.cursor).toBe('')
  })
  it('retains loaded items on a page error and retries the failed cursor', async () => {
    const request = vi.fn().mockResolvedValueOnce(page(['1'], 'next'))
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'network' }))
      .mockResolvedValueOnce(page(['2']))
    const { result } = renderHook(() => useCategoryFeed({ scope: 'A', request }))
    await tick()
    await act(async () => result.current.loadMore())
    expect(result.current.error).toBe('network')
    expect(result.current.items).toEqual([{ id: '1' }])
    await act(async () => result.current.retry())
    expect(request.mock.calls[2][0].cursor).toBe('next')
    expect(result.current.items.map(item => item.id)).toEqual(['1', '2'])
  })
  it('disabled feeds do not request and cancel after close/logout', async () => {
    const pending = deferred()
    const request = vi.fn(() => pending.promise)
    const { result, rerender } = renderHook(props => useCategoryFeed(props), { initialProps: { scope: 'A', request, enabled: false } })
    await tick()
    expect(request).not.toHaveBeenCalled()
    rerender({ scope: 'A', request, enabled: true })
    await tick()
    rerender({ scope: 'A', request, enabled: false })
    await act(async () => pending.resolve(page(['late'])))
    expect(request.mock.calls[0][0].signal.aborted).toBe(true)
    expect(result.current.items).toEqual([])
  })
})
