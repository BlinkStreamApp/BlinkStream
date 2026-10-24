import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ModView from './ModView'

vi.mock('../../hooks/useModeration', () => ({ useModeration: () => ({ auditLog: [], remainingActions: 20 }) }))
vi.mock('../../hooks/useChannelRole', () => ({ useChannelRole: () => ({ isBroadcaster: false, isModerator: true }) }))
vi.mock('../../hooks/useManageRewards', () => ({ useManageRewards: () => ({ pendingRedemptions: [], fulfilledRedemptions: [] }) }))
vi.mock('../VideoPlayer', () => ({ default: () => <div data-testid="modview-player" /> }))
vi.mock('../Chat', () => ({ default: ({ isModerator, broadcasterId }) => <div data-testid="modview-chat" data-moderator={isModerator} data-broadcaster={broadcasterId} /> }))

const props = {
  channel: 'testchannel', broadcasterId: '123', userId: '456',
  isLoggedIn: true, twitchUsername: 'viewer', volume: 50, quality: 'best',
  onVolumeChange: vi.fn(), onQualityChange: vi.fn(), onExit: vi.fn(),
}

describe('ModView mounting and saved-layout recovery', () => {
  beforeEach(() => localStorage.clear())

  it.each([
    ['first launch', undefined],
    ['legacy partial layout', { preset: 'mod_focus', activeTab: 'audit' }],
    ['null tabs', { enabledTabs: null }],
    ['invalid tabs type', { enabledTabs: 'audit' }],
    ['empty tabs', { enabledTabs: [] }],
  ])('renders player, chat and tools with %s', async (_label, saved) => {
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
