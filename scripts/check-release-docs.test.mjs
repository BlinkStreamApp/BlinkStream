import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('standalone desktop builds use Tauri CLI to embed the frontend', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.scripts['build:desktop'], 'tauri build --no-bundle')
})

test('updater excludes the unused legacy ZIP extractor while retaining TLS', () => {
  const cargo = readFileSync(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8')
  assert.match(cargo, /tauri-plugin-updater\s*=\s*\{[^}]*default-features\s*=\s*false[^}]*features\s*=\s*\["rustls-tls"\]/)
  const lock = readFileSync(new URL('../src-tauri/Cargo.lock', import.meta.url), 'utf8')
  assert.doesNotMatch(lock, /\nname = "zip"\r?\n/)
  const manifest = readFileSync(new URL('./build-updater-manifest.mjs', import.meta.url), 'utf8')
  for (const format of ['Win_x64.exe', 'Linux_x86_64.AppImage', 'macOS_arm64.app.tar.gz', 'macOS_x64.app.tar.gz']) {
    assert.ok(manifest.includes(format), `Missing supported updater format: ${format}`)
  }
})
import { readReleaseDocs, validateReleaseDocs } from './check-release-docs.mjs'

const docs = {
  version: '1.4.4', readme: 'source_version-1.4.4-purple',
  notes: '# BlinkStream 1.4.4 — Update',
  roadmap: '## Execution status — 2026-10-13 / v1.4.4 release candidate',
  website: '<body data-source-version="1.4.4">Download stable 1.4.3</body>',
}

test('current source documentation has matching version markers', () => {
  validateReleaseDocs(readReleaseDocs())
})

test('publication and updater use version-specific ES/EN notes, not candidate history', () => {
  const version = readReleaseDocs().version
  const notes = readFileSync(new URL(`../docs/releases/${version}.md`, import.meta.url), 'utf8')
  assert.ok(notes.startsWith(`# BlinkStream ${version} —`))
  assert.match(notes, /^## ES$/m)
  assert.match(notes, /^## EN$/m)
  assert.doesNotMatch(notes, /local candidate|not published|\(candidate\)/i)
  const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
  assert.ok(workflow.includes('NOTES="docs/releases/${VERSION}.md"'))
  assert.ok(workflow.includes('test -f "$NOTES"'))
  assert.ok(workflow.includes('--notes "$NOTES"'))
  assert.ok(workflow.includes('body_path: ${{ steps.release_metadata.outputs.notes }}'))
  assert.ok(!workflow.includes('--notes RELEASE_NOTES.md'))
})

test('README and archived website retain official Store web and Windows deep links', () => {
  const { readme, website } = readReleaseDocs()
  for (const content of [readme, website]) {
    assert.ok(content.includes('https://apps.microsoft.com/detail/9NQZ79VL630L'))
    assert.ok(content.includes('ms-windows-store://pdp/?productid=9NQZ79VL630L'))
  }
})
test('candidate may honestly retain previous published download links', () => {
  assert.doesNotThrow(() => validateReleaseDocs(docs))
})
for (const [key, path] of [['readme', 'README.md'], ['notes', 'RELEASE_NOTES.md'], ['roadmap', 'ROADMAP.md']]) {
  test(`rejects forgotten update in ${path}`, () => {
    assert.throws(() => validateReleaseDocs({ ...docs, [key]: docs[key].replaceAll('1.4.4', '1.4.3') }), error => error.message.includes(path))
  })
}

test('retired Pages archive does not gate new release versions', () => {
  assert.doesNotThrow(() => validateReleaseDocs({ ...docs, website: 'Archived website' }))
})

test('README points to the only official website and privacy policy', () => {
  const { readme } = readReleaseDocs()
  assert.ok(readme.includes('https://apxstudio.es/'))
  assert.ok(readme.includes('https://apxstudio.es/privacy.html'))
  assert.ok(!readme.includes('https://blinkstreamapp.github.io/BlinkStream/'))
})
test('does not mistake history mentions for current documentation', () => {
  assert.throws(() => validateReleaseDocs({ ...docs, notes: '# BlinkStream 1.4.3\nOld version. Next release: 1.4.4' }), /RELEASE_NOTES/)
})
test('version dots are literals rather than wildcard matches', () => {
  assert.throws(() => validateReleaseDocs({ ...docs, readme: 'source_version-1x4x4-purple' }), /README/)
})

test('roadmap prose remains inline instead of becoming separate flex/grid items', () => {
  const website = readReleaseDocs().website
  const rule = website.match(/\.roadmap-list li\s*\{([^}]+)\}/)?.[1]
  assert.ok(rule, 'Missing roadmap item styles')
  assert.doesNotMatch(rule, /display\s*:\s*(?:inline-)?(?:flex|grid)\b/)
  assert.match(rule, /padding-left\s*:/)
  assert.match(website, /\.roadmap-list li::before\s*\{[^}]*position:\s*absolute/)
})

test('website cards and navigation handle narrow screens without fixed minimum widths', () => {
  const website = readReleaseDocs().website
  assert.match(website, /minmax\(min\(100%,\s*340px\),\s*1fr\)/)
  assert.match(website, /\.nav-links\s*\{[^}]*order:\s*3;[^}]*flex-wrap:\s*wrap/)
  assert.match(website, /section\[id\]\s*\{\s*scroll-margin-top:/)
})

test('website text has no replacement characters or common broken UTF-8 sequences', () => {
  assert.doesNotMatch(readReleaseDocs().website, /\uFFFD|Ã[\u0080-\u00BF]|â€/)
})

test('repository roadmap includes planned milestones through 2.0', () => {
  const { roadmap } = readReleaseDocs()
  for (const version of ['1.5.x', '1.6.x', '1.7.x', '1.8.x', '1.9.x', '2.0']) {
    assert.ok(roadmap.includes(`### ${version} —`), `Missing repository milestone ${version}`)
  }
  assert.match(roadmap, /### 2\.0 — Rediseño completo/)
})
