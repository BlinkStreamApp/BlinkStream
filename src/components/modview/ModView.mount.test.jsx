import { getUserIdByLogin } from '../../utils/twitch'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import ModView from './ModView'
import { t } from '../../utils/i18n'

vi.mock('../../hooks/useModeration', () => ({ useModeration: () => ({ auditLog: feeds.localAudit || [], remainingActions: 20 }) }))
vi.mock('../../hooks/useChannelRole', () => ({ useChannelRole: () => ({ isBroadcaster: false, isModerator: true }) }))
vi.mock('../../hooks/useManageRewards', () => ({ useManageRewards: () => ({ pendingRedemptions: [], fulfilledRedemptions: [] }) }))
vi.mock('../VideoPlayer', () => ({ default: props => <div data-testid="modview-player" data-channel={props.channel} data-volume={props.volume} data-quality={props.quality} data-user={props.twitchUsername} data-owner={props.broadcasterId} data-compact={String(props.compact)} /> }))
vi.mock('../Chat', () => ({ default: ({ isModerator, broadcasterId }) => <div data-testid="modview-chat" data-moderator={isModerator} data-broadcaster={broadcasterId} /> }))

const props = {
  channel: 'testchannel', broadcasterId: '123', userId: '456',
  isLoggedIn: true, twitchUsername: 'viewer', volume: 50, quality: 'best',
  onVolumeChange: vi.fn(), onQualityChange: vi.fn(), onExit: vi.fn(),
}

