import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import assert from 'node:assert/strict'
import test from 'node:test'

const moduleUrl = name => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(
  readFileSync(new URL(name, import.meta.url), 'utf8'),
)).toString('base64')}`
let source = stripTypeScriptTypes(readFileSync(new URL('./index.ts', import.meta.url), 'utf8'))
source = source.replace(/import \{ createClient \} from "npm:[^"]+";/, 'const createClient = globalThis.__oauthTest.createClient;')
for (const name of ['_security.ts', '_refresh.ts', '_twitch_identity.ts']) {
  source = source.replaceAll(`"./${name}"`, JSON.stringify(moduleUrl(`./${name}`)))
}

let state
let handler
const originalFetch = globalThis.fetch
const originalDeno = globalThis.Deno
const env = { TWITCH_CLIENT_ID: 'own-client', TWITCH_CLIENT_SECRET: 'test-secret', SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-service' }
globalThis.Deno = { env: { get: key => env[key] }, serve: callback => { handler = callback } }
globalThis.__oauthTest = { createClient() {
  const client = { sessionOperations: 0 }
  state.clients.push(client)
  client.rpc = async (name, args) => ({ data: name === 'get_user_id_by_twitch_id'
    ? state.users.find(u => u.app_metadata?.twitch_user_id === args.target_twitch_user_id)?.id
    : state.users.find(u => u.email === args.target_email)?.id })
  client.auth = {
    admin: {
      getUserById: async id => ({ data: { user: state.users.find(u => u.id === id) } }),
      updateUserById: async (id, values) => { Object.assign(state.users.find(u => u.id === id), values); return { data: {} } },
      createUser: async values => { const user = { id: `user-${state.users.length}`, ...values }; state.users.push(user); return { data: { user } } },
      signOut: async () => ({ error: null }),
    },
    getUser: async jwt => ({ data: { user: jwt === 'previous-session' ? state.users.find(u => u.id === 'legacy-user') : null } }),
    signInWithPassword: async ({ email }) => {
      client.sessionOperations++
      return { data: { user: state.users.find(u => u.email === email), session: { access_token: 'session-jwt', refresh_token: 'session-refresh', expires_in: 3600 } } }
    },
    refreshSession: async () => { client.sessionOperations++; return { data: { user: { id: 'refresh-user' }, session: { access_token: 'session-jwt', refresh_token: 'session-refresh' } } } },
  }
  client.from = () => {
    let mode
    const filters = []
    const query = {
      delete() { mode = 'delete'; return query },
      eq(key, value) { filters.push(row => row[key] === value); return query },
      gt(key, value) { filters.push(row => row[key] > value); return query },
      lte(key, value) { filters.push(row => row[key] <= value); return query },
      select() { return query },
      async upsert(row) { state.rows.push(row); return { error: null } },
      then(resolve) {
        const matches = state.rows.filter(row => filters.every(filter => filter(row)))
        if (mode === 'delete') state.rows = state.rows.filter(row => !matches.includes(row))
        return Promise.resolve({ data: matches, error: null }).then(resolve)
      },
    }
    return query
  }
  return client
} }
state = { clients: [], users: [], rows: [] }
await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const adminClient = state.clients[0]
const uuid = '550e8400-e29b-41d4-a716-446655440000'
const request = (query, options = {}) => new Request(`https://example.invalid?${query}`, options)
const freshRow = () => ({ request_id: uuid, access_token: 'twitch-access', username: 'alice', twitch_user_id: '123', expires_at: new Date(Date.now() + 60_000).toISOString() })
const reset = () => { state.users = []; state.rows = []; state.clients = [adminClient]; adminClient.sessionOperations = 0 }

test('callback fails closed when Twitch validation cannot prove identity', async () => {
  reset()
  globalThis.fetch = async url => new Response(JSON.stringify(url.includes('/token') ? { access_token: 'twitch-access' } : {}), { status: url.includes('/token') ? 200 : 503 })
  const response = await handler(request(`code=fake-code&state=${uuid}`))
  assert.equal(response.status, 303)
  assert.equal(new URL(response.headers.get('location')).searchParams.get('status'), 'error')
  assert.equal(state.rows.length, 0)
})

test('expired handoff is deleted without returning bearer credentials', async () => {
  reset()
  state.rows = [{ ...freshRow(), expires_at: new Date(Date.now() - 1000).toISOString() }]
  const response = await handler(request(`fetch=${uuid}`))
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { found: false })
  assert.equal(state.rows.length, 0)
})

test('single-use login uses immutable identity and an isolated session client', async () => {
  reset()
  state.rows = [freshRow()]
  const response = await handler(request(`fetch=${uuid}`))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).supabase_jwt, 'session-jwt')
  assert.equal(state.users[0].email, 'twitch-123@blinkstream.local')
  assert.equal(state.users[0].app_metadata.twitch_user_id, '123')
  assert.equal(adminClient.sessionOperations, 0)
  assert.equal(state.clients[1].sessionOperations, 1)
  assert.equal((await handler(request(`fetch=${uuid}`))).status, 404)
})

test('matching mutable login never claims an old account without session continuity', async () => {
  reset()
  state.users = [{ id: 'legacy-user', email: 'twitch-alice@blinkstream.local', app_metadata: {} }]
  state.rows = [freshRow()]
  const response = await handler(request(`fetch=${uuid}`))
  assert.equal((await response.json()).supabase_user_id, 'user-1')
  assert.deepEqual(state.users[0].app_metadata, {})
})

test('previous authenticated session links the same legacy owner while retaining its user id', async () => {
  reset()
  state.users = [{ id: 'legacy-user', email: 'twitch-alice@blinkstream.local', app_metadata: {} }]
  state.rows = [freshRow()]
  const response = await handler(request(`fetch=${uuid}`, { headers: { Authorization: 'Bearer previous-session' } }))
  assert.equal((await response.json()).supabase_user_id, 'legacy-user')
  assert.equal(state.users[0].app_metadata.twitch_user_id, '123')
})

test.after(() => { globalThis.fetch = originalFetch; globalThis.Deno = originalDeno; delete globalThis.__oauthTest })
