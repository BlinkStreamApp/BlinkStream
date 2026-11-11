import { afterEach, describe, expect, it, vi } from 'vitest'
import { acquireModerationSession, applyModerationEvent, initialModerationState } from './moderationSession'
import { startRewardEventSub } from './twitchEventSub'

vi.mock('./twitchEventSub', () => ({ startRewardEventSub: vi.fn(() => vi.fn()) }))
const releases = []
const acquire = options => { const s = acquireModerationSession({ broadcasterId: '10', userId: '20', token: 'primary', ...options }); releases.push(s.release); return s }
afterEach(() => { releases.splice(0).forEach(f => f()); vi.clearAllMocks() })
const frame = (type, event, id = 'event') => ({ type, event, id, timestamp: '2026-11-05T20:00:00Z' })

describe('account/channel moderation session', () => {
  it('shares one transport until its last consumer exits, with idempotent cleanup', () => {
    const a = acquire(), b = acquire()
    expect(startRewardEventSub).toHaveBeenCalledOnce()
    const stop = startRewardEventSub.mock.results[0].value
    a.release(); a.release()
    expect(stop).not.toHaveBeenCalled()
    b.release()
    expect(stop).toHaveBeenCalledOnce()
  })
  it('rejects stale responses after token replacement and isolates channel state', () => {
    const a = acquire()
    const old = startRewardEventSub.mock.calls[0][0]
    const b = acquire({ token: 'renewed' })
    old.moderation.onEvent(frame('automod.message.hold', { message_id: 'late', user_id: '1' }))
    expect(b.snapshot().held).toEqual([])
    const c = acquire({ broadcasterId: '30' })
    startRewardEventSub.mock.calls[1][0].moderation.onEvent(frame('automod.message.hold', { message_id: 'new', user_id: '1', message: { text: 'held' } }))
    expect(b.snapshot().held[0].message).toBe('held')
    expect(a.snapshot().held).toEqual([])
    expect(c.snapshot().held).toEqual([])
  })
  it('keeps per-topic denials and drops stale connection claims on reconnect', () => {
    const s = acquire(), options = startRewardEventSub.mock.calls[0][0]
    options.moderation.onIdentity({ scopes: ['moderator:manage:automod'] })
    options.moderation.onTopics([{ type: 'automod.message.hold', status: 202 }, { type: 'channel.moderate', status: 403 }])
    expect(s.snapshot().topics['channel.moderate']).toBe(403)
    options.onStatus({ state: 'reconnecting' })
    expect(s.snapshot().topics).toEqual({})
  })
  it('resolves AutoMod messages from another moderator and avoids repeated held records', () => {
    let s = initialModerationState()
    const hold = frame('automod.message.hold', { message_id: 'm', user_id: '2', message: { text: 'held' } })
    s = applyModerationEvent(applyModerationEvent(s, hold), hold)
    expect(s.held).toHaveLength(1)
    s = applyModerationEvent(s, frame('automod.message.update', { message_id: 'm', status: 'Approved' }))
    expect(s.held).toEqual([])
  })
  it('refreshes chat modes only after a mode action, never after messages/activity', () => {
    const s = applyModerationEvent(initialModerationState(), frame('channel.follow', { user_id: '4' }))
    expect(s.modesRevision).toBe(0)
    const next = applyModerationEvent(s, frame('channel.moderate', { action: 'slow', moderator_user_name: 'OtherMod', slow: { wait_time_seconds: 10 } }))
    expect(next.modesRevision).toBe(1)
    expect(next.audit[0].moderator).toBe('OtherMod')
  })
  it('clears suspicious treatment remotely and bounds activity memory', () => {
    let s = applyModerationEvent(initialModerationState(), frame('channel.suspicious_user.message', { user_id: '7', low_trust_status: 'restricted', message: { text: 'text' } }))
    s = applyModerationEvent(s, frame('channel.suspicious_user.update', { user_id: '7', low_trust_status: 'none' }))
    expect(s.suspicious).toEqual([])
    for (let n = 0; n < 210; n++) s = applyModerationEvent(s, frame('channel.follow', {}, String(n)))
    expect(s.activity).toHaveLength(200)
    expect(s.activity[0].id).toBe('10')
  })
})

