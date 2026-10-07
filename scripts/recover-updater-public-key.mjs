import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { verifyUpdaterArtifact } from './build-updater-manifest.mjs'

export const PROBE = Buffer.from('BlinkStream updater key recovery probe v1\n')

// Only the public key and an authenticated probe may leave the temporary runner.
export function recoverUpdaterPublicKey({ outputDir, environment = process.env, run = spawnSync }) {
  if (!environment.TAURI_SIGNING_PRIVATE_KEY) throw new Error('Falta el secreto de firma')
  const temporaryDir = mkdtempSync(join(tmpdir(), 'blinkstream-key-recovery-'))
  try {
    const secretFile = join(temporaryDir, 'signer.key')
    const publicFile = join(temporaryDir, 'signer.pub')
    const probeFile = join(temporaryDir, 'probe.txt')
    const signatureFile = `${probeFile}.minisig`
    writeFileSync(secretFile, Buffer.from(environment.TAURI_SIGNING_PRIVATE_KEY.trim(), 'base64'), { mode: 0o600 })
    writeFileSync(probeFile, PROBE)
    const childEnvironment = { ...environment }
    delete childEnvironment.TAURI_SIGNING_PRIVATE_KEY
    delete childEnvironment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD
    const invoke = (args) => {
      const result = run('minisign', args, {
        input: `${environment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? ''}\n`,
        encoding: 'utf8', timeout: 60000, env: childEnvironment,
      })
      // Never forward tool output: it ran with private material.
      if (result.error || result.status !== 0) throw new Error('Minisign no pudo recuperar/verificar el firmante; revisar formato y contraseña del secreto')
    }
    invoke(['-R', '-s', secretFile, '-p', publicFile])
    invoke(['-S', '-s', secretFile, '-m', probeFile, '-x', signatureFile])
    const publicKey = Buffer.from(readFileSync(publicFile, 'utf8')).toString('base64')
    const signature = Buffer.from(readFileSync(signatureFile, 'utf8')).toString('base64')
    verifyUpdaterArtifact(PROBE, signature, publicKey)
    const output = resolve(outputDir)
    mkdirSync(output, { recursive: true })
    writeFileSync(join(output, 'updater.pub'), publicKey)
    writeFileSync(join(output, 'probe.txt'), PROBE)
    writeFileSync(join(output, 'probe.txt.sig'), signature)
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2]) throw new Error('Falta el directorio público de salida')
    recoverUpdaterPublicKey({ outputDir: process.argv[2] })
    console.log('Clave pública recuperada y prueba criptográfica verificada; ningún secreto exportado.')
  } catch {
    console.error('Recuperación fallida. Revisar disponibilidad, formato y contraseña del secreto en GitHub.')
    process.exitCode = 1
  }
}
