import assert from 'node:assert/strict'
import test from 'node:test'
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
