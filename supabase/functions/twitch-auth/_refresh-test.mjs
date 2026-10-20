import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import assert from 'node:assert/strict'
import test from 'node:test'
const source = readFileSync(new URL('./_refresh.ts', import.meta.url), 'utf8')
const { readAuthBody, readRefreshBody } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)
const request = body => new Request('https://example.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
test('accepts refresh credentials in bounded POST JSON only', async () => {
  const refresh = 'test-token-not-real'.repeat(2)
  assert.equal(await readRefreshBody(request(JSON.stringify({ refresh_token: refresh }))), refresh)
  for (const body of ['{}', 'invalid', JSON.stringify({ refresh_token: 123 }), JSON.stringify({ refresh_token: 'a'.repeat(2049) }), 'x'.repeat(12289)]) assert.equal(await readRefreshBody(request(body)), null)
  assert.equal(await readRefreshBody(new Request('https://example.invalid')), null)
})
test('cancels oversized streamed bodies without Content-Length', async () => {
  let cancelled = false
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(12289)) }, cancel() { cancelled = true } })
  const req = new Request('https://example.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half' })
  assert.equal(await readRefreshBody(req), null)
  assert.equal(cancelled, true)
})
test('accepts bounded logout credentials and rejects empty logout requests', async () => {
  const twitch = 'tw'.repeat(20)
  const jwt = 'jwt'.repeat(20)
  const refresh = 'rt'.repeat(20)
  assert.deepEqual(await readAuthBody(request(JSON.stringify({
    action: 'logout',
    twitch_access_token: twitch,
    supabase_access_token: jwt,
    supabase_refresh_token: refresh,
  }))), {
    action: 'logout',
    twitchAccessToken: twitch,
    supabaseAccessToken: jwt,
    supabaseRefreshToken: refresh,
  })
  assert.equal(await readAuthBody(request(JSON.stringify({ action: 'logout' }))), null)
  assert.equal(await readAuthBody(request(JSON.stringify({ action: 'unknown', refresh_token: refresh }))), null)
})
