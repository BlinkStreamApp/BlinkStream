import { beforeEach, expect, it, vi } from 'vitest'
import { moderationHelix } from './twitch'
import { moderationOperation } from './moderationApi'
vi.mock('./twitch', () => ({ moderationHelix: vi.fn(async () => ({ success: true, value: null })) }))
const ids = { channel: '123', moderator: '456' }
beforeEach(() => vi.clearAllMocks())
it('activates real Shield Mode with the explicit session token', async () => {
  await moderationOperation('shield', { ...ids, value: true }, 'primary')
  expect(moderationHelix).toHaveBeenCalledWith(expect.stringContaining('/moderation/shield_mode?'), expect.objectContaining({ method: 'PUT', token: 'primary', body: '{"is_active":true}' }), expect.any(Object))
})
it.each([['unknown', ids], ['constructor', ids], ['shield', { ...ids, value: 'false' }], ['warn', { ...ids, target: '7', text: '' }], ['warn', { ...ids, target: 'x', text: 'reason' }], ['updateAutomod', { ...ids, value: 5 }], ['pin', { ...ids, id: undefined }], ['suspicious', { ...ids, target: '7', value: 'invented' }]])('rejects malformed %s before network access', async (kind, args) => {
  expect((await moderationOperation(kind, args, 'primary')).success).toBe(false)
  expect(moderationHelix).not.toHaveBeenCalled()
})
it('unpins the selected message and never accepts a custom endpoint', async () => {
  await moderationOperation('unpin', { ...ids, id: 'abc-123' }, 'primary')
  const [url, opts] = moderationHelix.mock.calls[0]
  expect(new URL(url).searchParams.get('message_id')).toBe('abc-123')
  expect(opts.method).toBe('DELETE')
})
