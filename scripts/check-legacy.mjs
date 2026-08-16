#!/usr/bin/env node
// ==========================================
// BlinkStream - Anti-regresion pre-build (variante Node)
// Bloquea el build si encuentra strings de bugs ya corregidos.
// Override de emergencia: BLINKSTREAM_SKIP_REGRESSION=1
// ==========================================
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')

if (process.env.BLINKSTREAM_SKIP_REGRESSION === '1') {
  console.log('[check-legacy] SKIP forzado por env var')
  process.exit(0)
}

const PATTERNS = [
  { id: 'math-random-cache',   re: /Math\.floor\(Math\.random\(\)\s*\*\s*1e7\)/,                   desc: 'CWE-330 Math.random en cache-buster' },
  { id: 'bs_app_token_cache',  re: /bs_app_token_cache|APP_TOKEN_CACHE_KEY/,                      desc: 'Token App Access persistido en localStorage' },
  { id: 'window-open-tabnab',  re: /window\.open\(/,                                               desc: 'window.open sin noopener,noreferrer' },
  { id: 'gql-string-interp',   re: /user\(login:\s*"\$\{|channelName:\s*"\$\{/,                   desc: 'Interpolacion directa en GQL (CWE-94)' },
  { id: 'invoke-outside-guard',re: /^\s*invoke\(['"]/,                                            desc: 'invoke() sin guard isTauri()' },
  { id: 'tw-legacy-mojibake',  re: /(?:Ã¡|Ã©|Ã­|Ã³|Ãº|Ã±)/,                                        desc: 'Encoding UTF-8 mal decodificado' },
  { id: 'legacy-blob-preview', re: /URL\.createObjectURL/,                                         desc: 'Blob URL en preview live (rompe live streams)' },
  { id: 'thumbnailURL-mayus',  re: /thumbnailURL/,                                                 desc: 'Campo case-incorrecto en GQL' },
  { id: 'period-LAST_WEEK',    re: /period\s*:\s*\{\s*filter\s*:\s*LAST_WEEK/,                     desc: 'Enum GQL obsoleto (criterio de clips)' },
  { id: 'kimne78-legacy',      re: /kimne78kx3ncx6brgo4mv6wki5h1ko/,                             desc: 'Client ID legacy de Twitch (no usar)' },
]

const INCLUDE_GLOBS = ['src', 'src-tauri', 'supabase/functions']
const INCLUDE_EXT = ['.js', '.jsx', '.ts', '.tsx', '.rs']
const EXCLUDE_DIRS = ['node_modules', 'dist', 'target', 'coverage', '.mojibake_backup', '__mocks__']
const EXCLUDE_FILES = ['.test.js', '.test.jsx', '.test.ts', '.test.tsx', 'audit-']

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (EXCLUDE_DIRS.includes(entry)) continue
      walk(full, files)
    } else {
      const isIncluded = INCLUDE_GLOBS.some(g => full.replaceAll('\\', '/').includes(g))
      const hasExt = INCLUDE_EXT.some(ext => entry.endsWith(ext))
      if (isIncluded && hasExt) files.push(full)
    }
  }
  return files
}

const files = []
for (const top of INCLUDE_GLOBS) {
  try { walk(join(REPO_ROOT, top), files) } catch {}
}

const findings = []
for (const file of files) {
  const rel = relative(REPO_ROOT, file)
  const isExcluded = EXCLUDE_FILES.some(p => rel.includes(p))
  if (isExcluded) continue

  const content = readFileSync(file, 'utf8')
  const lines = content.split('\n')

  for (const p of PATTERNS) {
    const globalRe = new RegExp(p.re.source, 'g' + (p.re.flags || ''))
    let match
    while ((match = globalRe.exec(content)) !== null) {
      // Evitar zero-length match loop
      if (match[0].length === 0) { globalRe.lastIndex++; continue }
      const before = content.slice(0, match.index)
      const lineNum = before.split('\n').length
      const lineText = lines[lineNum - 1] || ''
      if (lineText.includes('ALLOWED-REGRESSION:')) {
        console.log(`[check-legacy] ALLOW  ${rel}:${lineNum}  [${p.id}]`)
        continue
      }
      const snippet = match[0].slice(0, 80)
      findings.push({ file: rel, line: lineNum, id: p.id, desc: p.desc, snip: snippet })
    }
  }
}

if (findings.length > 0) {
  console.log('')
  console.log('============================================================')
  console.log('  [check-legacy] REGRESIONES DETECTADAS - BUILD BLOQUEADO')
  console.log('============================================================')
  for (const f of findings) {
    console.log(`  - ${f.file}:${f.line}  [${f.id}]`)
    console.log(`      ${f.desc}`)
    console.log(`      match: ${f.snip}`)
  }
  console.log('')
  console.log('  Falso positivo? Anade en la linea:  // ALLOWED-REGRESSION: <razon>')
  console.log('  Emergencia?  set BLINKSTREAM_SKIP_REGRESSION=1 && npm run build')
  console.log('')
  process.exit(1)
}

console.log(`[check-legacy] OK (0 regresiones, ${files.length} archivos escaneados)`)
process.exit(0)
