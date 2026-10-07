import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { useEmbeddedDropsInventory } from './useEmbeddedDropsInventory'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

beforeEach(() => {
  vi.stubGlobal('isTauri', true)
  invoke.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function host() {
  const hook = renderHook(() => useEmbeddedDropsInventory())
  hook.result.current.containerRef.current = { getBoundingClientRect: () => ({ left: 40, top: 100, width: 640, height: 300 }) }
  return hook
}

describe('embedded Drops inventory lifecycle', () => {
  it('mounts one child in the measured rectangle and reuses its ready session', async () => {
    const { result, unmount } = host()
    let first
    let second
    await act(async () => { first = result.current.open(); second = result.current.open() })
    expect(first).toBe(second)
    const session = await first
    expect(session).toMatch(/^[a-f0-9]{32}$/)
    expect(invoke).toHaveBeenCalledWith('mount_embedded_twitch_drops', { session, x: 40, y: 100, width: 640, height: 300 })
    expect(await result.current.open()).toBe(session)
    expect(invoke.mock.calls.filter(([name]) => name === 'mount_embedded_twitch_drops')).toHaveLength(1)
    unmount()
    await act(async () => {})
    expect(invoke).toHaveBeenCalledWith('unmount_embedded_twitch_drops', { session })
  })

  it('closes a late mount without destroying a newly opened session', async () => {
    let finishOldMount
    invoke.mockImplementation((command) => command === 'mount_embedded_twitch_drops' && !finishOldMount
      ? new Promise(resolve => { finishOldMount = resolve }) : Promise.resolve())
    const { result, unmount } = host()
    let old
    let newRequest
    await act(async () => { old = result.current.open(); old.catch(() => {}) })
    const oldSession = invoke.mock.calls[0][1].session
    await act(async () => { result.current.close() })
    await expect(old).rejects.toThrow('cerrado')
    await act(async () => { newRequest = result.current.open() })
    const newSession = await newRequest
    expect(newSession).not.toBe(oldSession)
    await act(async () => { finishOldMount() })
    expect(invoke).toHaveBeenCalledWith('unmount_embedded_twitch_drops', { session: oldSession })
    expect(invoke).not.toHaveBeenCalledWith('unmount_embedded_twitch_drops', { session: newSession })
    unmount()
  })

  it('rejects mount failures and displays the error without opening any window', async () => {
    invoke.mockRejectedValue(new Error('host failed'))
    const { result, unmount } = host()
    let pending
    await act(async () => { pending = result.current.open(); pending.catch(() => {}) })
    await expect(pending).rejects.toThrow('host failed')
    expect(result.current.error).toBe('host failed')
    expect(invoke).not.toHaveBeenCalledWith('open_twitch_drops_window', expect.anything())
    unmount()
  })

  it('rejects browser mode rather than silently opening a popup', async () => {
    vi.stubGlobal('isTauri', false)
    const { result, unmount } = host()
    await expect(result.current.open()).rejects.toThrow('app de escritorio')
    expect(invoke).not.toHaveBeenCalled()
    unmount()
  })

  it('updates bounds on resize and navigates back only on an explicit reset', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 0))
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    const { result, unmount } = host()
    let pending
    await act(async () => { pending = result.current.open() })
    const session = await pending
    await act(async () => {
      window.dispatchEvent(new Event('resize'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(invoke).toHaveBeenCalledWith('update_embedded_twitch_drops_bounds', { session, x: 40, y: 100, width: 640, height: 300, visible: true })
    expect(invoke).not.toHaveBeenCalledWith('reset_embedded_twitch_drops', expect.anything())
    await act(async () => { await result.current.reload() })
    expect(invoke).toHaveBeenCalledWith('reset_embedded_twitch_drops', { session })
    unmount()
  })

  it('bounds the wait for a stuck native mount and cleans up its late completion', async () => {
    vi.useFakeTimers()
    let finish
    invoke.mockImplementation(command => command === 'mount_embedded_twitch_drops'
      ? new Promise(resolve => { finish = resolve }) : Promise.resolve())
    const { result, unmount } = host()
    let pending
    await act(async () => { pending = result.current.open(); pending.catch(() => {}) })
    await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    await expect(pending).rejects.toThrow('no respondió a tiempo')
    expect(result.current.error).toContain('no respondió a tiempo')
    unmount()
    await act(async () => { finish() })
    expect(invoke).toHaveBeenCalledWith('unmount_embedded_twitch_drops', expect.objectContaining({ session: expect.any(String) }))
  })

  it('checks coverage after a delayed mount and tracks modal visibility attributes', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 0))
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    let finish
    invoke.mockImplementation(command => command === 'mount_embedded_twitch_drops'
      ? new Promise(resolve => { finish = resolve }) : Promise.resolve())
    const { result, unmount } = host()
    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'dialog')
    overlay.getBoundingClientRect = () => ({ width: overlay.hidden ? 0 : 400 })
    let pending
    try {
      await act(async () => { pending = result.current.open() })
      await act(async () => { document.body.appendChild(overlay) })
      await act(async () => { finish(); await vi.advanceTimersByTimeAsync(0) })
      const session = await pending
      expect(invoke).toHaveBeenCalledWith('update_embedded_twitch_drops_bounds', expect.objectContaining({ session, visible: false }))
      invoke.mockClear()
      await act(async () => { overlay.hidden = true })
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(invoke).toHaveBeenCalledWith('update_embedded_twitch_drops_bounds', expect.objectContaining({ session, visible: true }))
      invoke.mockClear()
      await act(async () => { overlay.hidden = false; overlay.style.display = 'none' })
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(invoke).toHaveBeenCalledWith('update_embedded_twitch_drops_bounds', expect.objectContaining({ session, visible: true }))
      invoke.mockClear()
      await act(async () => { overlay.style.display = 'block' })
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(invoke).toHaveBeenCalledWith('update_embedded_twitch_drops_bounds', expect.objectContaining({ session, visible: false }))
      // Bounds updates must not reload Twitch or create a refresh loop.
      const updates = invoke.mock.calls.length
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(invoke.mock.calls).toHaveLength(updates)
    } finally { unmount(); overlay.remove() }
  })
})
