import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildUpdaterManifest, verifyUpdaterArtifact } from './build-updater-manifest.mjs'
import { PROBE, recoverUpdaterPublicKey } from './recover-updater-public-key.mjs'
import { buildSignedRelease, normalizeSigningEnvironment } from './build-signed-release.mjs'
import { verifyGLibBackport } from './verify-glib-backport.mjs'

const testKeys = generateKeyPairSync('ed25519')
const keyId = Buffer.from('0102030405060708', 'hex')
const keyBytes = testKeys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)
const publicKey = Buffer.from(`untrusted comment: test key\n${Buffer.concat([
  Buffer.from('Ed'), keyId, keyBytes,
]).toString('base64')}\n`).toString('base64')

function signatureFor(data, algorithm = 'ED') {
  const message = algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data
  const artifactSignature = sign(null, message, testKeys.privateKey)
  const comment = 'timestamp:1 file:test'
  const globalSignature = sign(null, Buffer.concat([
    artifactSignature, Buffer.from(comment),
  ]), testKeys.privateKey)
  return Buffer.from(`untrusted comment: test signature\n${Buffer.concat([
    Buffer.from(algorithm), keyId, artifactSignature,
  ]).toString('base64')}\ntrusted comment: ${comment}\n${globalSignature.toString('base64')}\n`).toString('base64')
}

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const VERSION = packageJson.version
const ARTIFACTS = [
  `BlinkStream_${VERSION}_Win_x64.exe`,
  `BlinkStream_${VERSION}_macOS_arm64.app.tar.gz`,
  `BlinkStream_${VERSION}_macOS_x64.app.tar.gz`,
  `BlinkStream_${VERSION}_Linux_x86_64.AppImage`,
]

test('normaliza LF/CRLF y Base64 envuelto sin cambiar bytes, contraseña ni entorno original', () => {
  const bytes = Buffer.from('test-only signing material\nsecond line\n')
  const key = bytes.toString('base64')
  const environment = { TAURI_SIGNING_PRIVATE_KEY: ` ${key.slice(0, 16)}\r\n${key.slice(16)}\n`,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ' password with spaces \n', OTHER: 'preserved' }
  const normalized = normalizeSigningEnvironment(environment)
  assert.equal(normalized.TAURI_SIGNING_PRIVATE_KEY, key)
  assert.deepEqual(Buffer.from(normalized.TAURI_SIGNING_PRIVATE_KEY, 'base64'), bytes)
  assert.equal(normalized.TAURI_SIGNING_PRIVATE_KEY_PASSWORD, environment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD)
  assert.equal(normalized.OTHER, 'preserved')
  assert.notEqual(environment.TAURI_SIGNING_PRIVATE_KEY, key)
  for (const invalid of ['', '====', 'not!base64', 'Zg', 'Zm=9v']) {
    assert.throws(() => normalizeSigningEnvironment({ TAURI_SIGNING_PRIVATE_KEY: invalid }), /secreto/i)
  }
})

