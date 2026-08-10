

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const MOJIBAKE_PATTERNS = [

  { name: 'a-acute', pattern: /Ã¡/ },
  { name: 'e-acute', pattern: /Ã©/ },
  { name: 'i-acute', pattern: /Ã­/ },
  { name: 'o-acute', pattern: /Ã³/ },
  { name: 'u-acute', pattern: /Ãº/ },
  { name: 'n-tilde', pattern: /Ã±/ },

  { name: 'cp1252-inverted-excl', pattern: /Â¡/ },
  { name: 'cp1252-inverted-quest', pattern: /Â¿/ },
  { name: 'cp1252-degree', pattern: /Â°/ },
  { name: 'cp1252-middot', pattern: /Â·/ },
  { name: 'cp1252-copyright', pattern: /Â©/ },
  { name: 'cp1252-registered', pattern: /Â®/ },
  { name: 'cp1252-cent', pattern: /Â¢/ },
  { name: 'cp1252-pound', pattern: /Â£/ },
  { name: 'cp1252-yen', pattern: /Â¥/ },
  { name: 'cp1252-section', pattern: /Â§/ },

  { name: 'cp1252-euro', pattern: /â‚¬/ },
  { name: 'cp1252-mult-sign', pattern: /Ã—/ },
  { name: 'cp1252-ellipsis', pattern: /â€¦/ },
  { name: 'cp1252-trademark', pattern: /â„¢/ },

  { name: 'cp1252-right-arrow', pattern: /â†’/ },
  { name: 'cp1252-up-arrow', pattern: /â†‘/ },
  { name: 'cp1252-down-arrow', pattern: /â†“/ },
  { name: 'cp1252-left-arrow', pattern: /â† / },

  { name: 'cp1252-box-drawing-h', pattern: /â”€/ },

  { name: 'cp1252-checkmark', pattern: /âœ“/ },

  { name: 'triple-encoded-emoji', pattern: /ðŸ[\u0080-\u017f]/ },
  { name: 'triple-encoded-arrow', pattern: /â\u02c6\u2019/ },
  { name: 'triple-encoded-heart', pattern: /â\u009d¤ï¸\u008f/ },
  { name: 'triple-encoded-euro', pattern: /Ã‚€/ },

  { name: 'nbsp-double-encoded', pattern: /Â / },
]

const SCAN_DIRS = ['src', 'src-tauri/src', 'docs']
const SCAN_FILES = ['index.html', 'package.json', 'tauri.conf.json', 'pnpm-workspace.yaml']

const SCAN_EXTS = /\.(jsx?|tsx?|rs|html|md|json|ya?ml|toml|css)$/

const SKIP_DIRS = new Set(['node_modules', 'target', 'dist', 'coverage', '.git', '.obsidian-vault', '.mojibake_backup'])

const SKIP_FILES = new Set(['encoding-certification.test.js'])

function walk(dir, results = []) {
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue
      walk(fullPath, results)
    } else if (SCAN_EXTS.test(entry) && !SKIP_FILES.has(entry)) {
      results.push(fullPath)
    }
  }
  return results
}

describe('WT-20260628-37: Certificacion sin mojibake', () => {
  const repoRoot = resolve(__dirname, '..', '..')
  const files = []
  for (const d of SCAN_DIRS) {
    files.push(...walk(join(repoRoot, d)))
  }
  for (const f of SCAN_FILES) {
    const p = join(repoRoot, f)
    if (existsSync(p)) files.push(p)
  }

  it('se han encontrado archivos para escanear', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    it(`${file.replace(repoRoot + '\\\\', '')} no contiene mojibake`, () => {
      let content
      try {
        content = readFileSync(file, 'utf-8')
      } catch (err) {

        return
      }
      const found = []
      for (const { name, pattern } of MOJIBAKE_PATTERNS) {
        const m = content.match(pattern)
        if (m) {

          const idx = content.indexOf(m[0])
          const before = content.slice(0, idx)
          const lineNum = before.split('\n').length
          found.push({ name, match: m[0], line: lineNum })
        }
      }
      if (found.length > 0) {
        const summary = found
          .map((f) => `    L${f.line}: ${f.name} ("${f.match}")`)
          .join('\n')
        throw new Error(`Mojibake detectado en ${file}:\n${summary}`)
      }
    })
  }
})