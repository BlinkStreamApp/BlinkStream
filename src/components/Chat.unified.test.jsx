import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Chat from './Chat'
import { banUser } from '../utils/twitch'

vi.mock('../utils/twitch', () => ({ PUBLIC_CLIENT_ID: 'test-client', sanitizeChannelForGraphQL: value => value, getHeaders: vi.fn(async () => ({})), banUser: vi.fn(), unbanUser: vi.fn(), clearChatMessages: vi.fn(), updateChatSettings: vi.fn(), getUserIdByLogin: vi.fn() }))
vi.mock('../utils/tauriEnv', () => ({ isTauri: () => false, safeOpenUrl: vi.fn() }))
vi.mock('../utils/i18n', () => {
  const translate = (_key, fallback) => fallback
  return { useT: () => translate }
})
vi.mock('./chat/TwitchChatPopout', () => ({ TwitchChatPopout: () => <div data-testid="official-popout" /> }))

class FakeSocket {
  static OPEN = 1
  static instances = []
  readyState = 0
  send = vi.fn()
  close = vi.fn(() => { this.readyState = 3 })
  constructor() { FakeSocket.instances.push(this) }
  open() { this.readyState = 1; this.onopen?.() }
  receive(data) { this.onmessage?.({ data }) }
}
const props = { channel: 'alpha', channels: ['alpha', 'beta'], isGridMode: true, twitchToken: 'test-token', twitchUsername: 'viewer', onSelectDestination: vi.fn() }
const message = (channel, id, text = `message from ${channel}`, user = 'reader') => `@id=${id};user-id=99;display-name=${user};badges= :${user}!r@r PRIVMSG #${channel} :${text}\r\n`
const start = async () => {
  await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
  const socket = FakeSocket.instances[0]
  act(() => { socket.open(); socket.receive('@badges=vip/1 :tmi.twitch.tv USERSTATE #alpha\r\n@badges=moderator/1;mod=1 :tmi.twitch.tv USERSTATE #beta\r\n') })
  return socket
}