describe('ModView mounting and saved-layout recovery', () => {
  beforeEach(() => localStorage.clear())

  it('opens the official view first and unmounts the custom player when switching back', async () => {
    render(<ModView {...props} />)
    expect(screen.getByTestId('official-modview-host')).toBeInTheDocument()
    expect(screen.queryByTestId('modview-player')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'BlinkStream', exact: true }))
    expect(await screen.findByTestId('modview-player')).toBeInTheDocument()
    expect(screen.queryByTestId('official-modview-host')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Twitch oficial' }))
    expect(screen.getByTestId('official-modview-host')).toBeInTheDocument()
    expect(screen.queryByTestId('modview-player')).not.toBeInTheDocument()
    expect(localStorage.getItem('bs.modview.surface')).toBe('official')
  })

  it('forwards playback settings in combined mode and requires opting in again on channel change', async () => {
    const view = render(<ModView {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar vídeo BlinkStream' }))
    const player = await screen.findByTestId('modview-player')
    expect(player).toHaveAttribute('data-channel', 'testchannel')
    expect(player).toHaveAttribute('data-volume', '50')
    expect(player).toHaveAttribute('data-quality', 'best')
    view.rerender(<ModView {...props} channel="otherchannel" />)
    expect(screen.queryByTestId('modview-player')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mostrar vídeo BlinkStream' })).toHaveAttribute('aria-pressed', 'false')
  })

  it.each([
    ['first launch', undefined],
    ['legacy partial layout', { preset: 'mod_focus', activeTab: 'audit' }],
    ['null tabs', { enabledTabs: null }],
    ['invalid tabs type', { enabledTabs: 'audit' }],
    ['empty tabs', { enabledTabs: [] }],
  ])('renders player, chat and tools with %s', async (_label, saved) => {
    localStorage.setItem('bs.modview.surface', 'blinkstream')
    if (saved !== undefined) localStorage.setItem('bs.modview.config.v4', JSON.stringify(saved))
    render(<ModView {...props} />)
    expect(await screen.findByTestId('modview-player')).toBeInTheDocument()
    expect(await screen.findByTestId('modview-chat')).toBeInTheDocument()
    expect(screen.getByTestId('modview-chat')).toHaveAttribute('data-moderator', 'true')
    expect(screen.getByTestId('modview-chat')).toHaveAttribute('data-broadcaster', '123')
    expect(screen.getByText('Mod View')).toBeInTheDocument()
    const persisted = JSON.parse(localStorage.getItem('bs.modview.config.v4'))
    expect(Array.isArray(persisted.enabledTabs)).toBe(true)
    expect(persisted.enabledTabs.length).toBeGreaterThan(0)
  })
})

it('passes the same account and compact presentation to the native monitor', async () => {
  localStorage.setItem('bs.modview.surface', 'blinkstream')
  render(<ModView {...props} />)
  const monitor = await screen.findByTestId('modview-player')
  expect(monitor).toHaveAttribute('data-user', 'viewer')
  expect(monitor).toHaveAttribute('data-owner', '123')
  expect(monitor).toHaveAttribute('data-compact', 'true')
})

it('preserves the native video DOM across tool navigation and resizing', async () => {
  localStorage.setItem('bs.modview.surface', 'blinkstream')
  render(<ModView {...props} />)
  const monitor = await screen.findByTestId('modview-player')
  fireEvent.click(screen.getByRole('button', { name: 'Cola de AutoMod', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Acciones del moderador', exact: true }))
  fireEvent.change(screen.getByRole('slider', { name: 'Ancho de herramientas' }), { target: { value: '1.4' } })
  fireEvent.click(screen.getByRole('button', { name: 'Comunidad', exact: true }))
  expect(screen.getByTestId('modview-player')).toBe(monitor)
  expect(JSON.parse(localStorage.getItem('bs.modview.config.v4')).workWeight).toBe(1.4)
})

it('resets the native workspace when account or channel changes', async () => {
  localStorage.setItem('bs.modview.surface', 'blinkstream')
  const view = render(<ModView {...props} />)
  const first = await screen.findByTestId('modview-chat')
  view.rerender(<ModView {...props} userId="another" />)
  expect(await screen.findByTestId('modview-chat')).not.toBe(first)
  const second = screen.getByTestId('modview-chat')
  view.rerender(<ModView {...props} userId="another" channel="otherchannel" />)
  expect(await screen.findByTestId('modview-chat')).not.toBe(second)
})

vi.mock('../../utils/twitch', async importOriginal => ({ ...await importOriginal(), getUserIdByLogin: vi.fn(async () => null) }))
it('native fallback associates IDs with their channel and cancels late A/B lookups', async () => {
  localStorage.setItem('bs.modview.surface', 'blinkstream')
  const requests = []
  getUserIdByLogin.mockImplementation(channel => new Promise(resolve => requests.push({ channel, resolve })))
  const view = render(<ModView {...props} broadcasterId={null} />)
  expect(await screen.findByTestId('modview-player')).not.toHaveAttribute('data-owner')
  const firstA = requests.at(-1)
  view.rerender(<ModView {...props} broadcasterId={null} channel="bravo" />)
  const firstB = requests.at(-1)
  await act(async () => firstA.resolve('101'))
  expect(screen.getByTestId('modview-player')).not.toHaveAttribute('data-owner')
  await act(async () => firstB.resolve('202'))
  expect(screen.getByTestId('modview-player')).toHaveAttribute('data-owner', '202')
  view.rerender(<ModView {...props} broadcasterId={null} />)
  const secondA = requests.at(-1)
  expect(screen.getByTestId('modview-player')).not.toHaveAttribute('data-owner')
  view.rerender(<ModView {...props} broadcasterId="202" channel="bravo" />)
  await act(async () => secondA.resolve('101'))
  expect(screen.getByTestId('modview-player')).toHaveAttribute('data-owner', '202')
  expect(screen.getByRole('button', { name: 'BlinkStream', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('slider', { name: 'Ancho de herramientas' })).toBeInTheDocument()
})

const feeds = vi.hoisted(() => ({ public: { state: 'connected', possibleGap: false, redemptions: [], predictions: [], polls: [] }, live: { status: 'connected', topics: {}, scopes: [], held: [], suspicious: [], audit: [], activity: [], activityPossibleGap: false } }))
vi.mock('../../hooks/useChannelActivity', () => ({ useChannelActivity: () => feeds.public }))
vi.mock('../../hooks/useModerationSession', () => ({ useModerationSession: () => ({ state: feeds.live, removeHeld: vi.fn() }) }))
beforeEach(() => { feeds.public.possibleGap = false; feeds.live.activityPossibleGap = false })
it.each(['public', 'live'])('integrates %s continuity warning in native Activity without remounting video', async source => {
  localStorage.setItem('bs.modview.surface', 'blinkstream')
  const view = render(<ModView {...props} />)
  const player = await screen.findByTestId('modview-player')
  fireEvent.click(screen.getByRole('button', { name: t('mod.native.activity'), exact: true }))
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
  if (source === 'public') feeds.public.possibleGap = true
  else feeds.live.activityPossibleGap = true
  view.rerender(<ModView {...props} />)
  expect(screen.getByRole('status')).toHaveTextContent(t('channel.activity.possibleGap'))
  fireEvent.click(screen.getByRole('button', { name: t('mod.native.predictions'), exact: true }))
  if (source === 'public') expect(screen.getByRole('status')).toHaveTextContent(t('channel.activity.possibleGap'))
  else expect(screen.getByRole('status')).toBeEmptyDOMElement()
  expect(screen.getByTestId('modview-player')).toBe(player)
})


it('feeds Activity only confirmed workspace EventSub moderation and ignores unknown topics without remounting video', async () => {
  localStorage.setItem('bs.modview.surface', 'blinkstream')
  feeds.localAudit = [{ id: 'local-audit', source: 'local', success: true, action: 'ban', targetName: 'local-only', timestamp: 1 }]
  feeds.live.audit = [
    { id: 'confirmed', source: 'eventsub', success: true, action: 'ban', moderator: 'actor', targetName: 'real-target', target: '99', timestamp: 2 },
    { id: 'failed', source: 'eventsub', success: false, action: 'ban', targetName: 'failed-target', timestamp: 3 },
  ]
  feeds.live.activity = [
    { id: 'unknown', type: 'channel.unknown', timestamp: 2, event: { user_name: 'unknown-user' } },
    { id: 'follow', type: 'channel.follow', timestamp: 1, event: { user_name: 'follow-user', user_login: 'follow_login', user_id: '55' } },
  ]
  try {
    render(<ModView {...props} />)
    const player = await screen.findByTestId('modview-player')
    fireEvent.click(screen.getByRole('button', { name: t('mod.native.activity'), exact: true }))
    expect(screen.getByRole('button', { name: 'Filas disponibles (2)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: t('activity.moderation'), exact: true }))
    expect(screen.getByText('actor · ban · real-target')).toBeInTheDocument()
    expect(screen.queryByText(/local-only|failed-target|unknown-user/)).not.toBeInTheDocument()
    expect(screen.getByTestId('modview-player')).toBe(player)
    fireEvent.click(screen.getByRole('button', { name: t('mod.native.audit'), exact: true }))
    expect(screen.getByText(/local-only/)).toBeInTheDocument()
    expect(screen.getByTestId('modview-player')).toBe(player)
  } finally {
    feeds.localAudit = []
    feeds.live.audit = []
    feeds.live.activity = []
  }
})
