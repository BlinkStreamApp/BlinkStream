import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Chat from './Chat'
import { banUser } from '../utils/twitch'
import { requiresOfficialChatWindow, openTwitchChatPopoutWindow } from '../utils/twitchPopout'

vi.mock('../utils/twitch', () => ({ PUBLIC_CLIENT_ID: 'test-client', sanitizeChannelForGraphQL: value => value, getHeaders: vi.fn(async () => ({})), banUser: vi.fn(), unbanUser: vi.fn(), clearChatMessages: vi.fn(), updateChatSettings: vi.fn(), getUserIdByLogin: vi.fn() }))
vi.mock('../utils/tauriEnv', () => ({ isTauri: () => false, safeOpenUrl: vi.fn() }))
vi.mock('../utils/twitchPopout', () => ({ requiresOfficialChatWindow: vi.fn(() => false), openTwitchChatPopoutWindow: vi.fn() }))
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
    vi.mocked(requiresOfficialChatWindow).mockReturnValue(false)
    vi.mocked(openTwitchChatPopoutWindow).mockClear()
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
  it('keeps Windows chat visible despite a saved embedded preference and opens official chat separately', async () => {
    vi.mocked(requiresOfficialChatWindow).mockReturnValue(true)
    localStorage.setItem('bs.chat.use_twitch_popout', 'true')
    render(<Chat {...props} channels={undefined} />)
    const socket = await start()
    expect(screen.queryByTestId('official-popout')).not.toBeInTheDocument()
    expect(screen.getByRole('log')).toBeVisible()
    const official = screen.getAllByRole('button', { name: 'Abrir Popout Flotante' })
    expect(official).toHaveLength(1)
    fireEvent.click(official[0])
    expect(openTwitchChatPopoutWindow).toHaveBeenCalledWith('alpha', false, 'test-token', 'viewer')
    expect(screen.queryByTestId('official-popout')).not.toBeInTheDocument()
    act(() => socket.receive(message('alpha', 'after-window', 'still receiving')))
    await screen.findByText('still receiving')
  })

  it('combines text, user, links and source while keeping the send destination independent', async () => {
    render(<Chat {...props} />)
    const socket = await start()
    act(() => socket.receive(message('alpha', 'a', 'Qué canción twitch.tv/alpha', 'alice') + message('beta', 'b', 'Qué canción twitch.tv/beta', 'alice') + message('beta', 'c', 'Qué canción sin enlace', 'bob')))
    await screen.findByText('Qué canción sin enlace')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en el chat' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Texto del mensaje' }), { target: { value: 'QUE CANCION' } })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Usuario' }), { target: { value: '@ALICE' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Solo con enlaces' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Canal de origen' }), { target: { value: 'beta' } })
    const log = screen.getByRole('log')
    expect(within(log).getByText('twitch.tv/beta')).toBeInTheDocument()
    expect(within(log).queryByText('twitch.tv/alpha')).not.toBeInTheDocument()
    expect(within(log).queryByText('Qué canción sin enlace')).not.toBeInTheDocument()
    expect(screen.getByText('Resultados: 1')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Canal de destino' })).toHaveValue('alpha')
    expect(screen.getByRole('textbox', { name: 'Mensaje para alpha' })).toHaveValue('')
    expect(FakeSocket.instances).toHaveLength(1)
    expect(socket.send.mock.calls.flat().filter(line => line.startsWith('PRIVMSG'))).toHaveLength(0)
  })

  it('removes moderated matches immediately, including queued messages, without restoring a search snapshot', async () => {
    render(<Chat {...props} />)
    const socket = await start()
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en el chat' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Texto del mensaje' }), { target: { value: 'findme' } })
    act(() => socket.receive(message('alpha', 'a', 'findme alpha') + message('beta', 'b', 'findme beta')))
    await screen.findByText('findme beta')
    act(() => socket.receive('@target-msg-id=a :tmi.twitch.tv CLEARMSG #alpha :findme alpha\r\n'))
    await waitFor(() => expect(screen.queryByText('findme alpha')).not.toBeInTheDocument())
    expect(screen.getByText('Resultados: 1')).toBeInTheDocument()
    act(() => socket.receive(message('alpha', 'queued', 'findme queued') + '@target-msg-id=queued :tmi.twitch.tv CLEARMSG #alpha :findme queued\r\n:tmi.twitch.tv CLEARCHAT #beta\r\n'))
    await screen.findByText('No hay mensajes que coincidan')
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(screen.queryByText('findme queued')).not.toBeInTheDocument()
    expect(screen.queryByText('findme beta')).not.toBeInTheDocument()
  })

  it('keeps search on unified destination changes and resets it on account, logout and source changes', async () => {
    const { rerender } = render(<Chat {...props} />)
    await start()
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en el chat' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Texto del mensaje' }), { target: { value: 'private query' } })
    rerender(<Chat {...props} channel="beta" />)
    expect(screen.getByRole('searchbox', { name: 'Texto del mensaje' })).toHaveValue('private query')
    expect(FakeSocket.instances).toHaveLength(1)
    rerender(<Chat {...props} twitchToken="other-token" twitchUsername="other-viewer" />)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en el chat' }))
    expect(screen.getByRole('searchbox', { name: 'Texto del mensaje' })).toHaveValue('')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Usuario' }), { target: { value: 'private user' } })
    rerender(<Chat {...props} twitchToken="" twitchUsername="" />)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en el chat' }))
    expect(screen.getByRole('searchbox', { name: 'Usuario' })).toHaveValue('')
    rerender(<Chat {...props} channels={['gamma']} channel="gamma" />)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en el chat' }))
    expect(screen.queryByRole('combobox', { name: 'Canal de origen' })).not.toBeInTheDocument()
  })

  it('applies existing mention and bot filters and restores focus with Escape without scrolling incoming matches', async () => {
    localStorage.setItem('blinkstream_hide_bots', 'true')
    render(<Chat {...props} />)
    const socket = await start()
    act(() => socket.receive(message('alpha', 'a', '@viewer hello', 'alice') + message('beta', 'b', 'hello', 'bob') + message('alpha', 'c', '@viewer hello', 'robot')))
    await screen.findByText('@viewer hello')
    fireEvent.click(screen.getByRole('button', { name: /Menciones/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en el chat' }))
    expect(screen.getByText('Resultados: 1')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Texto del mensaje' })).toHaveFocus()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Texto del mensaje' }), { target: { value: 'absent' } })
    expect(screen.getByText('No hay mensajes que coincidan')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(screen.getByText('Resultados: 1')).toBeInTheDocument()
    HTMLElement.prototype.scrollIntoView.mockClear()
    act(() => socket.receive(message('beta', 'next', '@viewer hello again', 'alice')))
    await screen.findByText('@viewer hello again')
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Texto del mensaje' }), { key: 'Escape' })
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buscar en el chat' })).toHaveFocus()
    expect(within(screen.getByRole('log')).queryByText('hello', { exact: true })).not.toBeInTheDocument()
  })

  it('searches only the retained 500-message window and does not notify consumers with a filtered feed', async () => {
    const onMessagesUpdate = vi.fn()
    render(<Chat {...props} channels={undefined} onMessagesUpdate={onMessagesUpdate} />)
    const socket = await start()
    act(() => socket.receive(Array.from({ length: 510 }, (_, index) => message('alpha', String(index), `entry ${String(index).padStart(3, '0')}`)).join('')))
    await screen.findByText('entry 509')
    expect(onMessagesUpdate.mock.calls.at(-1)[0]).toHaveLength(500)
    onMessagesUpdate.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en el chat' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Texto del mensaje' }), { target: { value: 'entry 000' } })
    expect(screen.getByText('Resultados: 0')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Texto del mensaje' }), { target: { value: 'entry 509' } })
    expect(within(screen.getByRole('log')).getByText('entry 509')).toBeInTheDocument()
    expect(screen.getByText('Resultados: 1')).toBeInTheDocument()
    expect(onMessagesUpdate).not.toHaveBeenCalled()
  })
})
