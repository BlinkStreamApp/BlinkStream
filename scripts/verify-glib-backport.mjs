import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Registry glib 0.18.5 + upstream security fix + two explicit lifetimes; see ADR-014.
const EXPECTED_FILES = 121
const EXPECTED_TREE = '6a710a7a136a4a1a53e1ca3ec6f17e3efd48ae34bf54e7145ee0e59599e2c09b'

export function verifyGLibBackport(root = fileURLToPath(new URL('../src-tauri/vendor/glib/', import.meta.url))) {
  root = resolve(root)
  const entries = readdirSync(root, { recursive: true, withFileTypes: true })
  if (entries.some(entry => !entry.isFile() && !entry.isDirectory())) {
    throw new Error('GLib vendor contiene entradas no permitidas')
  }
  const files = entries.filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name).slice(root.length + 1).replaceAll('\\', '/'))
    .sort()
  const hash = createHash('sha256')
  for (const file of files) {
    const bytes = readFileSync(join(root, file))
    hash.update(`${file}\0`)
    hash.update(`${bytes.length}\0`)
    hash.update(bytes)
  }
  if (files.length !== EXPECTED_FILES || hash.digest('hex') !== EXPECTED_TREE) {
    throw new Error('GLib vendor no coincide con el backport de seguridad revisado')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyGLibBackport()
  console.log('GLib 0.18.5: integridad del backport verificada')
}
