import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { startRewardEventSub } from './twitchEventSub'
import { measureFetch } from './perf'
import { getStoredToken } from './twitch'

vi.mock('./perf', () => ({ measureFetch: vi.fn() }))
vi.mock('./twitch', () => ({ getStoredToken: vi.fn() }))
const ADD = 'channel.channel_points_custom_reward_redemption.add'
const UPDATE = 'channel.channel_points_custom_reward_redemption.update'
let sockets, cleanups
class MockSocket {
  constructor(url) { this.url = url; this.close = vi.fn(); sockets.push(this) }
  async message(type, payload = {}, id = type) {
    await this.onmessage?.({ data: JSON.stringify({ metadata: { message_type: type, message_id: id }, payload }) })
  }
  welcome(id = 'session-1') {
    return this.message('session_welcome', { session: { id, keepalive_timeout_seconds: 10 } })
  }
  notification(type = ADD, event = {}, id = 'event-1') {
    return this.message('notification', { subscription: { type }, event: {
      id: 'rd-1', broadcaster_user_id: '123', user_name: 'Alice',
      reward: { id: 'reward-1', title: 'Agua', cost: 100 },
      status: 'unfulfilled', redeemed_at: '2026-09-29T10:00:00Z', ...event,
    } }, id)
  }
}
const response = (status = 202, data = {}) => ({ ok: status < 400, status, json: async () => data })
const identity = (overrides = {}) => response(200, {
  user_id: '123', client_id: 'own-client', scopes: ['channel:read:redemptions'], ...overrides,
})
async function start(options = {}) {
  const onRedemption = vi.fn(), onStatus = vi.fn()
  const stop = startRewardEventSub({ broadcasterId: '123', token: 'oauth:test-token', onRedemption, onStatus, ...options })
  cleanups.push(stop)
  await vi.advanceTimersByTimeAsync(0)
  return { stop, onRedemption, onStatus }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  sockets = []; cleanups = []
  vi.stubGlobal('WebSocket', MockSocket)
  getStoredToken.mockResolvedValue('stored-token')
  measureFetch.mockImplementation(async url => url.includes('/validate') ? identity() : response())
})
afterEach(() => {
  cleanups.forEach(stop => stop())
  vi.useRealTimers(); vi.unstubAllGlobals()
})
describe('reward EventSub lifecycle', () => {
  it('subscribes only after welcome with the client ID belonging to the token', async () => {
    const { onStatus } = await start()
    expect(measureFetch).toHaveBeenCalledTimes(1)
    expect(sockets[0].url).toBe('wss://eventsub.wss.twitch.tv/ws')
    await sockets[0].welcome()
    const requests = measureFetch.mock.calls.slice(1)
    expect(requests.map(([, opts]) => JSON.parse(opts.body).type)).toEqual([ADD, UPDATE])
    expect(JSON.parse(requests[0][1].body)).toMatchObject({
      condition: { broadcaster_user_id: '123' }, transport: { method: 'websocket', session_id: 'session-1' },
    })
    expect(requests[0][1].headers).toMatchObject({ Authorization: 'Bearer test-token', 'Client-ID': 'own-client' })
    expect(onStatus).toHaveBeenLastCalledWith({ state: 'connected', message: '' })
  })
  it('retrieves a protected token when no token is provided', async () => {
    await start({ token: null })
    expect(getStoredToken).toHaveBeenCalledOnce()
    expect(measureFetch.mock.calls[0][1].headers.Authorization).toBe('OAuth stored-token')
  })
  it.each([{ user_id: '999' }, { scopes: ['chat:read'] }])('rejects unauthorized identity %j', async overrides => {
    measureFetch.mockResolvedValue(identity(overrides))
    const { onStatus } = await start()
    expect(sockets).toHaveLength(0)
    expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'unavailable' }))
    expect(vi.getTimerCount()).toBe(0)
  })
  it('delivers textless rewards once and normalizes updates without accepting another channel', async () => {
    const { onRedemption } = await start()
    await sockets[0].welcome()
    await sockets[0].notification()
    await sockets[0].notification()
    await sockets[0].notification(UPDATE, { status: 'fulfilled' }, 'update-1')
    await sockets[0].notification(ADD, { broadcaster_user_id: '999' }, 'wrong-channel')
    expect(onRedemption).toHaveBeenCalledTimes(2)
    expect(onRedemption.mock.calls[0]).toEqual([expect.objectContaining({
      id: 'rd-1', reward_id: 'reward-1', status: 'UNFULFILLED', cost: 100,
    }), true])
    expect(onRedemption.mock.calls[1][0].status).toBe('FULFILLED')
    expect(onRedemption.mock.calls[1][1]).toBe(false)
  })
  it('keeps the old socket until handoff welcome and does not resubscribe', async () => {
    await start()
    const old = sockets[0]
    await old.welcome()
    await old.message('session_reconnect', { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?reconnect=abc' } })
    expect(sockets).toHaveLength(2)
    expect(old.close).not.toHaveBeenCalled()
    await sockets[1].welcome('session-2')
    expect(old.close).toHaveBeenCalledOnce()
    expect(measureFetch).toHaveBeenCalledTimes(3)
  })
  it('reconnects and resubscribes when keepalive expires', async () => {
    await start()
    await sockets[0].welcome()
    await vi.advanceTimersByTimeAsync(12000)
    await sockets[1].welcome('session-2')
    expect(sockets[0].close).toHaveBeenCalledOnce()
    expect(measureFetch).toHaveBeenCalledTimes(6)
  })
  it('refreshes the watchdog on keepalive', async () => {
    await start()
    await sockets[0].welcome()
    await vi.advanceTimersByTimeAsync(9000)
    await sockets[0].message('session_keepalive')
    await vi.advanceTimersByTimeAsync(9000)
    expect(sockets[0].close).not.toHaveBeenCalled()
  })
  it('does not retry forever after authorization rejection', async () => {
    measureFetch.mockImplementation(async url => url.includes('/validate') ? identity() : response(403))
    const { onStatus } = await start()
    await sockets[0].welcome()
    await vi.advanceTimersByTimeAsync(60000)
    expect(sockets).toHaveLength(1)
    expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'unavailable' }))
  })
  it('aborts validation on cleanup and cannot create a late socket', async () => {
    let resolveValidation
    measureFetch.mockImplementation(() => new Promise(resolve => { resolveValidation = resolve }))
    const { stop } = await start()
    const signal = measureFetch.mock.calls[0][1].signal
    stop()
    expect(signal.aborted).toBe(true)
    resolveValidation(identity())
    await vi.advanceTimersByTimeAsync(0)
    expect(sockets).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('rejects reconnect URLs outside Twitch', async () => {
    await start()
    await sockets[0].welcome()
    await sockets[0].message('session_reconnect', { session: { reconnect_url: 'wss://example.com/ws' } })
    expect(sockets).toHaveLength(1)
    expect(sockets[0].close).toHaveBeenCalledOnce()
  })
  it('stops on revocation and cancels all timers', async () => {
    const { onStatus } = await start()
    await sockets[0].welcome()
    await sockets[0].message('revocation', { subscription: { status: 'authorization_revoked' } })
    expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'unavailable' }))
    await vi.advanceTimersByTimeAsync(60000)
    expect(vi.getTimerCount()).toBe(0)
  })
})
