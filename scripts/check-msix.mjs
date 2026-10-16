import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { packageVersion, manifest, storeProfile, publisherId, storeIconAssets } from './msix.mjs'

const readJSON = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const identity = readJSON('../src-tauri/msix/identity.json')

test('Store taskbar assets cover exact target sizes and unplated light/dark themes', () => {
  const assets = storeIconAssets()
  assert.equal(new Set(assets.map(asset => asset.name)).size, 63)
  for (const size of [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256]) {
    for (const theme of ['', '_altform-unplated', '_altform-lightunplated']) {
      assert.deepEqual(assets.find(asset => asset.name === `Square44x44Logo.targetsize-${size}${theme}.png`), { name: `Square44x44Logo.targetsize-${size}${theme}.png`, size })
    }
  }
  assert.equal(assets.find(asset => asset.name === 'Square150x150Logo.scale-400.png').size, 600)
  const build = readFileSync(new URL('./build-msix.ps1', import.meta.url), 'utf8')
  assert.match(build, /\$makePri new/)
  assert.match(build, /\$makePri dump/)
  assert.match(build, /Icon missing from PRI/)
  assert.match(build, /Packaged icon mismatch/)
  assert.match(build, /PRI resource path does not match manifest Assets path/)
})
test('Store manifest keeps Partner Center identity, desktop architecture and eight languages', () => {
  const result = manifest(identity, '1.5.0')
  assert.match(result, /APXStudio\.7806DADA0693/)
  assert.ok(result.includes(identity.publisher))
  assert.equal(publisherId(identity.publisher), 'm20vhv7zq07ng')
  assert.match(result, /Version="1\.5\.0\.0"/)
  assert.match(result, /DisplayName="Blink Stream"/)
  assert.match(result, /ProcessorArchitecture="x64"/)
  assert.match(result, /ExternalDependency Name="Microsoft.WebView2"/)
  assert.match(result, /MinVersion="1\.1\.1\.1" Optional="false"/)
  assert.equal((result.match(/<Resource Language=/g) || []).length, 8)
  assert.doesNotMatch(result, /windows\.fullTrustApplication|updater\.json|runas|broadFileSystemAccess/)
})
test('Store version rejects prereleases, invalid ranges and XML injection', () => {
  for (const version of ['1.5.0-a', '0.1.0', '1.2.3.4', '1.65536.0', '1.2.<']) assert.throws(() => packageVersion(version))
  assert.throws(() => manifest({ ...identity, name: 'bad<identity' }, '1.5.0'))
  assert.throws(() => manifest({ ...identity, publisher: 'CN=wrong-publisher' }, '1.5.0'))
  assert.ok(manifest({ ...identity, displayName: 'Blink & Stream' }, '1.5.0').includes('Blink &amp; Stream'))
})
test('Store capabilities remove updater privileges without modifying GitHub profile', () => {
  const capability = readJSON('../src-tauri/capabilities/default.json')
  const profile = storeProfile(capability)
  assert.ok(capability.permissions.includes('updater:default'))
  assert.ok(!profile.app.security.capabilities[0].permissions.some(value => value.startsWith('updater:')))
  assert.deepEqual(profile.app.security.capabilities[0].webviews, ['main', 'gamer_overlay'])
  assert.equal(profile.plugins.updater, null)
  assert.equal(profile.bundle.createUpdaterArtifacts, false)
})

test('Store runtime is pinned and never falls back to downloading at app startup', () => {
  const runtime = readJSON('../src-tauri/msix/runtime.json')
  assert.match(runtime.url, /^https:\/\/github.com\/streamlink\/windows-builds\/releases\/download\//)
  assert.match(runtime.sha256, /^[a-f0-9]{64}$/)
  assert.equal(runtime.prefix, 'streamlink-8.6.2-1-py314-x86_64/')
  const native = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8')
  const dependencies = native.slice(native.indexOf('pub fn ensure_runtime_dependencies'), native.indexOf('let system_streamlink', native.indexOf('pub fn ensure_runtime_dependencies')))
  assert.match(dependencies, /microsoft-store/)
  assert.match(dependencies, /ensure_ffmpeg_path/)
  assert.doesNotMatch(dependencies, /run_winget_install/)
})
