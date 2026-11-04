import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { parsePlayerControls, PLAYER_CONTROLS_KEY } from './playerControls'
import { usePlayerControls } from '../hooks/usePlayerControls'
import SettingsPlayerTab from '../components/settings/SettingsPlayerTab'

afterEach(() => { cleanup(); localStorage.clear() })
it('defaults malformed or obsolete preferences without hiding required settings/fullscreen controls', () => {
  expect(Object.values(parsePlayerControls('{bad')).every(Boolean)).toBe(true)
  const controls = parsePlayerControls('{"clips":false,"pip":"false","settings":false}')
  expect(controls.clips).toBe(false)
  expect(controls.pip).toBe(true)
  expect(controls.settings).toBeUndefined()
})
it('updates current players and persists a control choice from settings', () => {
  const { result } = renderHook(usePlayerControls)
  render(<SettingsPlayerTab />)
  fireEvent.click(screen.getByRole('switch', { name: 'Clips' }))
  expect(result.current.clips).toBe(false)
  expect(JSON.parse(localStorage.getItem(PLAYER_CONTROLS_KEY)).clips).toBe(false)
  act(() => {
    localStorage.setItem(PLAYER_CONTROLS_KEY, '{"pip":false}')
    window.dispatchEvent(new StorageEvent('storage', { key: PLAYER_CONTROLS_KEY }))
  })
  expect(result.current.pip).toBe(false)
})
