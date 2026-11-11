import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ActiveModsPanel } from './ActiveModsPanel'
import { getModerators, getVips, getChatters } from '../../utils/twitch'
import { t } from '../../utils/i18n'
import { invoke } from '@tauri-apps/api/core'
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

vi.mock('../../utils/twitch', () => ({ getModerators: vi.fn(), getVips: vi.fn(), getChatters: vi.fn() }))
beforeEach(() => {
  vi.clearAllMocks()
  getModerators.mockResolvedValue({ success: false, error: { status: 401, context: { reason: 'broadcaster_only' } } })
  getVips.mockResolvedValue({ success: false, error: { status: 403 } })
  getChatters.mockResolvedValue({ success: false, error: { status: 401 } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); invoke.mockReset() })
const messages = [{ user: 'alice', displayName: 'Alicia', userId: '99', badges: [] }]

it('defaults to grouped community and opens a native whisper without triggering inspection', async () => {
  const whisper = vi.fn(), inspect = vi.fn()
  window.addEventListener('bs:whisper:open', whisper)
  render(<ActiveModsPanel broadcasterId="1" recentMessages={messages} onInspectUser={inspect} />)
  expect(screen.getByRole('combobox')).toHaveValue('groups')
  fireEvent.click(await screen.findByRole('button', { name: `${t('whisper.open')} @alice` }))
  expect(whisper).toHaveBeenCalledOnce()
  expect(whisper.mock.calls[0][0].detail).toMatchObject({ userId: '99', username: 'alice' })
  expect(inspect).not.toHaveBeenCalled()
  window.removeEventListener('bs:whisper:open', whisper)
})

it('uses a public role list after Helix denies access and preserves the broadcaster role', async () => {
  vi.stubGlobal('isTauri', true)
  invoke.mockResolvedValue({ users: [{ user_login: 'owner', user_name: 'Owner', isBroadcaster: true }, { user_login: 'quietmod', user_name: 'QuietMod', isMod: true }] })
  render(<ActiveModsPanel broadcasterId="1" channelLogin="owner" initialTab="groups" />)
  expect(await screen.findByRole('button', { name: /QuietMod @quietmod/ })).toBeVisible()
  expect(screen.getByRole('button', { name: /Owner @owner/ })).toBeVisible()
  expect(screen.getByText(t('community.vipPartial'))).toBeVisible()
  expect(screen.getByText(t('community.partial'))).toBeVisible()
  expect(invoke).toHaveBeenCalledWith('get_public_chat_roster', { channel: 'owner' })
})

it('enriches a public login with observed display name, ID and chat color', async () => {
  vi.stubGlobal('isTauri', true)
  invoke.mockResolvedValue({ users: [{ user_login: 'alice', user_name: 'alice' }] })
  const inspect = vi.fn()
  render(<ActiveModsPanel broadcasterId="1" channelLogin="owner" initialTab="groups" recentMessages={[{ ...messages[0], color: '#a78bfa' }]} onInspectUser={inspect} />)
  const row = await screen.findByRole('button', { name: /Alicia @alice/ })
  await waitFor(() => expect(invoke).toHaveBeenCalled())
  expect(screen.getByText('Alicia')).toHaveStyle({ color: '#a78bfa' })
  expect(row).not.toHaveTextContent('@alice')
  fireEvent.click(row)
  expect(inspect).toHaveBeenCalledWith(expect.objectContaining({ userId: '99', displayName: 'Alicia' }))
})

it('keeps observed users visible with one collapsed permission summary', async () => {
  render(<ActiveModsPanel broadcasterId="owner" userId="mod" initialTab="groups" recentMessages={messages} />)
  await screen.findByText(t('community.partial'))
  expect(screen.getByRole('button', { name: /Alicia @alice/ })).toBeVisible()
  const details = screen.getByText(t('community.partial')).closest('details')
  expect(details).not.toHaveAttribute('open')
  screen.getAllByRole('alert').forEach(notice => expect(notice).not.toBeVisible())
  fireEvent.click(screen.getByText(t('community.partial')))
  expect(details).toHaveAttribute('open')
  expect(screen.getAllByRole('alert')).toHaveLength(3)
})

it('filters roles without a horizontally scrolling toolbar and preserves inspect identity', async () => {
  const inspect = vi.fn()
  render(<ActiveModsPanel broadcasterId="owner" initialTab="groups" recentMessages={messages} onInspectUser={inspect} />)
  await waitFor(() => expect(getChatters).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: /Alicia @alice/ }))
  expect(inspect).toHaveBeenCalledWith(expect.objectContaining({ username: 'alice', userId: '99' }))
  fireEvent.change(screen.getByRole('combobox', { name: t('community.filter') }), { target: { value: 'chatters' } })
  expect(screen.getByRole('combobox', { name: t('community.filter') })).toHaveValue('chatters')
  expect(screen.getByRole('button', { name: t('community.refresh') })).toBeEnabled()
})


