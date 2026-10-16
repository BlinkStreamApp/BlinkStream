import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function validateReleaseDocs({ version, readme, notes, roadmap }) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const checks = [
    ['README.md', readme, new RegExp(`source_version-${escaped}(?:-|["\\s])`)],
    ['RELEASE_NOTES.md', notes, new RegExp(`^# BlinkStream ${escaped}(?:\\s|$)`, 'm')],
    ['ROADMAP.md', roadmap, new RegExp(`^## Execution status[^\\n]* / v${escaped}(?:\\s|$)`, 'm')],
  ]
  const outdated = checks.filter(([, content, pattern]) => !pattern.test(content || '')).map(([path]) => path)
  if (outdated.length) throw new Error(`Documentación de ${version} desactualizada: ${outdated.join(', ')}`)
}

export function readReleaseDocs(root = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  const read = path => readFileSync(resolve(root, path), 'utf8')
  return {
    version: JSON.parse(read('package.json')).version,
    readme: read('README.md'), notes: read('RELEASE_NOTES.md'),
    roadmap: read('ROADMAP.md'), website: read('docs/index.html'),
  }
}
