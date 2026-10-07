import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createHash, createPublicKey, verify } from 'node:crypto'
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
  if (matches.length !== 1) {
    throw new Error(`Se esperaba exactamente un archivo ${expectedName}; encontrados: ${matches.length}`)
  }
  return matches[0]
}

// Match Tauri/minisign: key ID, artifact signature and authenticated trusted comment.
export function verifyUpdaterArtifact(artifact, signature, publicKey) {
  const keyLines = Buffer.from(publicKey, 'base64').toString('utf8').trim().split(/\r?\n/)
  const signatureLines = Buffer.from(signature, 'base64').toString('utf8').trim().split(/\r?\n/)
  const key = Buffer.from(keyLines[1] ?? '', 'base64')
  const signed = Buffer.from(signatureLines[1] ?? '', 'base64')
  const globalSignature = Buffer.from(signatureLines[3] ?? '', 'base64')
  if (key.length !== 42 || key.subarray(0, 2).toString() !== 'Ed'
      || signed.length !== 74 || globalSignature.length !== 64
      || !signatureLines[2]?.startsWith('trusted comment: ')) {
    throw new Error('Formato de firma/clave minisign inválido')
  }
  if (!key.subarray(2, 10).equals(signed.subarray(2, 10))) {
    throw new Error('La firma no corresponde a la clave pública configurada')
  }
  const algorithm = signed.subarray(0, 2).toString()
  if (algorithm !== 'Ed' && algorithm !== 'ED') throw new Error('Algoritmo minisign no soportado')
  const verifier = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key.subarray(10)]),
    format: 'der',
    type: 'spki',
  })
  const message = algorithm === 'ED' ? createHash('blake2b512').update(artifact).digest() : artifact
  const artifactSignature = signed.subarray(10)
  const commentMessage = Buffer.concat([
    artifactSignature, Buffer.from(signatureLines[2].slice('trusted comment: '.length)),
  ])
  if (!verify(null, message, verifier, artifactSignature)
      || !verify(null, commentMessage, verifier, globalSignature)) {
    throw new Error('Firma minisign inválida: artefacto o comentario alterado')
  }
}

export function buildUpdaterManifest({ version, repository, tag, artifactsDir, notesFile, publicKey }) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Versión inválida: ${version}`)
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`Repositorio inválido: ${repository}`)
  }
  if (tag !== `v${version}`) throw new Error(`Tag y versión no coinciden: ${tag} / ${version}`)
  if (!publicKey) throw new Error('Falta la clave pública del updater')

  const specs = {
    'windows-x86_64': `BlinkStream_${version}_Win_x64.exe`,
    'darwin-aarch64': `BlinkStream_${version}_macOS_arm64.app.tar.gz`,
    'darwin-x86_64': `BlinkStream_${version}_macOS_x64.app.tar.gz`,
    'linux-x86_64': `BlinkStream_${version}_Linux_x86_64.AppImage`,
  }
  const baseUrl = `https://github.com/${repository}/releases/download/${tag}`
  const platforms = {}

  for (const [platform, artifactName] of Object.entries(specs)) {
    const signaturePath = findFile(artifactsDir, `${artifactName}.sig`)
    const artifactPath = findFile(artifactsDir, artifactName)
    const signature = readFileSync(signaturePath, 'utf8').trim()
    if (!signature) throw new Error(`Firma vacía: ${basename(signaturePath)}`)
    verifyUpdaterArtifact(readFileSync(artifactPath), signature, publicKey)
    platforms[platform] = {
      signature,
      url: `${baseUrl}/${artifactName}`,
    }
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
  const required = ['version', 'repository', 'tag', 'artifacts', 'notes', 'output', 'config']
  for (const name of required) {
    if (!args.get(name)) throw new Error(`Falta --${name}`)
  }

  const artifactsDir = resolve(args.get('artifacts'))
  if (!statSync(artifactsDir).isDirectory()) {
    throw new Error(`No es un directorio: ${artifactsDir}`)
  }
  const config = JSON.parse(readFileSync(resolve(args.get('config')), 'utf8'))
  if (config.version !== args.get('version')) throw new Error('La versión de Tauri no coincide')
  const manifest = buildUpdaterManifest({
    version: args.get('version'),
    repository: args.get('repository'),
    tag: args.get('tag'),
    artifactsDir,
    notesFile: resolve(args.get('notes')),
    publicKey: config.plugins?.updater?.pubkey,
  })
  writeFileSync(resolve(args.get('output')), `${JSON.stringify(manifest, null, 2)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
}
