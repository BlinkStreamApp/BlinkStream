import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateRedemptionStatus } from './twitch'
import { measureFetch } from './perf'
import { ErrorCode } from './errors'

vi.mock('./perf', () => ({ measureFetch: vi.fn() }))
vi.mock('./tauriEnv', () => ({ isTauri: () => false }))
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('blinkstream_oauth_client_id', 'test-client')
  measureFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [{ id: 'reward-1' }] }) })
})

describe('Twitch redemption mutation contract', () => {
  it('keeps rewards created outside this app unchanged', async () => {
    measureFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })
    const result = await updateRedemptionStatus('123', 'external', ['rd-1'], 'FULFILLED', 'user-token')
    expect(result.code).toBe(ErrorCode.CHANNEL_POINTS_REDEMPTION_NOT_MANAGEABLE)
    expect(measureFetch).toHaveBeenCalledTimes(1)
    expect(new URL(measureFetch.mock.calls[0][0]).searchParams.get('only_manageable_rewards')).toBe('true')
  })

  it('requires a user session without requesting an app token', async () => {
    const result = await updateRedemptionStatus('123', 'reward-1', ['rd-1'], 'FULFILLED')
    expect(result.code).toBe(ErrorCode.AUTH_FAILED)
    expect(measureFetch).not.toHaveBeenCalled()
  })

  it.each([
    [401, ErrorCode.AUTH_FAILED],
    [403, ErrorCode.CHANNEL_POINTS_REDEMPTION_FORBIDDEN],
    [404, ErrorCode.CHANNEL_POINTS_REDEMPTION_NOT_PENDING],
    [503, ErrorCode.CHANNEL_POINTS_REDEMPTION_FULFILL_FAILED],
  ])('preserves PATCH HTTP %s failure', async (httpStatus, code) => {
    measureFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 'reward-1' }] }) })
      .mockResolvedValueOnce({ ok: false, status: httpStatus })
    expect(await updateRedemptionStatus('123', 'reward-1', ['rd-1'], 'CANCELED', 'user-token'))
      .toMatchObject({ ok: false, code })
  })

  it('does not classify a temporary catalog failure as an unmanaged reward', async () => {
    measureFetch.mockRejectedValueOnce(new Error('network'))
    expect(await updateRedemptionStatus('123', 'reward-1', ['rd-1'], 'FULFILLED', 'user-token'))
      .toMatchObject({ ok: false, code: ErrorCode.CHANNEL_POINTS_REDEMPTION_FULFILL_FAILED })
    expect(measureFetch).toHaveBeenCalledTimes(1)
  })

  it('limits each mutation to 50 redemption IDs', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `rd-${index}`)
    expect((await updateRedemptionStatus('123', 'reward-1', ids, 'FULFILLED', 'user-token')).ok).toBe(true)
    const patches = measureFetch.mock.calls.filter(([, options]) => options.method === 'PATCH')
    expect(patches.map(([url]) => new URL(url).searchParams.getAll('id').length)).toEqual([50, 50, 1])
    expect(patches.flatMap(([url]) => new URL(url).searchParams.getAll('id'))).toEqual(ids)
  })

  it.each(['FULFILLED', 'CANCELED'])('sends %s in a JSON body, never as a query parameter', async status => {
    const result = await updateRedemptionStatus('123', 'reward-1', ['rd-1'], status, 'user-token')
    expect(result.ok).toBe(true)
    const [url, options] = measureFetch.mock.calls.find(([, options]) => options.method === 'PATCH')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(options.body)).toEqual({ status })
    expect(new URL(url).searchParams.has('status')).toBe(false)
  })
})