it('loads the creator VIP list without a partial notice', async () => {
  getVips.mockResolvedValue({ success: true, value: [{ user_id: '9', user_login: 'vipuser', user_name: 'VipUser' }] })
  render(<ActiveModsPanel broadcasterId="1" userId="1" initialTab="vips" />)
  expect(await screen.findByRole('button', { name: /VipUser @vipuser/ })).toBeVisible()
  expect(getVips).toHaveBeenCalledWith('1')
  expect(screen.queryByText(t('community.vipPartial'))).not.toBeInTheDocument()
})

it('skips the creator-only request for a known moderator and retains the public VIP warning', async () => {
  vi.stubGlobal('isTauri', true)
  invoke.mockResolvedValue({ users: [{ user_login: 'publicvip', user_name: 'PublicVip', isVip: true }] })
  render(<ActiveModsPanel broadcasterId="1" userId="2" channelLogin="owner" initialTab="vips" />)
  expect(await screen.findByRole('button', { name: /PublicVip @publicvip/ })).toBeVisible()
  expect(getVips).not.toHaveBeenCalled()
  expect(screen.getByText(t('community.vipOwnerOnly'))).toBeVisible()
  fireEvent.click(screen.getByText(t('community.partial')))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText(t('community.vipPartial'))).toBeVisible()
  expect(screen.queryByText(t('community.empty'))).not.toBeInTheDocument()
})

it.each(['Missing scope: channel:read:vips', 'Missing scope'])('explains explicit creator VIP scope errors: %s', async twitchMsg => {
  getVips.mockResolvedValue({ success: false, error: { context: { status: 401, twitchMsg } } })
  render(<ActiveModsPanel broadcasterId="1" userId="1" initialTab="vips" />)
  expect(await screen.findByText(t('community.vipReadScope'))).toBeVisible()
  expect(screen.getByRole('note')).toHaveTextContent('channel:read:vips')
  fireEvent.click(screen.getByText(t('community.partial')))
  expect(screen.queryByText(new RegExp(t('mod.data.authorization')))).not.toBeInTheDocument()
  expect(screen.getByText(t('community.vipPartial'))).toBeVisible()
  expect(screen.queryByText(t('community.empty'))).not.toBeInTheDocument()
})

it.each(['Invalid OAuth token', 'Client ID mismatch', ''])('keeps generic 401 diagnosis for %s', async twitchMsg => {
  getVips.mockResolvedValue({ success: false, error: { context: { status: 401, twitchMsg } } })
  render(<ActiveModsPanel broadcasterId="1" userId="1" initialTab="vips" />)
  await screen.findByText(t('community.partial'))
  expect(screen.queryByText(t('community.vipReadScope'))).not.toBeInTheDocument()
  fireEvent.click(screen.getByText(t('community.partial')))
  expect(screen.getByRole('alert')).toHaveTextContent(t('mod.data.authorization'))
  expect(screen.getByRole('alert')).toHaveTextContent('HTTP 401')
})

it('preserves VIP lookup for unknown viewer identity', async () => {
  render(<ActiveModsPanel broadcasterId="1" initialTab="vips" />)
  await waitFor(() => expect(getVips).toHaveBeenCalledWith('1'))
})
