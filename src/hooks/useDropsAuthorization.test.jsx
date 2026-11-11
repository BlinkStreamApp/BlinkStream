import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useDropsAuthorization } from './useDropsAuthorization'
import { bindDropsAccount, connectDropsSession, disconnectDropsSession, getDropsSnapshot } from '../utils/dropsSession'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
beforeEach(async () => {
  await disconnectDropsSession()
  bindDropsAccount('alice')
  vi.stubGlobal('isTauri', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  invoke.mockReset().mockImplementation(async command => command === 'experimental_drops_status'
    ? { enabled: true, phase: 'connected', login: 'alice', accountId: '100' }
    : command === 'experimental_drops_probe' ? { accountLogin: 'alice', accountId: '100', campaigns: [], updatedAt: 1000 } : undefined)
})
afterEach(async () => { cleanup(); await disconnectDropsSession(); vi.unstubAllGlobals() })
const host = () => ({ current: { hidden: false, getBoundingClientRect: () => ({ left: 10, top: 100, width: 600, height: 300 }) } })

it('mounts within measured bounds and keeps the session when the approved host unmounts', async () => {
  await connectDropsSession()
  const session = getDropsSnapshot().session
  const container = host()
  const hook = renderHook(({ active }) => useDropsAuthorization(container, session, active), { initialProps: { active: true } })
  await act(async () => {})
  expect(invoke).toHaveBeenCalledWith('mount_experimental_drops_auth', { session, x: 10, y: 100, width: 600, height: 300 })
  expect(getDropsSnapshot().phase).toBe('ready')
  hook.rerender({ active: false })
  hook.unmount()
  await act(async () => {})
  expect(invoke.mock.calls.some(([command]) => command === 'disconnect_experimental_drops')).toBe(false)
})

it('cancels a pending late mount using only its own session after a new connection begins', async () => {
  let finish
  invoke.mockImplementation(command => command === 'mount_experimental_drops_auth'
    ? new Promise(resolve => { finish = resolve }) : Promise.resolve())
  await connectDropsSession()
  const first = getDropsSnapshot().session
  const hook = renderHook(() => useDropsAuthorization(host(), first, true))
  hook.unmount()
  await connectDropsSession()
  const second = getDropsSnapshot().session
  await act(async () => { finish() })
  expect(second).not.toBe(first)
  expect(getDropsSnapshot().session).toBe(second)
  expect(invoke).toHaveBeenCalledWith('disconnect_experimental_drops', { session: first })
  expect(invoke).not.toHaveBeenCalledWith('disconnect_experimental_drops', { session: second })
})

it('keeps an authorized native session when the initial inventory request has a transient failure', async () => {
  invoke.mockImplementation(async command => command === 'experimental_drops_status'
    ? { enabled: true, phase: 'connected', login: 'alice', accountId: '100' }
    : command === 'experimental_drops_probe' ? Promise.reject(new Error('network')) : undefined)
  await connectDropsSession()
  const session = getDropsSnapshot().session
  const container = host()
  const hook = renderHook(({ active }) => useDropsAuthorization(container, session, active), { initialProps: { active: true } })
  await act(async () => {})
  expect(getDropsSnapshot().phase).toBe('error')
  hook.rerender({ active: false })
  hook.unmount()
  await act(async () => {})
  expect(invoke.mock.calls.some(([command]) => command === 'disconnect_experimental_drops')).toBe(false)
  expect(getDropsSnapshot().session).toBe(session)
})
