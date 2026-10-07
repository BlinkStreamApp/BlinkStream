import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

export function normalizeSigningEnvironment(environment) {
  const encoded = environment.TAURI_SIGNING_PRIVATE_KEY
  if (!encoded) throw new Error('Falta el secreto de firma del updater')
  const normalized = encoded.replace(/[ \t\r\n]/g, '')
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
      || Buffer.from(normalized, 'base64').toString('base64') !== normalized) {
    throw new Error('El secreto de firma no tiene un formato Base64 válido')
  }
  // Passwords are opaque: never trim them or write credentials to GITHUB_ENV/logs.
  return { ...environment, TAURI_SIGNING_PRIVATE_KEY: normalized }
}

export function buildSignedRelease(args, { environment = process.env, run = spawnSync } = {}) {
  const env = normalizeSigningEnvironment(environment)
  const cli = fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url))
  const result = run(process.execPath, [cli, 'build', '--config',
    'src-tauri/tauri.release.conf.json', ...args], { env, stdio: 'inherit' })
  if (result.error) throw new Error('No se pudo iniciar el build firmado')
  return result.status ?? 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = buildSignedRelease(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