it.each(['channel.follow', 'channel.subscribe', 'channel.subscription.gift', 'channel.cheer', 'channel.raid'])('warns only after a confirmed Activity %s is interrupted, preserving rows', type => {
  const s = acquire(), options = startRewardEventSub.mock.calls[0][0]
  options.onStatus({ state: 'reconnecting' })
  expect(s.snapshot().activityPossibleGap).toBe(false)
  options.moderation.onTopics([{ type, status: 202 }])
  options.onStatus({ state: 'connected' })
  options.moderation.onEvent(frame(type, { user_id: '4' }))
  options.onStatus({ state: 'connected' }) // Successful overlap/handoff stays connected.
  expect(s.snapshot().activityPossibleGap).toBe(false)
  options.onStatus({ state: 'reconnecting' })
  expect(s.snapshot().activityPossibleGap).toBe(true)
  options.onStatus({ state: 'connecting' })
  options.moderation.onTopics([{ type, status: 403 }])
  options.onStatus({ state: 'connected' })
  options.moderation.onEvent(frame(type, { user_id: '5' }, 'new'))
  expect(s.snapshot().activity).toHaveLength(2)
  expect(s.snapshot().activityPossibleGap).toBe(true)
  expect(acquire({ broadcasterId: '30' }).snapshot().activityPossibleGap).toBe(false)
})
it('does not warn for unavailable Activity or confirmed non-Activity subscriptions', () => {
  const s = acquire(), options = startRewardEventSub.mock.calls[0][0]
  options.moderation.onTopics([{ type: 'channel.follow', status: 403 }, { type: 'automod.message.hold', status: 202 }])
  options.onStatus({ state: 'connected' })
  options.onStatus({ state: 'reconnecting' })
  expect(s.snapshot().activityPossibleGap).toBe(false)
})
it('ignores old topic/status callbacks after replacement and final release', () => {
  const old = acquire(), options = startRewardEventSub.mock.calls[0][0]
  const current = acquire({ token: 'new' })
  options.moderation.onTopics([{ type: 'channel.follow', status: 202 }])
  options.onStatus({ state: 'reconnecting' })
  expect(current.snapshot().activityPossibleGap).toBe(false)
  expect(old.snapshot().activityPossibleGap).toBe(false)
})

it('does not mark a later reconnect after all Activity topics were revoked', () => {
  const s = acquire(), options = startRewardEventSub.mock.calls[0][0]
  options.moderation.onTopics([{ type: 'channel.follow', status: 202 }, { type: 'automod.message.hold', status: 202 }])
  options.onStatus({ state: 'connected' })
  options.moderation.onTopics([{ type: 'channel.follow', status: 403 }])
  options.onStatus({ state: 'reconnecting' })
  expect(s.snapshot().activityPossibleGap).toBe(false)
})
it('retains audit and marks a gap when only confirmed channel.moderate is interrupted', () => {
  const s = acquire(), options = startRewardEventSub.mock.calls[0][0]
  options.moderation.onTopics([{ type: 'channel.moderate', status: 202 }])
  options.moderation.onEvent(frame('channel.moderate', { action: 'ban', ban: { user_id: '42', user_login: 'target' } }))
  options.onStatus({ state: 'connected' })
  expect(s.snapshot().activityPossibleGap).toBe(false)
  options.onStatus({ state: 'reconnecting' })
  expect(s.snapshot().activityPossibleGap).toBe(true)
  options.onStatus({ state: 'connected' })
  expect(s.snapshot().activityPossibleGap).toBe(true)
  expect(s.snapshot().audit).toHaveLength(1)
  expect(s.snapshot().audit[0].targetLogin).toBe('target')
})
