import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import App from './App'
import { startRewardEventSub } from './utils/twitchEventSub'
import { getWhisperUnread } from './utils/whispers'
import { t } from './utils/i18n'

const { session, noToken } = vi.hoisted(() => ({
  session: { isLoggedIn: true, user: { userId: '1', username: 'fixture' } },
  noToken: () => null,
}))
vi.mock('./hooks/useAuth', () => ({ useAuth: () => ({ ...session, getTwitchToken: noToken }) }))
vi.mock('./hooks/useFavoriteChannels', () => ({ useFavoriteChannels: () => ({ favorites: [], pinnedFavorites: [] }) }))
vi.mock('./hooks/useLiveAlerts', () => ({ useLiveAlerts: () => ({ alerts: [], liveFavorites: [] }) }))
vi.mock('./hooks/useChannelRole', () => ({ useChannelRole: () => ({}) }))
vi.mock('./components/recording/RecordingContext', () => ({ RecordingProvider: ({ children }) => children }))
vi.mock('./components/HomeScreen', () => ({ default: () => null }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock('./utils/twitchEventSub', () => ({ startRewardEventSub: vi.fn(() => vi.fn()) }))
vi.mock('./utils/twitch', async importOriginal => ({
  ...await importOriginal(),
  getUserById: vi.fn(async id => ({ success: true, value: { id, login: 'alice', display_name: 'Alice' } })),
}))

it('mounts the real inbox from App, receives while closed and isolates account changes and logout', async () => {
  localStorage.setItem('blinkstream_onboarded', '1')
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const view = render(<StrictMode><App /></StrictMode>)
  await waitFor(() => expect(startRewardEventSub).toHaveBeenCalled())
  const listener = startRewardEventSub.mock.calls.at(-1)[0]
  expect(listener.moderation.userId).toBe('1')
  act(() => listener.moderation.onEvent({ event: {
    whisper_id: 'app-fixture', from_user_id: '2', from_user_login: 'alice',
    from_user_name: 'Alice', to_user_id: '1', whisper: { text: 'Synthetic App inbox' },
  } }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(getWhisperUnread('1')).toBe(1)
  const opener = screen.getByRole('button', { name: new RegExp(t('whisper.inbox')) })
  fireEvent.click(opener)
  fireEvent.click(screen.getByText('Synthetic App inbox'))
  await waitFor(() => expect(getWhisperUnread('1')).toBe(0))
  expect(screen.getByText('Synthetic App inbox')).toBeVisible()
  session.user = { userId: '4', username: 'other' }
  view.rerender(<StrictMode><App /></StrictMode>)
  await waitFor(() => expect(startRewardEventSub.mock.calls.at(-1)[0].moderation.userId).toBe('4'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(getWhisperUnread('1')).toBe(0)
  session.isLoggedIn = false
  session.user = null
  view.rerender(<StrictMode><App /></StrictMode>)
  expect(screen.queryByRole('button', { name: new RegExp(t('whisper.inbox')) })).not.toBeInTheDocument()
})
