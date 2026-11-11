import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useChatVisibility } from './useChatVisibility'

beforeEach(() => { vi.stubGlobal('innerWidth', 1280) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const resize = width => act(() => { window.innerWidth = width; window.dispatchEvent(new Event('resize')) })

it('restores automatic chat visibility after a temporary narrow viewport', () => {
  const { result } = renderHook(() => useChatVisibility())
  expect(result.current[0]).toBe(true)
  resize(400)
  expect(result.current[0]).toBe(false)
  resize(1280)
  expect(result.current[0]).toBe(true)
})

it('ignores minimized dimensions and hidden-window resize events then resamples on focus', () => {
  const { result } = renderHook(() => useChatVisibility())
  resize(0)
  expect(result.current[0]).toBe(true)
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  resize(400)
  expect(result.current[0]).toBe(true)
  visibility.mockReturnValue('visible')
  act(() => { window.innerWidth = 1280; window.dispatchEvent(new Event('focus')) })
  expect(result.current[0]).toBe(true)
})

it('preserves an explicit open or closed choice through resize, focus and visibility events', () => {
  const { result } = renderHook(() => useChatVisibility())
  act(() => result.current[1](false))
  resize(1600)
  act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
  expect(result.current[0]).toBe(false)
  act(() => result.current[1](previous => !previous))
  resize(400)
  expect(result.current[0]).toBe(true)
})
