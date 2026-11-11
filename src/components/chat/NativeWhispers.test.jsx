import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { getUserById, getUserByLogin } from '../../utils/twitch'
import { startRewardEventSub } from '../../utils/twitchEventSub'
import { getWhisperUnread, openNativeWhisper, openWhisperInbox } from '../../utils/whispers'
import NativeWhispers from './NativeWhispers'
import WhisperInboxButton from './WhisperInboxButton'
import { t } from '../../utils/i18n'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../../utils/twitch', () => ({ getUserById: vi.fn(), getUserByLogin: vi.fn() }))
vi.mock('../../utils/twitchEventSub', () => ({ startRewardEventSub: vi.fn(() => vi.fn()) }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  getUserByLogin.mockImplementation(async login => ({ success: true, value: { id: login === 'alice' ? '2' : '3', display_name: login, profile_image_url: 'https://example.com/avatar.png' } }))
  invoke.mockResolvedValue({ status: 'accepted' })
})
async function open(login = 'alice') {
  act(() => { openNativeWhisper({ username: login }) })
  await waitFor(() => expect(screen.getByRole('button', { name: t('whisper.send') })).toBeDisabled())
  await waitFor(() => expect(document.querySelector('.native-whispers header img')).not.toBeNull())
}
it('starts account reception before any conversation is opened', () => {
  render(<NativeWhispers account="1" />)
  expect(startRewardEventSub).toHaveBeenCalledOnce()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('opens and sends inside the app only after a deliberate send, retaining threads on close', async () => {
  const browser = vi.spyOn(window, 'open')
  render(<NativeWhispers account="1" />)
  await open()
  expect(invoke).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Private test' } })
  fireEvent.click(screen.getByRole('button', { name: t('whisper.send') }))
  expect(await screen.findByText('Private test')).toBeInTheDocument()
  expect(screen.getByRole('textbox')).toHaveValue('')
  expect(invoke).toHaveBeenCalledWith('send_native_whisper', { account: '1', target: '2', message: 'Private test', webSession: false })
  fireEvent.click(screen.getByRole('button', { name: t('whisper.close') }))
  await open('bob')
  expect(screen.queryByText('Private test')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: t('whisper.close') }))
  await open()
  expect(screen.getByText('Private test')).toBeInTheDocument()
  expect(browser).not.toHaveBeenCalled()
  browser.mockRestore()
})
it('does not resolve a previous recipient into a new conversation or send twice while pending', async () => {
  let resolve
  getUserByLogin.mockReturnValueOnce(new Promise(r => { resolve = r }))
  render(<NativeWhispers account="1" />)
  act(() => { openNativeWhisper({ username: 'alice' }) })
  await open('bob')
  await act(async () => resolve({ success: true, value: { id: '2', display_name: 'Old recipient' } }))
  expect(screen.queryByText('Old recipient')).not.toBeInTheDocument()
  invoke.mockReturnValue(new Promise(() => {}))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'To Bob' } })
  fireEvent.click(screen.getByRole('checkbox'))
  const button = screen.getByRole('button', { name: t('whisper.send') })
  fireEvent.click(button); fireEvent.click(button)
  expect(invoke).toHaveBeenCalledOnce()
  expect(invoke.mock.calls[0][1]).toMatchObject({ target: '3', webSession: true })
})
it('shows Twitch rejections without pretending the whisper was sent and renders live incoming text safely', async () => {
  invoke.mockRejectedValue('recipient-policy')
  render(<NativeWhispers account="1" />)
  await open()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Rejected text' } })
  fireEvent.click(screen.getByRole('button', { name: t('whisper.send') }))
  expect(await screen.findByText(t('whisper.recipient-policy'))).toBeVisible()
  expect(screen.queryByText(t('whisper.acceptedShort'))).not.toBeInTheDocument()
  act(() => startRewardEventSub.mock.calls[0][0].moderation.onEvent({ id: 'w1', event: { whisper_id: 'w1', from_user_id: '2', from_user_login: 'alice', to_user_id: '1', whisper: { text: '<img onerror=alert(1)>' } } }))
  expect(screen.getByText('<img onerror=alert(1)>')).toBeInTheDocument()
  expect(document.querySelector('[onerror]')).toBeNull()
  act(() => startRewardEventSub.mock.calls[0][0].moderation.onTopics([{ type: 'user.whisper.message', status: 403 }]))
  expect(screen.getByText(t('whisper.receiveUnavailable'))).toBeVisible()
})
it('rejects an unresolved recipient and does not open a conversation when signed out', async () => {
  const view = render(<NativeWhispers account="" />)
  act(() => { openNativeWhisper({ username: 'alice' }) })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  view.rerender(<NativeWhispers key="1" account="1" />)
  getUserByLogin.mockResolvedValue({ success: true, value: null })
  act(() => { openNativeWhisper({ username: 'alice' }) })
  expect(await screen.findByText(t('whisper.recipient'))).toBeInTheDocument()
  expect(screen.getByRole('button', { name: t('whisper.send') })).toBeDisabled()
})
it('does not suggest retrying the official session when that same session lacks whisper permission', async () => {
  invoke.mockRejectedValue('permission')
  render(<NativeWhispers account="1" />)
  await open()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Permission test' } })
  fireEvent.click(screen.getByRole('button', { name: t('whisper.send') }))
  expect(await screen.findByText(t('whisper.webPermission'))).toBeVisible()
  expect(screen.queryByText(t('whisper.permission'))).not.toBeInTheDocument()
})

