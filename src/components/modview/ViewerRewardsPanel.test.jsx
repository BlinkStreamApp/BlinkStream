import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useTwitchDrops } from '../../hooks/useTwitchDrops'
import ViewerRewardsPanel from './ViewerRewardsPanel'
import { t } from '../../utils/i18n'
import { acquireChannelActivity, clearChannelActivity } from '../../utils/channelActivity'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../../hooks/useTwitchDrops', () => ({ useTwitchDrops: vi.fn() }))
vi.mock('./NativePointsSummary', () => ({ NativePointsSummary: () => <p>Balance</p> }))
const item = { id: 'reward', title: 'Hydration', cost: 100, prompt: 'Choose a drink', enabled: true, paused: false, inStock: true, inputRequired: true }
const snapshot = channel => ({ accountId: '1', channel, channelId: '2', items: [item] })
afterEach(() => clearChannelActivity('1'))
beforeEach(() => {
  vi.clearAllMocks()
  useTwitchDrops.mockReturnValue({ session: 'session1', accountId: '1' })
  invoke.mockImplementation(async (command, data) => command === 'read_connected_channel_rewards' ? snapshot(data.channel) : { status: 'accepted', requestId: data.intent.requestId })
})
async function choose() {
  await screen.findByText(item.title)
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: t('points.viewer.redeem') }))
  const form = screen.getByRole('form', { name: t('points.viewer.confirm') })
  fireEvent.change(within(form).getByRole('textbox'), { target: { value: 'Water' } })
  return form
}
it('requires separate opt-in and confirmation, never spends when opening or cancelling the catalog', async () => {
  render(<ViewerRewardsPanel account="owner" userId="1" channel="channel" />)
  await screen.findByText(item.title)
  expect(screen.getByRole('button', { name: t('points.viewer.redeem') })).toBeDisabled()
  const form = await choose()
  expect(invoke.mock.calls.every(([command]) => command === 'read_connected_channel_rewards')).toBe(true)
  fireEvent.click(within(form).getByRole('button', { name: t('points.viewer.cancel') }))
  expect(invoke).toHaveBeenCalledOnce()
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
})
it('sends one fixed intent with the displayed quote and blocks duplicate clicks', async () => {
  render(<ViewerRewardsPanel account="owner" userId="1" channel="channel" />)
  const form = await choose()
  let settle
  invoke.mockImplementationOnce((_, data) => new Promise(r => { settle = () => r({ status: 'accepted', requestId: data.intent.requestId }) }))
  const confirm = within(form).getByRole('button', { name: t('points.viewer.confirm') })
  fireEvent.click(confirm); fireEvent.click(confirm)
  const writes = invoke.mock.calls.filter(([name]) => name === 'redeem_connected_channel_reward')
  expect(writes).toHaveLength(1)
  expect(writes[0][1].intent).toMatchObject({ session: 'session1', channel: 'channel', rewardId: 'reward', expectedCost: 100, expectedTitle: item.title, text: 'Water', confirmed: true })
  expect(writes[0][1].intent.requestId).toMatch(/^[a-f0-9]{32}$/)
  await act(async () => settle())
  expect(await screen.findByText(t('points.viewer.accepted'))).toBeInTheDocument()
  const feed = acquireChannelActivity({ accountId: '1', channelId: '2', channel: 'channel' })
  expect(feed.snapshot().redemptions).toHaveLength(1)
  expect(feed.snapshot().redemptions[0]).toMatchObject({ reward_id: 'reward', status: 'CONFIRMED', user_input: 'Water', manageable: false })
  feed.release()
})
it('blocks uncertain outcomes instead of repeating a potentially charged request', async () => {
  render(<ViewerRewardsPanel account="owner" userId="1" channel="channel" />)
  const form = await choose()
  invoke.mockRejectedValueOnce('timeout')
  fireEvent.click(within(form).getByRole('button', { name: t('points.viewer.confirm') }))
  expect(await screen.findByText(t('points.viewer.unconfirmed'))).toBeVisible()
  expect(within(form).getByRole('button', { name: t('points.viewer.confirm') })).toBeDisabled()
  expect(screen.getByRole('button', { name: t('points.viewer.redeem') })).toBeDisabled()
  const feed = acquireChannelActivity({ accountId: '1', channelId: '2', channel: 'channel' })
  expect(feed.snapshot().redemptions).toHaveLength(0)
  feed.release()
})
it('discards confirmation and consent on channel/session change and rejects late catalog data', async () => {
  const view = render(<ViewerRewardsPanel account="owner" userId="1" channel="channel" />)
  await choose()
  useTwitchDrops.mockReturnValue({ session: 'session2', accountId: '1' })
  let resolve
  invoke.mockReturnValueOnce(new Promise(r => { resolve = r }))
  view.rerender(<ViewerRewardsPanel account="owner" userId="1" channel="other" />)
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  view.rerender(<ViewerRewardsPanel account="owner" userId="1" channel="current" />)
  await waitFor(() => expect(screen.getByText(item.title)).toBeInTheDocument())
  await act(async () => resolve({ ...snapshot('other'), items: [{ ...item, title: 'Stale reward' }] }))
  expect(screen.queryByText('Stale reward')).not.toBeInTheDocument()
})
it('does not offer a reward with incomplete availability data or mismatched account', async () => {
  invoke.mockResolvedValueOnce({ ...snapshot('channel'), items: [{ ...item, inStock: null }] })
  const view = render(<ViewerRewardsPanel account="owner" userId="1" channel="channel" />)
  await screen.findByText(item.title)
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('button', { name: t('points.viewer.redeem') })).toBeDisabled()
  useTwitchDrops.mockReturnValue({ session: 'session2', accountId: '2' })
  view.rerender(<ViewerRewardsPanel account="owner" userId="1" channel="channel" />)
  expect(screen.getByText(t('points.viewer.connect'))).toBeInTheDocument()
  expect(invoke).toHaveBeenCalledOnce()
})
