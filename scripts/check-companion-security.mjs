import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

test('mobile companion treats malicious names and images as data and keeps credentials off URLs', async () => {
  const source = readFileSync('src-tauri/src/companion.rs', 'utf8')
  const html = source.slice(source.indexOf('<!DOCTYPE html>'), source.indexOf('</html>') + 7)
  const dom = new JSDOM(html, { url: 'http://192.168.1.2:9876/#pin=test-session', runScripts: 'outside-only' })
  const calls = []
  dom.window.fetch = async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => ({ channel: 'channel', avatar: '" onerror="AUDIT', favorites_live: [{ name: '<img src=x onerror=AUDIT>', avatar: '" onerror="AUDIT', live: true }] }) }
  }
  dom.window.setInterval = () => 0
  dom.window.eval(dom.window.document.querySelector('script').textContent)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(dom.window.location.hash, '')
  assert.equal(dom.window.document.querySelector('[onerror]'), null)
  assert.equal(dom.window.document.querySelector('.fav-name').textContent, '<img src=x onerror=AUDIT>')
  assert.equal(calls[0].url, '/api/state')
  assert.equal(calls[0].options.headers['X-BlinkStream-Token'], 'test-session')
  dom.window.close()
})

test('all registered commands have explicit app permission scope, not wildcard webviews', () => {
  const source = readFileSync('src-tauri/src/lib.rs', 'utf8')
  const manifest = readFileSync('src-tauri/build.rs', 'utf8')
  const permissions = readFileSync('src-tauri/permissions/app-native.toml', 'utf8')
  const commands = source.match(/generate_handler!\[([\s\S]*?)\]/)[1].split(',').map(value => value.trim().split('::').at(-1)).filter(Boolean)
  for (const command of commands) {
    assert(manifest.includes(`"${command}"`), `Missing manifest command ${command}`)
    assert(permissions.includes(`"${command}"`), `Missing permission command ${command}`)
  }
  const capability = JSON.parse(readFileSync('src-tauri/capabilities/default.json', 'utf8'))
  assert.deepEqual(capability.webviews, ['main', 'gamer_overlay'])
  assert(!capability.remote)
  assert(!capability.permissions.includes('core:webview:allow-internal-toggle-devtools'))
})