function receive(listener, id, from = '2', extra = {}) {
  listener.moderation.onEvent({ id: 'transport-' + id, event: {
    whisper_id: id, from_user_id: from, from_user_login: from === '2' ? 'alice' : 'bob',
    to_user_id: '1', whisper: { text: 'Fixture ' + id }, ...extra,
  } })
}

it('updates the isolated badge without opening private UI or rerendering its parent', async () => {
  const parentRender = vi.fn()
  function Parent() {
    parentRender()
    return <><WhisperInboxButton account="1" /><NativeWhispers account="1" /></>
  }
  render(<Parent />)
  const listener = startRewardEventSub.mock.calls[0][0]
  act(() => {
    receive(listener, 'one')
    receive(listener, 'one') // Same whisper, different transport delivery.
    receive(listener, 'two', '3')
  })
  expect(getWhisperUnread('1')).toBe(2)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(parentRender).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: `${t('whisper.inbox')} (2 ${t('whisper.unread')})` }))
  expect(document.querySelectorAll('.native-whisper-threads > button')).toHaveLength(2)
  await open()
  expect(getWhisperUnread('1')).toBe(1)
  expect(startRewardEventSub).toHaveBeenCalledOnce()
  expect(invoke).not.toHaveBeenCalled()
})

it('reads only the visible peer while focused, including after focus/visibility restoration', async () => {
  render(<NativeWhispers account="1" />)
  const listener = startRewardEventSub.mock.calls[0][0]
  document.hasFocus.mockReturnValue(false)
  act(() => receive(listener, 'one'))
  await open()
  expect(getWhisperUnread('1')).toBe(1)
  document.hasFocus.mockReturnValue(true)
  act(() => window.dispatchEvent(new Event('focus')))
  expect(getWhisperUnread('1')).toBe(0)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  act(() => receive(listener, 'two'))
  expect(getWhisperUnread('1')).toBe(1)
  // Override the visibility getter rather than relying on jsdom window focus.
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(getWhisperUnread('1')).toBe(0)
  act(() => receive(listener, 'bob', '3'))
  expect(getWhisperUnread('1')).toBe(1)
  act(openWhisperInbox)
  act(() => receive(listener, 'three'))
  expect(getWhisperUnread('1')).toBe(2)
})

