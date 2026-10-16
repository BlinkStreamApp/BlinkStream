import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('standalone desktop builds use Tauri CLI to embed the frontend', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.scripts['build:desktop'], 'tauri build --no-bundle')
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

test('README and website expose official Store web and Windows deep links', () => {
  const { readme, website } = readReleaseDocs()
  for (const content of [readme, website]) {
    assert.ok(content.includes('https://apps.microsoft.com/detail/9NQZ79VL630L'))
    assert.ok(content.includes('ms-windows-store://pdp/?productid=9NQZ79VL630L'))
  }
})
test('candidate may honestly retain previous published download links', () => {
  assert.doesNotThrow(() => validateReleaseDocs(docs))
})
for (const [key, path] of [['readme', 'README.md'], ['notes', 'RELEASE_NOTES.md'], ['roadmap', 'ROADMAP.md'], ['website', 'docs/index.html']]) {
  test(`rejects forgotten update in ${path}`, () => {
    assert.throws(() => validateReleaseDocs({ ...docs, [key]: docs[key].replaceAll('1.4.4', '1.4.3') }), error => error.message.includes(path))
  })
}
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

test('planned milestones through 2.0 appear in both repository and website roadmaps', () => {
  const { roadmap, website } = readReleaseDocs()
  for (const version of ['1.5.x', '1.6.x', '1.7.x', '1.8.x', '1.9.x', '2.0']) {
    assert.ok(roadmap.includes(`### ${version} —`), `Missing repository milestone ${version}`)
    assert.ok(website.includes(`v${version} —`), `Missing website milestone ${version}`)
  }
  assert.match(roadmap, /### 2\.0 — Rediseño completo/)
  assert.match(website, /v2\.0 — Rediseño completo/)
})
