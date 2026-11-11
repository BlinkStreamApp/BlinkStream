import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RewardsQueuePanel } from './RewardsQueuePanel'
import { ActivityFeed } from './ActivityFeed'
import { PredictionsPollsPanel } from './PredictionsPollsPanel'
import { getPredictions, getPolls } from '../../utils/twitch'
import { t } from '../../utils/i18n'
vi.mock('../../utils/twitch', () => ({ getPredictions: vi.fn(), getPolls: vi.fn(), isValidTwitchLogin: () => true }))
const redemption = { id: 'receipt1', reward_id: 'r1', reward_title: 'Drink', user_login: 'alice', user_id: '1', cost: 100, status: 'CONFIRMED', source: 'local-confirmed', manageable: false }
it('shows a viewer receipt in channel points without offering fulfillment or claiming completion', () => {
  render(<RewardsQueuePanel canManage={false} observedRedemptions={[redemption]} feedState="connected" />)
  expect(screen.getByText('Drink')).toBeInTheDocument()
  expect(screen.getByText(t('channel.activity.confirmed'))).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Cumplir' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Completadas/ }))
  expect(screen.queryByText('Drink')).not.toBeInTheDocument()
})
it('deduplicates known redemption IDs in activity while keeping distinct textless purchases', () => {
  render(<ActivityFeed recentRedemptions={[redemption, redemption, { ...redemption, id: 'receipt2' }]} messages={[{ id: 'chat-receipt1', redemption_id: 'receipt1', user: 'alice', isReward: true }]} />)
  expect(screen.getByRole('button', { name: 'Filas disponibles (2)' })).toBeInTheDocument()
})
it('uses public prediction and poll notices for a moderator without issuing creator-only Helix queries', () => {
  render(<PredictionsPollsPanel broadcasterId="2" canManage={false} publicActivity={{ state: 'connected', predictions: [{ id: 'p', title: 'Public prediction', status: 'ACTIVE', outcomes: [] }], polls: [{ id: 'poll', title: 'Public poll', status: 'ACTIVE', choices: [] }] }} />)
  expect(screen.getByText('Public prediction')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Encuestas/ }))
  expect(screen.getByText('Public poll')).toBeInTheDocument()
  expect(getPredictions).not.toHaveBeenCalled()
  expect(getPolls).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: /Nueva/ })).toBeDisabled()
})

it('announces a persistent Activity gap outside filtering, preserving rows through reconnect', () => {
  const { rerender } = render(<ActivityFeed connectionState="connected" recentRedemptions={[redemption]} />)
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
  rerender(<ActivityFeed connectionState="reconnecting" possibleGap recentRedemptions={[redemption]} />)
  const warning = screen.getByRole('status')
  expect(warning).toHaveAttribute('aria-live', 'polite')
  expect(warning).toHaveTextContent(t('channel.activity.possibleGap'))
  fireEvent.click(screen.getByRole('button', { name: /Bits/ }))
  expect(warning).toHaveTextContent(t('channel.activity.possibleGap'))
  rerender(<ActivityFeed connectionState="connected" possibleGap recentRedemptions={[redemption]} />)
  expect(screen.getByRole('status')).toBe(warning)
  fireEvent.click(screen.getByRole('button', { name: /Filas disponibles/ }))
  expect(screen.getByText(/ha canjeado Drink/)).toBeInTheDocument()
})
it('keeps the same public gap warning on both polls and predictions tabs', () => {
  render(<PredictionsPollsPanel broadcasterId="2" canManage={false} publicActivity={{ state: 'reconnecting', possibleGap: true, predictions: [], polls: [] }} />)
  const warning = screen.getByRole('status')
  expect(warning).toHaveTextContent(t('channel.activity.possibleGap'))
  fireEvent.click(screen.getByRole('button', { name: /Encuestas/ }))
  expect(screen.getByRole('status')).toBe(warning)
  expect(getPredictions).not.toHaveBeenCalled()
})
it('does not attribute public transport gaps to independent creator Helix reads', async () => {
  getPredictions.mockResolvedValue([]); getPolls.mockResolvedValue([])
  render(<PredictionsPollsPanel broadcasterId="2" canManage publicActivity={{ possibleGap: true }} />)
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
})


it('searches observed names, IDs, titles, text and reasons without case or accents, combined with filters', () => {
  const inspect = vi.fn()
  render(<ActivityFeed onInspectUser={inspect} recentRedemptions={[{ ...redemption, user_name: 'ÁLICE', reward_title: 'Café', user_input: 'Canción' }]} moderationEvents={[{ id: 'audit1', source: 'eventsub', success: true, moderator: 'José', action: 'ban', targetName: 'Display Target', targetLogin: 'target', target: '42', reason: 'Insúltos' }]} />)
  const search = screen.getByRole('searchbox', { name: t('activity.search') })
  search.focus()
  expect(search).toHaveFocus()
  const moderationFilter = screen.getByRole('button', { name: t('activity.moderation'), exact: true })
  moderationFilter.focus()
  expect(moderationFilter).toHaveFocus()
  expect(moderationFilter).toHaveAttribute('type', 'button')
  for (const query of ['alice', 'CAFE', 'cancion', '1']) {
    fireEvent.change(search, { target: { value: query } })
    expect(screen.getByText(/ha canjeado Café/)).toBeInTheDocument()
  }
  fireEvent.change(search, { target: { value: 'JOSE' } })
  expect(screen.getByText(/José · ban/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Bits/ }))
  expect(screen.getByText(t('activity.noMatches'))).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Bits/ })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: t('activity.moderation'), exact: true }))
  for (const query of ['display target', '42', 'insultos']) {
    fireEvent.change(search, { target: { value: query } })
    expect(screen.getByText(/José · ban/)).toBeInTheDocument()
  }
  fireEvent.click(screen.getByRole('button', { name: '@Display Target' }))
  expect(inspect).toHaveBeenCalledWith({ username: 'target', userId: '42' })
  expect(screen.getByText(t('activity.moderationHelp'))).toBeInTheDocument()
})

