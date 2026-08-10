import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildUpdaterManifest } from './build-updater-manifest.mjs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const VERSION = packageJson.version
const ARTIFACTS = [
  `BlinkStream_${VERSION}_Win_x64.exe`,
  `BlinkStream_${VERSION}_macOS_arm64.app.tar.gz`,
  `BlinkStream_${VERSION}_macOS_x64.app.tar.gz`,
  `BlinkStream_${VERSION}_Linux_x86_64.AppImage.tar.gz`,
]

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'blinkstream-updater-'))
  const signatures = join(root, 'signatures', 'nested')
  mkdirSync(signatures, { recursive: true })
  for (const artifact of ARTIFACTS) {
    writeFileSync(join(signatures, `${artifact}.sig`), `signature:${artifact}\nsecond-line\n`)
  }
  const notesFile = join(root, 'RELEASE_NOTES.md')
  writeFileSync(notesFile, '# Release notes\n\nCorrecciones importantes.\n')
  return { root, notesFile }
}

test('genera un manifiesto completo con firmas multilínea', () => {
  const { root, notesFile } = fixture()
  try {
    const manifest = buildUpdaterManifest({
      version: VERSION,
      repository: 'BlinkStreamApp/BlinkStream',
      tag: `v${VERSION}`,
      artifactsDir: root,
      notesFile,
    })
    assert.equal(Object.keys(manifest.platforms).length, 4)
    assert.match(manifest.platforms['windows-x86_64'].signature, /second-line/)
    assert.equal(
      manifest.platforms['linux-x86_64'].url,
      `https://github.com/BlinkStreamApp/BlinkStream/releases/download/v${VERSION}/BlinkStream_${VERSION}_Linux_x86_64.AppImage.tar.gz`,
    )
    assert.match(manifest.notes, /Correcciones importantes/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('omite plataforma si falta su firma', () => {
  const { root, notesFile } = fixture()
  try {
    rmSync(join(root, 'signatures', 'nested', `${ARTIFACTS[0]}.sig`))
    const manifest = buildUpdaterManifest({
      version: VERSION,
      repository: 'BlinkStreamApp/BlinkStream',
      tag: `v${VERSION}`,
      artifactsDir: root,
      notesFile,
    })
    assert.equal(Object.keys(manifest.platforms).length, 3)
    assert.equal(manifest.platforms['windows-x86_64'], undefined)
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
      }),
      /ninguna/,
    )
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