it('renews authorization without losing same-account messages and ignores stopped callbacks', () => {
  const view = render(<NativeWhispers key="1" account="1" />)
  const first = startRewardEventSub.mock.calls[0][0]
  const stop = startRewardEventSub.mock.results[0].value
  act(() => receive(first, 'one'))
  act(() => window.dispatchEvent(new Event('blinkstream_auth_updated')))
  expect(stop).toHaveBeenCalledOnce()
  expect(startRewardEventSub).toHaveBeenCalledTimes(2)
  const second = startRewardEventSub.mock.calls[1][0]
  act(() => { receive(first, 'stale'); receive(second, 'one'); receive(second, 'two') })
  expect(getWhisperUnread('1')).toBe(2)
  view.rerender(<NativeWhispers key="4" account="4" />)
  expect(getWhisperUnread('1')).toBe(0)
  act(() => receive(second, 'after-account-change'))
  expect(getWhisperUnread('4')).toBe(0)
  act(openWhisperInbox)
  expect(screen.getByText(t('whisper.inboxEmpty'))).toBeVisible()
  const third = startRewardEventSub.mock.calls[2][0]
  view.rerender(<NativeWhispers key="signed-out" account="" />)
  act(() => receive(third, 'after-logout', '2', { to_user_id: '4' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(startRewardEventSub).toHaveBeenCalledTimes(3)
})

it('retains only 200 messages and rejects malformed or foreign events', () => {
  render(<NativeWhispers account="1" />)
  const listener = startRewardEventSub.mock.calls[0][0]
  act(() => {
    for (let i = 0; i < 205; i++) receive(listener, 'message-' + i)
    receive(listener, 'foreign', '2', { to_user_id: '4' })
    receive(listener, 'invalid-id', 'invalid')
    receive(listener, 'oversized', '2', { whisper: { text: 'x'.repeat(501) } })
  })
  expect(getWhisperUnread('1')).toBe(200)
  act(openWhisperInbox)
  expect(screen.getByText('Fixture message-204')).toBeInTheDocument()
  expect(document.querySelectorAll('.native-whisper-threads > button')).toHaveLength(1)
})

it('distinguishes reconnecting/network failures from permission denials', () => {
  render(<NativeWhispers account="1" />)
  act(openWhisperInbox)
  const listener = startRewardEventSub.mock.calls[0][0]
  act(() => listener.onStatus({ state: 'reconnecting' }))
  expect(screen.getByText(t('whisper.reconnecting'))).toBeVisible()
  act(() => listener.onStatus({ state: 'unavailable' }))
  expect(screen.getByText(t('whisper.receiveError'))).toBeVisible()
  expect(screen.queryByText(t('whisper.receiveUnavailable'))).not.toBeInTheDocument()
  act(() => {
    listener.moderation.onTopics([{ type: 'user.whisper.message', status: 403 }])
    listener.onStatus({ state: 'unavailable' })
  })
  expect(screen.getByText(t('whisper.receiveUnavailable'))).toBeVisible()
})

it('discards late recipient and send responses after account cleanup', async () => {
  let resolveRecipient, resolveSend
  const view = render(<NativeWhispers key="1" account="1" />)
  await open()
  invoke.mockReturnValueOnce(new Promise(resolve => { resolveSend = resolve }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Synthetic pending send' } })
  fireEvent.click(screen.getByRole('button', { name: t('whisper.send') }))
  getUserByLogin.mockReturnValueOnce(new Promise(resolve => { resolveRecipient = resolve }))
  act(() => openNativeWhisper({ username: 'bob' }))
  view.rerender(<NativeWhispers key="4" account="4" />)
  await act(async () => {
    resolveSend({ status: 'accepted' })
    resolveRecipient({ success: true, value: { id: '3', display_name: 'Stale peer' } })
  })
  act(openWhisperInbox)
  expect(screen.getByText(t('whisper.inboxEmpty'))).toBeVisible()
  expect(screen.queryByText('Stale peer')).not.toBeInTheDocument()
  expect(invoke).toHaveBeenCalledOnce()
})

it('preserves edits made while a send is pending, including editing back to the sent text', async () => {
  render(<NativeWhispers account="1" />)
  await open()
  for (const nextDraft of ['Draft B', 'Draft A']) {
    let accept
    invoke.mockReturnValueOnce(new Promise(resolve => { accept = resolve }))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Draft A' } })
    fireEvent.click(screen.getByRole('button', { name: t('whisper.send') }))
    fireEvent.change(textarea, { target: { value: 'Temporary edit' } })
    fireEvent.change(textarea, { target: { value: nextDraft } })
    await act(async () => accept({ status: 'accepted' }))
    expect(textarea).toHaveValue(nextDraft)
  }
  expect(invoke).toHaveBeenCalledTimes(2)
})

it.each(['renamed', 'missing', 'rejected', 'mismatched'])('opens stable thread history when profile is %s without resolving its old login', async outcome => {
  render(<NativeWhispers account="1" />)
  act(() => receive(startRewardEventSub.mock.calls[0][0], 'stable-history'))
  if (outcome === 'rejected') getUserById.mockRejectedValueOnce(new Error('offline'))
  else getUserById.mockResolvedValueOnce({ success: true, value: outcome === 'missing' ? null : {
    id: outcome === 'mismatched' ? '3' : '2', login: 'renamed_user', display_name: 'Renamed user',
  } })
  act(openWhisperInbox)
  fireEvent.click(document.querySelector('.native-whisper-threads > button'))
  expect(screen.getByText('Fixture stable-history')).toBeVisible()
  await waitFor(() => expect(getUserById).toHaveBeenCalledWith('2'))
  if (outcome === 'renamed') await screen.findByText('@renamed_user')
  else await screen.findByText(t('whisper.recipient'))
  expect(getUserByLogin).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Synthetic reply' } })
  fireEvent.click(screen.getByRole('button', { name: t('whisper.send') }))
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('send_native_whisper', {
    account: '1', target: '2', message: 'Synthetic reply', webSession: false,
  }))
})

it('moves keyboard focus on navigation, preserves it during updates and restores the opener on Escape', async () => {
  let resolveProfile
  getUserById.mockReturnValueOnce(new Promise(resolve => { resolveProfile = resolve }))
  render(<><WhisperInboxButton account="1" /><NativeWhispers account="1" /></>)
  const opener = screen.getByRole('button', { name: t('whisper.inbox') })
  opener.focus()
  fireEvent.click(opener)
  expect(screen.getByLabelText(t('whisper.recipientLogin'))).toHaveFocus()
  const listener = startRewardEventSub.mock.calls[0][0]
  act(() => receive(listener, 'keyboard'))
  const thread = document.querySelector('.native-whisper-threads > button')
  thread.focus()
  fireEvent.keyDown(thread, { key: 'Enter' })
  fireEvent.click(thread) // jsdom does not synthesize the browser's Enter activation click.
  fireEvent.keyUp(thread, { key: 'Enter' })
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: t('whisper.inbox') })).toHaveFocus()
  const textarea = screen.getByRole('textbox')
  textarea.focus()
  await act(async () => resolveProfile({ success: true, value: { id: '2', login: 'alice', display_name: 'Alice' } }))
  act(() => receive(listener, 'keyboard-next'))
  expect(textarea).toHaveFocus()
  const back = within(screen.getByRole('dialog')).getByRole('button', { name: t('whisper.inbox') })
  back.focus()
  fireEvent.keyDown(back, { key: 'Enter' })
  fireEvent.click(back)
  fireEvent.keyUp(back, { key: 'Enter' })
  expect(screen.getByLabelText(t('whisper.recipientLogin'))).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(opener).toHaveFocus()
})