it('deduplicates only reliable IDs and keeps source, type, anonymous events and catalog rewards distinct', () => {
  const bits = { id: 'same', message_id: '12345678-1234-1234-1234-123456789abc', eventType: 'bits', user: 'alice', message: 'equal', timestamp: 1 }
  const anonymous = { ...bits, id: undefined, message_id: undefined }
  render(<ActivityFeed recentRedemptions={[{ ...redemption, id: undefined }, { ...redemption, id: undefined }]} messages={[
    bits, bits, { ...bits, source: 'eventsub' }, { ...bits, eventType: 'raid' }, anonymous, anonymous,
    { id: 'reward1', isReward: true, custom_reward_id: 'catalog', timestamp: 1 },
    { id: 'reward2', isReward: true, custom_reward_id: 'catalog', timestamp: 1 },
  ]} />)
  expect(screen.getByRole('button', { name: 'Filas disponibles (9)' })).toBeInTheDocument()
})

it('excludes failed and local moderation, disables inspection without a real target and distinguishes empty states', () => {
  const view = render(<ActivityFeed />)
  expect(screen.getByText(t('activity.empty'))).toBeInTheDocument()
  view.rerender(<ActivityFeed moderationEvents={[
    { id: 'local', source: 'local', success: true, action: 'local action' },
    { id: 'failed', source: 'eventsub', success: false, action: 'failed action' },
    { id: 'ok', source: 'eventsub', success: true, action: 'clear' },
  ]} />)
  expect(screen.getByRole('button', { name: 'Filas disponibles (1)' })).toBeInTheDocument()
  expect(screen.queryByText('local action')).not.toBeInTheDocument()
  expect(screen.queryByText('failed action')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '@' })).not.toBeInTheDocument()
})
import { applyModerationEvent, initialModerationState } from '../../utils/moderationSession'
it('uses IRC UUIDs rather than local counters and preserves identified row focus on insertion', () => {
  const uuid = '12345678-1234-1234-1234-123456789abc'
  const bits = { id: 1, message_id: uuid, eventType: 'bits', user: 'alice', timestamp: 1 }
  const messages = [bits, { ...bits, id: 2 }, { ...bits, source: 'eventsub', id: uuid },
    { ...bits, message_id: 'highlighted-message', id: 3 }, { ...bits, message_id: 'highlighted-message', id: 4 },
    { ...bits, message_id: undefined, id: 'arbitrary' }, { ...bits, message_id: undefined, id: 'arbitrary' }]
  const view = render(<ActivityFeed messages={messages} />)
  expect(screen.getByRole('button', { name: 'Filas disponibles (6)' })).toBeInTheDocument()
  const button = screen.getAllByRole('button', { name: '@alice' })[0]
  button.focus()
  view.rerender(<ActivityFeed messages={[{ ...bits, message_id: 'abcdefab-1234-1234-1234-123456789abc', user: 'bob' }, ...messages]} />)
  expect(button).toHaveFocus()
  expect(screen.getAllByRole('button', { name: '@alice' })[0]).toBe(button)
})
it('inspects the confirmed target login produced by moderation and offers no button without login', () => {
  const state = applyModerationEvent(initialModerationState(), { type: 'channel.moderate', id: 'mod', event: {
    action: 'ban', moderator_user_login: 'actor', ban: { user_id: '42', user_login: 'target_login', user_name: 'Target' },
  } })
  const inspect = vi.fn()
  const view = render(<ActivityFeed moderationEvents={state.audit} onInspectUser={inspect} />)
  fireEvent.click(screen.getByRole('button', { name: '@Target' }))
  expect(inspect).toHaveBeenCalledWith({ username: 'target_login', userId: '42' })
  view.rerender(<ActivityFeed moderationEvents={[{ ...state.audit[0], targetLogin: undefined }]} />)
  expect(screen.queryByRole('button', { name: '@Target' })).not.toBeInTheDocument()
  expect(screen.getByText('@Target')).toBeInTheDocument()
})

it('deduplicates real Chat UUID identity but never IRC fallback or arbitrary IDs', () => {
  const base = { eventType: 'bits', user: 'alice', message_id: '12345678-1234-1234-1234-123456789abc' }
  const view = render(<ActivityFeed messages={[{ ...base, id: 1 }, { ...base, id: 2 }]} />)
  expect(screen.getByRole('button', { name: 'Filas disponibles (1)' })).toBeInTheDocument()
  view.rerender(<ActivityFeed messages={[{ ...base, id: 1, message_id: 'highlighted-message' }, { ...base, id: 2, message_id: 'highlighted-message' }]} />)
  expect(screen.getByRole('button', { name: 'Filas disponibles (2)' })).toBeInTheDocument()
  view.rerender(<ActivityFeed messages={[{ ...base, id: 'arbitrary', message_id: undefined }, { ...base, id: 'arbitrary', message_id: undefined }]} />)
  expect(screen.getByRole('button', { name: 'Filas disponibles (2)' })).toBeInTheDocument()
})
it('describes queried redemptions separately from live notices', () => {
  render(<ActivityFeed connectionState="connected" recentRedemptions={[redemption]} />)
  expect(screen.getByText(/Avisos en directo desde la conexión y canjes consultados/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Filas disponibles (1)' })).toBeInTheDocument()
})