describe('unified native Chat', () => {
  beforeEach(() => {
    FakeSocket.instances.length = 0
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: [], emotes: [], sets: {} }) })))
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    vi.mocked(banUser).mockClear()
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('joins each room once, routes by origin and keeps arrival order', async () => {
    render(<Chat {...props} channels={['alpha', 'beta', 'alpha']} />)
    const socket = await start()
    expect(socket.send).toHaveBeenCalledWith('JOIN #alpha,#beta')
    act(() => socket.receive(message('beta', 'b') + message('alpha', 'a') + message('outside', 'x')))
    await screen.findByText('message from beta')
    expect(screen.queryByText('message from outside')).not.toBeInTheDocument()
    const log = screen.getByRole('log')
    expect(log.textContent.indexOf('message from beta')).toBeLessThan(log.textContent.indexOf('message from alpha'))
    expect(within(log).getByTitle('Canal: beta')).toBeInTheDocument()
    expect(within(log).getByTitle('Canal: alpha')).toBeInTheDocument()
  })

  it('changes the send destination without reconnecting or mixing viewer badges', async () => {
    const { rerender } = render(<Chat {...props} />)
    const socket = await start()
    rerender(<Chat {...props} channel="beta" />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Mensaje para beta' }), { target: { value: 'hi beta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar', exact: true }))
    expect(socket.send).toHaveBeenCalledWith('PRIVMSG #beta :hi beta\r\n')
    expect(socket.send).not.toHaveBeenCalledWith('PRIVMSG #alpha :hi beta\r\n')
    expect(FakeSocket.instances).toHaveLength(1)
    expect(socket.close).not.toHaveBeenCalled()
    expect(within(screen.getByRole('log')).getByText('hi beta').closest('[class~="group/msg"]').textContent).toContain('beta')
  })

  it('requires joined destination and never sends an old draft to another room', async () => {
    const { rerender } = render(<Chat {...props} />)
    const socket = await start()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'private to alpha' } })
    rerender(<Chat {...props} channel="beta" />)
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Enviar', exact: true })).toBeDisabled()
    fireEvent.submit(screen.getByRole('textbox').closest('form'))
    expect(socket.send.mock.calls.flat().join('')).not.toContain('private to alpha')
    rerender(<Chat {...props} channel="removed" />)
    expect(screen.getByRole('combobox', { name: 'Canal de destino' })).toHaveValue('')
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('scopes deduplication, anti-spam and pending deletions to their original rooms', async () => {
    localStorage.setItem('blinkstream_antispam', 'true')
    render(<Chat {...props} />)
    const socket = await start()
    act(() => socket.receive(message('alpha', 'same', 'hello') + message('alpha', 'same', 'hello') + message('beta', 'same', 'hello')))
    await waitFor(() => expect(within(screen.getByRole('log')).getAllByText('hello')).toHaveLength(2))
    act(() => socket.receive(message('alpha', 'delete', 'queued alpha') + message('beta', 'keep', 'queued beta') + '@target-msg-id=delete :tmi.twitch.tv CLEARMSG #alpha :queued alpha\r\n'))
    await screen.findByText('queued beta')
    expect(screen.queryByText('queued alpha')).not.toBeInTheDocument()
    act(() => socket.receive(':tmi.twitch.tv CLEARCHAT #alpha\r\n'))
    await waitFor(() => expect(within(screen.getByRole('log')).getAllByText('hello')).toHaveLength(1))
    expect(screen.getAllByTitle('Canal: beta')).toHaveLength(2)
  })

  it('allows /me for one recipient but blocks moderation commands and official popouts', async () => {
    localStorage.setItem('bs.chat.use_twitch_popout', 'true')
    render(<Chat {...props} isModerator />)
    const socket = await start()
    expect(screen.queryByTestId('official-popout')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Incrustar Popout Oficial de Twitch' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '/ban reader' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar', exact: true }))
    expect(await screen.findByText(/Usa el chat individual para comandos/)).toBeInTheDocument()
    expect(banUser).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '/me waves' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar', exact: true }))
    expect(socket.send).toHaveBeenCalledWith('PRIVMSG #alpha :\u0001ACTION waves\u0001\r\n')
  })

  it('uses each channel own emotes and subscriber badges even when their names are identical', async () => {
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      let data = { data: [], emotes: [], sets: {} }
      if (String(url).includes('gql.twitch.tv')) {
        const name = JSON.parse(options.body).variables.login
        data = { data: { user: { id: name, broadcastBadges: [] }, badges: [] } }
      } else if (String(url).includes('betterttv.net/3/cached/users/twitch/')) {
        const name = String(url).split('/').at(-1)
        data = { channelEmotes: [{ id: `${name}-emote`, code: 'SameCode' }], sharedEmotes: [] }
      } else if (String(url).includes('/chat/badges?broadcaster_id=')) {
        const name = new URL(url).searchParams.get('broadcaster_id')
        data = { data: [{ set_id: 'subscriber', versions: [{ id: '1', image_url_2x: `https://example.test/${name}-badge.png` }] }] }
      }
      return { ok: true, json: async () => data }
    })
    render(<Chat {...props} />)
    const socket = await start()
    act(() => socket.receive(message('alpha', 'a', 'SameCode').replace('badges= ', 'badges=subscriber/1 ') + message('beta', 'b', 'SameCode').replace('badges= ', 'badges=subscriber/1 ')))
    await waitFor(() => expect(within(screen.getByRole('log')).getAllByAltText('SameCode')).toHaveLength(2))
    const emotes = within(screen.getByRole('log')).getAllByAltText('SameCode')
    expect(emotes[0]).toHaveAttribute('src', expect.stringContaining('/alpha-emote/'))
    expect(emotes[1]).toHaveAttribute('src', expect.stringContaining('/beta-emote/'))
    await waitFor(() => expect(within(screen.getByRole('log')).getAllByAltText('subscriber')).toHaveLength(2))
    const badges = within(screen.getByRole('log')).getAllByAltText('subscriber')
    expect(badges[0]).toHaveAttribute('src', 'https://example.test/alpha-badge.png')
    expect(badges[1]).toHaveAttribute('src', 'https://example.test/beta-badge.png')
  })

  it('does not enable sending before the chosen room has acknowledged joining', async () => {
    render(<Chat {...props} />)
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    const socket = FakeSocket.instances[0]
    act(() => { socket.open(); socket.receive('@emote-only=0 :tmi.twitch.tv ROOMSTATE #beta\r\n') })
    expect(screen.getByRole('textbox')).toBeDisabled()
    act(() => socket.receive(':viewer!v@v JOIN #alpha\r\n'))
    expect(screen.getByRole('textbox')).toBeEnabled()
    act(() => { socket.readyState = 3; socket.onclose() })
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('cancels stale reception and closes the socket on unmount', async () => {
    const { unmount } = render(<Chat {...props} />)
    const socket = await start()
    unmount()
    expect(socket.close).toHaveBeenCalledOnce()
    act(() => socket.receive(message('alpha', 'late', 'late message')))
    expect(screen.queryByText('late message')).not.toBeInTheDocument()
  })

  it('retains the individual chat behavior and official preference', async () => {
    localStorage.setItem('bs.chat.use_twitch_popout', 'true')
    render(<Chat {...props} channels={undefined} />)
    const socket = await start()
    expect(socket.send).toHaveBeenCalledWith('JOIN #alpha')
    expect(screen.getByTestId('official-popout')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Canal de destino' })).not.toBeInTheDocument()
  })
})
