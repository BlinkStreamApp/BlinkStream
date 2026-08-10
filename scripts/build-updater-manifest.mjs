import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function parseArgs(argv) {
  const args = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || value == null) {
      throw new Error(`Argumento inválido: ${key ?? '<vacío>'}`)
    }
    args.set(key.slice(2), value)
  }
  return args
}

function findFile(root, expectedName) {
  const matches = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && entry.name === expectedName) matches.push(path)
    }
  }
  visit(root)
  if (matches.length === 1) return matches[0]
  return null
}

export function buildUpdaterManifest({ version, repository, tag, artifactsDir, notesFile }) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Versión inválida: ${version}`)
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`Repositorio inválido: ${repository}`)
  }
  if (!/^v[0-9A-Za-z.-]+$/.test(tag)) {
    throw new Error(`Tag inválido: ${tag}`)
  }

  const specs = {
    'windows-x86_64': `BlinkStream_${version}_Win_x64.exe`,
    'darwin-aarch64': `BlinkStream_${version}_macOS_arm64.app.tar.gz`,
    'darwin-x86_64': `BlinkStream_${version}_macOS_x64.app.tar.gz`,
    'linux-x86_64': `BlinkStream_${version}_Linux_x86_64.AppImage.tar.gz`,
  }
  const baseUrl = `https://github.com/${repository}/releases/download/${tag}`
  const platforms = {}

  for (const [platform, artifactName] of Object.entries(specs)) {
    const signaturePath = findFile(artifactsDir, `${artifactName}.sig`)
    if (!signaturePath) {
      console.warn(`Firma no encontrada para ${platform} (${artifactName}.sig), omitiendo plataforma`)
      continue
    }
    const signature = readFileSync(signaturePath, 'utf8').trim()
    if (!signature) throw new Error(`Firma vacía: ${basename(signaturePath)}`)
    platforms[platform] = {
      signature,
      url: `${baseUrl}/${artifactName}`,
    }
  }

  if (Object.keys(platforms).length === 0) {
    throw new Error('No se encontró ninguna firma para ninguna plataforma')
  }

  const notes = existsSync(notesFile)
    ? readFileSync(notesFile, 'utf8').trim()
    : `Novedades de BlinkStream v${version}`

  return {
    version,
    notes: notes || `Novedades de BlinkStream v${version}`,
    pub_date: new Date().toISOString(),
    platforms,
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const required = ['version', 'repository', 'tag', 'artifacts', 'notes', 'output']
  for (const name of required) {
    if (!args.get(name)) throw new Error(`Falta --${name}`)
  }

  const artifactsDir = resolve(args.get('artifacts'))
  if (!statSync(artifactsDir).isDirectory()) {
    throw new Error(`No es un directorio: ${artifactsDir}`)
  }
  const manifest = buildUpdaterManifest({
    version: args.get('version'),
    repository: args.get('repository'),
    tag: args.get('tag'),
    artifactsDir,
    notesFile: resolve(args.get('notes')),
  })
  writeFileSync(resolve(args.get('output')), `${JSON.stringify(manifest, null, 2)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
}