test('GLib vendor conserva exactamente el backport revisado y rechaza su reversión', () => {
  assert.doesNotThrow(() => verifyGLibBackport())
  const root = mkdtempSync(join(tmpdir(), 'blinkstream-glib-backport-'))
  const copy = join(root, 'glib')
  try {
    cpSync(new URL('../src-tauri/vendor/glib/', import.meta.url), copy, { recursive: true })
    const path = join(copy, 'src/variant_iter.rs')
    const code = readFileSync(path, 'utf8')
    writeFileSync(path, code.replace('let mut p: *mut libc::c_char', 'let p: *mut libc::c_char')
      .replace('&mut p,', '&p,'))
    assert.throws(() => verifyGLibBackport(copy), /backport/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('build firmado entrega la clave solo por entorno y propaga un fallo del CLI', () => {
  const encoded = Buffer.from('test-only key').toString('base64')
  let called = false
  const status = buildSignedRelease(['--bundles', 'nsis'], {
    environment: { TAURI_SIGNING_PRIVATE_KEY: `${encoded}\n` },
    run: (_executable, args, options) => {
      called = true
      assert.ok(args.includes('src-tauri/tauri.release.conf.json'))
      assert.ok(args.includes('nsis'))
      assert.equal(args.includes(encoded), false)
      assert.equal(options.env.TAURI_SIGNING_PRIVATE_KEY, encoded)
      assert.equal(options.stdio, 'inherit')
      return { status: 17 }
    },
  })
  assert.equal(called, true)
  assert.equal(status, 17)
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'blinkstream-updater-'))
  const signatures = join(root, 'signatures', 'nested')
  mkdirSync(signatures, { recursive: true })
  for (const artifact of ARTIFACTS) {
    const bytes = Buffer.from(`test artifact: ${artifact}`)
    writeFileSync(join(signatures, artifact), bytes)
    writeFileSync(join(signatures, `${artifact}.sig`), signatureFor(bytes))
  }
  const notesFile = join(root, 'RELEASE_NOTES.md')
  writeFileSync(notesFile, '# Release notes\n\nCorrecciones importantes.\n')
  return { root, notesFile }
}

test('genera un manifiesto completo solo con artefactos y firmas verificadas', () => {
  const { root, notesFile } = fixture()
  try {
    const manifest = buildUpdaterManifest({
      version: VERSION,
      repository: 'BlinkStreamApp/BlinkStream',
      tag: `v${VERSION}`,
      artifactsDir: root,
      notesFile,
      publicKey,
    })
    assert.equal(Object.keys(manifest.platforms).length, 4)
    assert.equal(manifest.platforms['windows-x86_64'].signature,
      readFileSync(join(root, 'signatures', 'nested', `${ARTIFACTS[0]}.sig`), 'utf8'))
    assert.equal(
      manifest.platforms['linux-x86_64'].url,
      `https://github.com/BlinkStreamApp/BlinkStream/releases/download/v${VERSION}/BlinkStream_${VERSION}_Linux_x86_64.AppImage`,
    )
    assert.match(manifest.notes, /Correcciones importantes/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rechaza un release incompleto si falta una firma', () => {
  const { root, notesFile } = fixture()
  try {
    rmSync(join(root, 'signatures', 'nested', `${ARTIFACTS[0]}.sig`))
    assert.throws(() => buildUpdaterManifest({
      version: VERSION,
      repository: 'BlinkStreamApp/BlinkStream',
      tag: `v${VERSION}`,
      artifactsDir: root,
      notesFile,
      publicKey,
    }), /exactamente un archivo/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('falla si faltan todas las firmas', () => {
  const root = mkdtempSync(join(tmpdir(), 'blinkstream-updater-empty-'))
  mkdirSync(join(root, 'empty'), { recursive: true })
  const notesFile = join(root, 'RELEASE_NOTES.md')
  writeFileSync(notesFile, '# Notes\n')
  try {
    assert.throws(
      () => buildUpdaterManifest({
        version: VERSION,
        repository: 'BlinkStreamApp/BlinkStream',
        tag: `v${VERSION}`,
        artifactsDir: root,
        notesFile,
        publicKey,
      }),
      /exactamente un archivo/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('verifica minisign tanto prehash como legacy y rechaza manipulación', () => {
  const bytes = Buffer.from('installer fixture')
  for (const algorithm of ['ED', 'Ed']) {
    const signature = signatureFor(bytes, algorithm)
    assert.doesNotThrow(() => verifyUpdaterArtifact(bytes, signature, publicKey))
    assert.throws(() => verifyUpdaterArtifact(Buffer.from('altered'), signature, publicKey), /alterado/)
    const changedComment = Buffer.from(Buffer.from(signature, 'base64').toString()
      .replace('timestamp:1', 'timestamp:2')).toString('base64')
    assert.throws(() => verifyUpdaterArtifact(bytes, changedComment, publicKey), /alterado/)
    const changedKey = Buffer.from(publicKey, 'base64').toString().split('\n')
    const raw = Buffer.from(changedKey[1], 'base64')
    raw[2] ^= 1
    changedKey[1] = raw.toString('base64')
    assert.throws(() => verifyUpdaterArtifact(bytes, signature,
      Buffer.from(changedKey.join('\n')).toString('base64')), /clave pública/)
    assert.throws(() => verifyUpdaterArtifact(bytes, 'invalid', publicKey), /Formato/)
  }
})

test('acepta el vector prehash de minisign-verify 0.2.5 usado por Tauri', () => {
  // Independent upstream vector; avoids testing the verifier only against our own signer.
  const upstreamKey = Buffer.from('untrusted comment: upstream test key\n'
    + 'RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3\n').toString('base64')
  const upstreamSignature = Buffer.from('untrusted comment: signature from minisign secret key\n'
    + 'RUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\n'
    + 'trusted comment: timestamp:1556193335\tfile:test\n'
    + 'y/rUw2y8/hOUYjZU71eHp/Wo1KZ40fGy2VJEDl34XMJM+TX48Ss/17u3IvIfbVR1FkZZSNCisQbuQY+bHwhEBg==\n').toString('base64')
  assert.doesNotThrow(() => verifyUpdaterArtifact(Buffer.from('test'), upstreamSignature, upstreamKey))
})

test('rechaza tag incorrecto, binario ausente, duplicados y firma vacía', () => {
  const { root, notesFile } = fixture()
  const options = { version: VERSION, repository: 'BlinkStreamApp/BlinkStream',
    tag: `v${VERSION}`, artifactsDir: root, notesFile, publicKey }
  try {
    assert.throws(() => buildUpdaterManifest({ ...options, tag: 'v0.0.1' }), /no coinciden/)
    assert.throws(() => buildUpdaterManifest({ ...options, publicKey: '' }), /clave pública/)
    writeFileSync(join(root, `${ARTIFACTS[0]}.sig`), 'duplicate')
    assert.throws(() => buildUpdaterManifest(options), /encontrados: 2/)
    rmSync(join(root, `${ARTIFACTS[0]}.sig`))
    writeFileSync(join(root, 'signatures', 'nested', `${ARTIFACTS[0]}.sig`), '')
    assert.throws(() => buildUpdaterManifest(options), /vacía/)
    rmSync(join(root, 'signatures', 'nested', ARTIFACTS[0]))
    assert.throws(() => buildUpdaterManifest(options), /exactamente un archivo/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('mantiene la versión sincronizada entre Node, Tauri y Rust', () => {
  const tauriConfig = JSON.parse(
    readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  )
  const cargoManifest = readFileSync(
    new URL('../src-tauri/Cargo.toml', import.meta.url),
    'utf8',
  )
  const cargoVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1]

  assert.equal(tauriConfig.version, VERSION)
  assert.equal(cargoVersion, VERSION)
})

test('recuperación exporta solo evidencia pública, limpia el temporal y no propaga secretos', () => {
  const root = mkdtempSync(join(tmpdir(), 'blinkstream-key-test-'))
  const environment = { TAURI_SIGNING_PRIVATE_KEY: Buffer.from('test-only-key').toString('base64'),
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: 'test-only-password' }
  let privatePath
  const run = (_command, args, options) => {
    privatePath = args[args.indexOf('-s') + 1]
    assert.equal(readFileSync(privatePath, 'utf8'), 'test-only-key')
    assert.equal(options.env.TAURI_SIGNING_PRIVATE_KEY, undefined)
    assert.equal(options.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD, undefined)
    assert.equal(options.input, 'test-only-password\n')
    if (args[0] === '-R') {
      writeFileSync(args[args.indexOf('-p') + 1], Buffer.from(publicKey, 'base64'))
    } else {
      writeFileSync(args[args.indexOf('-x') + 1], Buffer.from(signatureFor(PROBE), 'base64'))
    }
    return { status: 0 }
  }
  try {
    recoverUpdaterPublicKey({ outputDir: root, environment, run })
    assert.equal(existsSync(privatePath), false)
    assert.deepEqual(readdirSync(root).sort(), ['probe.txt', 'probe.txt.sig', 'updater.pub'])
    verifyUpdaterArtifact(readFileSync(join(root, 'probe.txt')),
      readFileSync(join(root, 'probe.txt.sig'), 'utf8'), readFileSync(join(root, 'updater.pub'), 'utf8'))
    const failedDir = join(root, 'failed')
    assert.throws(() => recoverUpdaterPublicKey({ outputDir: failedDir, environment,
      run: (_cmd, args) => {
        privatePath = args[args.indexOf('-s') + 1]
        return { status: 1, stderr: 'sensitive tool output' }
      } }), /Minisign no pudo/)
    assert.equal(existsSync(privatePath), false)
    assert.equal(existsSync(failedDir), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
