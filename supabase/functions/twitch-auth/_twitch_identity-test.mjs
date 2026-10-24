import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import assert from 'node:assert/strict'
import test from 'node:test'

const source = readFileSync(new URL('./_twitch_identity.ts', import.meta.url), 'utf8')
const moduleUrl = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`
const { parseTwitchIdentity, REQUESTED_TWITCH_SCOPES } = await import(moduleUrl)

const valid = {
  client_id: 'own-client',
  user_id: '123456789',
  login: 'Alice_123',
  expires_in: 3600,
  scopes: ['chat:read', 'chat:edit', 'user:read:follows'],
}

test('accepts a current token for the configured Twitch application', () => {
  assert.deepEqual(parseTwitchIdentity(valid, 'own-client'), {
    userId: '123456789',
    login: 'alice_123',
    expiresIn: 3600,
    scopes: valid.scopes,
  })
})

test('fails closed on wrong client, invalid identity, expiry or missing baseline scopes', () => {
  assert.equal(parseTwitchIdentity({ ...valid, client_id: 'other-client' }, 'own-client'), null)
  assert.equal(parseTwitchIdentity({ ...valid, user_id: 'not-numeric' }, 'own-client'), null)
  assert.equal(parseTwitchIdentity({ ...valid, login: 'bad-login!' }, 'own-client'), null)
  assert.equal(parseTwitchIdentity({ ...valid, expires_in: 0 }, 'own-client'), null)
  assert.equal(parseTwitchIdentity({ ...valid, scopes: ['chat:read'] }, 'own-client'), null)
})

test('requested scopes exclude obsolete and unused account-wide grants', () => {
  assert.equal(REQUESTED_TWITCH_SCOPES.includes('user:edit:follows'), false)
  assert.equal(REQUESTED_TWITCH_SCOPES.includes('channel:read:subscriptions'), false)
})

test('requests chatter access without making it mandatory for existing sessions', () => {
  assert.equal(REQUESTED_TWITCH_SCOPES.includes('moderator:read:chatters'), true)
  assert.notEqual(parseTwitchIdentity(valid, 'own-client'), null)
  assert.notEqual(parseTwitchIdentity({ ...valid, scopes: [...valid.scopes, 'moderator:read:chatters'] }, 'own-client'), null)
})
