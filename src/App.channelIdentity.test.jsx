import { StrictMode, useLayoutEffect } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { clearChannelRoleCache } from './hooks/useChannelRole'
import { getUserIdByLogin, getChannelRole } from './utils/twitch'



const { session, noToken } = vi.hoisted(() => ({
  session: { isLoggedIn: true, user: { userId: '1', username: 'fixture' } },
  noToken: () => null,
}))
vi.mock('./hooks/useAuth', () => ({ useAuth: () => ({ ...session, getTwitchToken: noToken }) }))
vi.mock('./hooks/useFavoriteChannels', () => ({ useFavoriteChannels: () => ({ favorites: [], pinnedFavorites: [] }) }))
vi.mock('./hooks/useLiveAlerts', () => ({ useLiveAlerts: () => ({ alerts: [], liveFavorites: [] }) }))

vi.mock('./components/recording/RecordingContext', () => ({ RecordingProvider: ({ children }) => children }))
vi.mock('./components/ModPanel', () => ({ default: () => null }))
vi.mock('./components/HomeScreen', () => ({ default: () => null }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock('./utils/twitchEventSub', () => ({ startRewardEventSub: vi.fn(() => vi.fn()) }))
vi.mock('./utils/twitch', async importOriginal => ({
  ...await importOriginal(),
  getUserIdByLogin: vi.fn(),
  getChannelRole: vi.fn(),
}))


const commits = []
function Consumer(props) {
  useLayoutEffect(() => { commits.push({ channel: props.channel, id: props.broadcasterId, moderator: props.isModerator, userId: props.userId }) })
  if (props.roleOnly) return null
  return <div data-testid="channel-consumer" data-channel={props.channel} data-id={props.broadcasterId || ''} />
}
vi.mock('./components/VideoPlayer', () => ({ default: props => <Consumer {...props} /> }))
vi.mock('./components/Chat', () => ({ default: props => <Consumer {...props} roleOnly /> }))
vi.mock('./components/StreamInfo', () => ({ default: () => null }))
vi.mock('./components/modview/ModView', () => ({ default: props => <Consumer {...props} /> }))
vi.mock('./components/ChannelSearch', () => ({ default: ({ onSelect }) => <nav aria-label="Fixture channels">{['alpha', 'bravo', 'charlie'].map(channel => <button key={channel} onClick={() => onSelect(channel)}>{channel}</button>)}</nav> }))

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })))
  localStorage.clear()
  localStorage.setItem('blinkstream_onboarded', '1')
  session.isLoggedIn = true
  session.user = { userId: '1', username: 'fixture' }
  clearChannelRoleCache()
  commits.length = 0
  getUserIdByLogin.mockReset()
  getChannelRole.mockImplementation(() => new Promise(() => {}))
})
it.each(['normal', 'modview'])('App never commits another channel ID in %s, including late navigation and return', async mode => {
  const pending = []
  getUserIdByLogin.mockImplementation(channel => {
    const request = { channel, ...deferred() }
    pending.push(request)
    return request.promise
  })
  render(<StrictMode><App /></StrictMode>)
  if (mode === 'modview') fireEvent.keyDown(window, { code: 'KeyM', ctrlKey: true })
  const select = channel => fireEvent.click(screen.getByRole('button', { name: channel, exact: true }))
  select('alpha')
  await act(async () => { pending.at(-1).resolve('101') })
  await waitFor(() => expect(screen.getByTestId('channel-consumer')).toHaveAttribute('data-id', '101'))
  select('bravo')
  const bravo = pending.at(-1)
  await waitFor(() => expect(screen.getByTestId('channel-consumer')).toHaveAttribute('data-channel', 'bravo'))
  expect(screen.getByTestId('channel-consumer')).toHaveAttribute('data-id', '')
  select('charlie')
  const charlie = pending.at(-1)
  select('alpha')
  await act(async () => { bravo.resolve('202'); charlie.resolve('303') })
  expect(screen.getByTestId('channel-consumer')).toHaveAttribute('data-id', '')
  await act(async () => { pending.at(-1).resolve('101') })
  select('bravo')
  await act(async () => { pending.at(-1).resolve('202') })
  expect(screen.getByTestId('channel-consumer')).toHaveAttribute('data-id', '202')
  expect(commits.filter(({ channel, id }) => id && id !== { alpha: '101', bravo: '202', charlie: '303' }[channel])).toEqual([])
  expect(getChannelRole.mock.calls.filter(([id, , , channel]) => id && id !== { alpha: '101', bravo: '202', charlie: '303' }[channel])).toEqual([])
})

it.each(['switch', 'logout'])('App commits the current identity without previous privileges on %s', async transition => {
  getUserIdByLogin.mockResolvedValue('101')
  getChannelRole.mockImplementation(async (_id, userId) => ({ success: true, value: userId === '1' ? 'mod' : 'viewer' }))
  const app = () => <StrictMode><App /></StrictMode>
  const { rerender } = render(app())
  fireEvent.click(screen.getByRole('button', { name: 'alpha', exact: true }))
  await waitFor(() => expect(commits.some(commit => commit.moderator === true)).toBe(true))
  commits.length = 0
  session.isLoggedIn = transition !== 'logout'
  session.user = transition === 'logout' ? null : { userId: '2', username: 'second' }
  rerender(app())
  const observed = commits.filter(commit => commit.userId !== undefined)
  expect(observed.length).toBeGreaterThan(0)
  expect(observed.every(commit => commit.userId === (transition === 'logout' ? null : '2') && !commit.moderator)).toBe(true)
})
