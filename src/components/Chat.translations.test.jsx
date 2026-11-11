import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Chat from './Chat'
import { useChatVisibility } from '../hooks/useChatVisibility'
import { setLanguage, t } from '../utils/i18n'
import { featureLanguages, recentTranslations } from '../utils/recentTranslations'

vi.mock('../utils/twitch', () => ({ PUBLIC_CLIENT_ID: 'test-client', sanitizeChannelForGraphQL: value => value, getHeaders: vi.fn(async () => ({})), banUser: vi.fn(), unbanUser: vi.fn(), clearChatMessages: vi.fn(), updateChatSettings: vi.fn(), getUserIdByLogin: vi.fn(),
  getModerators: vi.fn(async () => ({ success: false, error: { status: 401 } })),
  getVips: vi.fn(async () => ({ success: false, error: { status: 403 } })),
  getChatters: vi.fn(async () => ({ success: false, error: { status: 401 } })),
}))
vi.mock('../utils/tauriEnv', () => ({ isTauri: () => false, safeOpenUrl: vi.fn() }))
vi.mock('./drops/DropsModal', () => ({ default: ({ account, onClose }) => <div role="dialog" aria-label="Drops fixture" data-account={account}><button onClick={onClose}>Close fixture</button></div> }))

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
  it('opens Drops beside antispam with the current account and preserves the draft on close', async () => {
    const { container } = render(<Chat {...props} />)
    const socket = await connect()
    const draft = screen.getByRole('textbox', { name: /alpha/ })
    fireEvent.change(draft, { target: { value: 'borrador intacto' } })
    const drops = screen.getByRole('button', { name: t('drops.center.title') })
    expect(screen.getByRole('button', { name: t('chat.ui.toggleAntispam') }).nextElementSibling).toBe(drops)
    fireEvent.click(drops)
    const dialog = screen.getByRole('dialog', { name: 'Drops fixture' })
    expect(dialog).toHaveAttribute('data-account', 'viewer')
    expect(container).not.toContainElement(dialog)
    expect(drops).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Close fixture' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(draft).toHaveValue('borrador intacto')
    expect(ChatSocket.instances).toHaveLength(1)
    expect(socket.close).not.toHaveBeenCalled()
  })
  it('groups tools separately from account status and preserves draft while changing filters', async () => {
    render(<Chat {...props} />)
    const socket = await connect()
    const tools = screen.getByRole('toolbar', { name: t('chat.tools') })
    expect(within(tools).queryByText('viewer')).not.toBeInTheDocument()
    const buttons = within(tools).getAllByRole('button')
    buttons[0].focus()
    fireEvent.keyDown(buttons[0], { key: 'End' })
    expect(buttons.at(-1)).toHaveFocus()
    fireEvent.keyDown(buttons.at(-1), { key: 'Home' })
    expect(buttons[0]).toHaveFocus()
    const draft = screen.getByRole('textbox', { name: /alpha/ })
    fireEvent.change(draft, { target: { value: 'mi borrador' } })
    const filters = screen.getByRole('group', { name: t('chat.filters') })
    const mentions = within(filters).getByRole('button', { name: t('chat.ui.mentions') })
    fireEvent.click(mentions)
    expect(mentions).toHaveAttribute('aria-pressed', 'true')
    expect(draft).toHaveValue('mi borrador')
    expect(ChatSocket.instances).toHaveLength(1)
    expect(socket.close).not.toHaveBeenCalled()
  })
  it('keeps chill literal in phrases and renders it only in a standalone message', async () => {
    fetch.mockImplementation(async url => ({ ok: true, json: async () => String(url).includes('7tv.io/v3/emote-sets/global')
      ? { emotes: [{ id: 'fixture-chill', name: 'chill' }, { id: 'fixture-xdd', name: 'xdd' }] } : { data: [], emotes: [], sets: {} } }))
    render(<Chat {...props} />)
    const socket = await connect()
    act(() => socket.onmessage({ data: '@id=chill-phrase;user-id=99;display-name=MiNombre;badges= :minombre!m@m PRIVMSG #alpha :hoy vamos chill xdd\r\n' }))
    await screen.findByRole('img', { name: 'xdd', exact: true })
    expect(screen.queryByRole('img', { name: 'chill', exact: true })).not.toBeInTheDocument()
    expect(screen.getByText(/hoy vamos chill/)).toBeInTheDocument()
    act(() => socket.onmessage({ data: '@id=chill-alone;user-id=99;display-name=MiNombre;badges= :minombre!m@m PRIVMSG #alpha :chill\r\n' }))
    expect(await screen.findByRole('img', { name: 'chill', exact: true })).toHaveAttribute('src', 'https://cdn.7tv.app/emote/fixture-chill/3x.webp')
  })
  it('does not turn ordinary Que/que into an uppercase alias in received chat', async () => {
    fetch.mockImplementation(async url => ({ ok: true, json: async () => String(url).includes('7tv.io/v3/emote-sets/global')
      ? { emotes: [{ id: 'fixture-goku', name: 'QUE' }, { id: 'fixture-laugh', name: 'xdd' }] } : { data: [], emotes: [], sets: {} } }))
    render(<Chat {...props} />)
    const socket = await connect()
    act(() => socket.onmessage({ data: '@id=case-one;user-id=99;display-name=MiNombre;badges= :minombre!m@m PRIVMSG #alpha :Que addon es el que marca los ccs xdd\r\n' }))
    await screen.findByRole('img', { name: 'xdd', exact: true })
    expect(screen.queryByRole('img', { name: 'Que', exact: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'que', exact: true })).not.toBeInTheDocument()
    expect(screen.getByText(/Que addon es el que marca los ccs/)).toBeInTheDocument()
    act(() => socket.onmessage({ data: '@id=case-two;user-id=99;display-name=MiNombre;badges= :minombre!m@m PRIVMSG #alpha :hola QUE fin\r\n' }))
    expect(await screen.findByRole('img', { name: 'QUE', exact: true })).toHaveAttribute('src', 'https://cdn.7tv.app/emote/fixture-goku/3x.webp')
  })
  it('renders a loaded third-party emote after words in a received IRC message', async () => {
    fetch.mockImplementation(async url => ({ ok: true, json: async () => String(url).includes('7tv.io/v3/emote-sets/global')
      ? { emotes: [{ id: 'fixture-xdd', name: 'xdd' }] } : { data: [], emotes: [], sets: {} } }))
    render(<Chat {...props} />)
    const socket = await connect()
    act(() => socket.onmessage({ data: '@id=xdd-one;user-id=99;display-name=MiNombre;badges= :minombre!m@m PRIVMSG #alpha :Esto funciona xdd de nuevo\r\n' }))
    const image = await screen.findByRole('img', { name: 'xdd', exact: true })
    expect(image).toHaveAttribute('src', 'https://cdn.7tv.app/emote/fixture-xdd/3x.webp')
    expect(image.parentElement).toHaveTextContent('Esto funciona')
    expect(image.parentElement).toHaveTextContent('de nuevo')
  })
  it('preserves messages, incoming messages and draft through responsive hide and restore', async () => {
    vi.stubGlobal('innerWidth', 1280)
    function ResponsiveChat() {
      const [visible] = useChatVisibility()
      return <div hidden={!visible}><Chat {...props} /></div>
    }
    render(<ResponsiveChat />)
    const socket = await connect()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Conservar borrador' } })
    act(() => { window.innerWidth = 400; window.dispatchEvent(new Event('resize')) })
    expect(screen.getByText('https://twitch.tv/alpha')).not.toBeVisible()
    act(() => socket.onmessage({ data: '@id=two;user-id=99;display-name=MiNombre;badges= :minombre!m@m PRIVMSG #alpha :Llegó mientras estaba oculto\r\n' }))
    act(() => { window.innerWidth = 1280; window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('focus')) })
    expect(screen.getByText('https://twitch.tv/alpha')).toBeVisible()
    expect(await screen.findByText('Llegó mientras estaba oculto')).toBeVisible()
    expect(screen.getByRole('textbox')).toHaveValue('Conservar borrador')
    expect(ChatSocket.instances).toHaveLength(1)
    expect(socket.close).not.toHaveBeenCalled()
  })
  it('gives users their own pane and preserves the chat connection when returning', async () => {
    localStorage.setItem('bs.chat.use_twitch_popout', 'false')
    render(<Chat {...props} channels={undefined} broadcasterId="owner" userId="viewer-id" />)
    await connect()
    fireEvent.change(screen.getByRole('textbox', { name: t('chat.placeholder.send') }), { target: { value: 'Borrador conservado' } })
    fireEvent.click(screen.getByRole('button', { name: t('community.title'), exact: true }))
    const pane = screen.getByRole('region', { name: t('community.title') })
    expect(within(pane).getByRole('combobox', { name: t('community.filter') })).toBeVisible()
    expect(screen.queryByRole('button', { name: t('chat.ui.mentions'), exact: true })).not.toBeInTheDocument()
    fireEvent.click(within(pane).getByRole('button', { name: t('chat.layout.back') }))
    expect(screen.queryByRole('region', { name: t('community.title') })).not.toBeInTheDocument()
    expect(screen.getByText('https://twitch.tv/alpha')).toBeVisible()
    expect(screen.getByRole('textbox', { name: t('chat.placeholder.send') })).toHaveValue('Borrador conservado')
    expect(ChatSocket.instances).toHaveLength(1)
  })
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
