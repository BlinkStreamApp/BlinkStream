import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Chat from './Chat'
import { setLanguage, t } from '../utils/i18n'
import { featureLanguages, recentTranslations } from '../utils/recentTranslations'

vi.mock('../utils/twitch', () => ({ PUBLIC_CLIENT_ID: 'test-client', sanitizeChannelForGraphQL: value => value, getHeaders: vi.fn(async () => ({})), banUser: vi.fn(), unbanUser: vi.fn(), clearChatMessages: vi.fn(), updateChatSettings: vi.fn(), getUserIdByLogin: vi.fn() }))
vi.mock('../utils/tauriEnv', () => ({ isTauri: () => false, safeOpenUrl: vi.fn() }))

class ChatSocket {
  static OPEN = 1
  static instances = []
  readyState = 0
  send = vi.fn()
  close = vi.fn(() => { this.readyState = 3 })
  constructor() { ChatSocket.instances.push(this) }
}
const props = { channel: 'alpha', channels: ['alpha', 'beta'], isGridMode: true, twitchToken: 'synthetic-token', twitchUsername: 'viewer' }
const connect = async () => {
  await waitFor(() => expect(ChatSocket.instances).toHaveLength(1))
  const socket = ChatSocket.instances[0]
  act(() => {
    socket.readyState = 1
    socket.onopen()
    socket.onmessage({ data: '@badges= :tmi.twitch.tv USERSTATE #alpha\r\n' })
    socket.onmessage({ data: '@id=one;user-id=99;display-name=MiNombre;badges= :minombre!m@m PRIVMSG #alpha :Hola https://twitch.tv/alpha\r\n' })
  })
  await screen.findByText('https://twitch.tv/alpha')
  return socket
}

describe('chat localization', () => {
  beforeEach(() => {
    setLanguage('es')
    ChatSocket.instances = []
    vi.stubGlobal('WebSocket', ChatSocket)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: [], emotes: [], sets: {} }) })))
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  })
  afterEach(() => { act(() => setLanguage('es')); vi.unstubAllGlobals() })

  it.each(featureLanguages)('renders chat search, surrounding tabs, hints and empty states in %s', async language => {
    setLanguage(language)
    const dictionary = recentTranslations[language]
    render(<Chat {...props} />)
    await connect()
    expect(screen.getByRole('button', { name: new RegExp(dictionary['chat.ui.mentions']) })).toHaveAttribute('title', dictionary['chat.ui.mentionsHint'])
    expect(screen.getByRole('button', { name: new RegExp(dictionary['chat.ui.featured']) })).toHaveAttribute('title', dictionary['chat.ui.featuredHint'])
    expect(screen.getByTitle(`${dictionary['chat.ui.channel']}: alpha`)).toBeVisible()
    expect(screen.getByTitle(`${dictionary['chat.ui.openLink']}: https://twitch.tv/alpha`)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: dictionary['chat.search.title'] }))
    expect(screen.getByRole('searchbox', { name: dictionary['chat.search.text'] })).toHaveAttribute('placeholder', dictionary['chat.search.placeholder'])
    expect(screen.getByRole('searchbox', { name: dictionary['chat.search.user'] })).toHaveAttribute('placeholder', dictionary['chat.search.userPlaceholder'])
    expect(screen.getByRole('combobox', { name: dictionary['chat.search.channel'] })).toHaveValue('')
    expect(screen.getByRole('checkbox', { name: dictionary['chat.search.linksOnly'] })).toBeVisible()
    expect(screen.getByText(`${dictionary['chat.search.results']}: 1`)).toBeVisible()
    fireEvent.change(screen.getByRole('searchbox', { name: dictionary['chat.search.text'] }), { target: { value: 'missing text' } })
    expect(screen.getByText(dictionary['chat.search.empty'])).toBeVisible()
    fireEvent.keyDown(screen.getByRole('searchbox', { name: dictionary['chat.search.text'] }), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(dictionary['chat.ui.mentions']) }))
    expect(screen.getByText(dictionary['chat.ui.noMentions'])).toBeVisible()
    expect(screen.getByText(dictionary['chat.ui.noMentionsHint'])).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(dictionary['chat.ui.featured']) }))
    expect(screen.getByText(dictionary['chat.ui.noFeatured'])).toBeVisible()
  })

  it('changes language without reconnecting, losing the query or moving the draft', async () => {
    render(<Chat {...props} />)
    const socket = await connect()
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en el chat' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Texto del mensaje' }), { target: { value: 'Hola' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Mensaje para alpha' }), { target: { value: 'mi borrador' } })
    act(() => setLanguage('en'))
    expect(screen.getByRole('searchbox', { name: 'Message text' })).toHaveValue('Hola')
    expect(screen.getByRole('textbox', { name: `${t('grid.messageFor')} alpha` })).toHaveValue('mi borrador')
    expect(screen.getByRole('combobox', { name: t('grid.destination') })).toHaveValue('alpha')
    expect(within(screen.getByRole('log', { name: 'Chat messages' })).getByText('minombre')).toBeVisible()
    expect(screen.getByText('Results: 1')).toBeVisible()
    expect(ChatSocket.instances).toHaveLength(1)
    expect(socket.close).not.toHaveBeenCalled()
    expect(socket.send.mock.calls.flat().some(line => line.startsWith('PRIVMSG'))).toBe(false)
  })

  it('retranslates an existing local error when changing language', async () => {
    setLanguage('en')
    render(<Chat {...props} />)
    await connect()
    fireEvent.change(screen.getByRole('textbox', { name: `${t('grid.messageFor')} alpha` }), { target: { value: '/ban reader' } })
    fireEvent.click(screen.getByRole('button', { name: t('chat.sendBtn'), exact: true }))
    const key = 'Usa el chat individual para comandos de moderación. En unificado puedes usar /me.'
    expect(await screen.findByText(recentTranslations.en[key])).toBeVisible()
    act(() => setLanguage('fr'))
    expect(screen.getByText(recentTranslations.fr[key])).toBeVisible()
    expect(ChatSocket.instances).toHaveLength(1)
  })
})
