import { mkdirSync, copyFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const stage = resolve(root, 'src-tauri/target/msix/sandbox-test')
const network = process.argv.includes('--network')
if (process.argv.slice(2).some(arg => arg !== '--network')) throw new Error('Only --network is supported; requires explicit user authorization')
const stamp = Date.now()
const input = resolve(stage, `input-${stamp}`), report = resolve(stage, `report-${stamp}`)
const sdk = 'C:/Program Files (x86)/Windows Kits/10/bin/10.0.26100.0/x64/signtool.exe'
const metadata = JSON.parse(readFileSync(resolve(root, 'src-tauri/target/msix/candidate.json'), 'utf8').replace(/^\uFEFF/, ''))
const version = metadata.version
if (!/^\d+\.\d+\.\d+\.0$/.test(version)) throw new Error('Invalid MSIX candidate version')
const candidate = readFileSync(resolve(root, `src-tauri/target/msix/BlinkStream_${version}_x64.msix`))
if (!/^[a-f0-9]{64}$/i.test(metadata.sha256 ?? '') || candidate.length !== metadata.bytes || createHash('sha256').update(candidate).digest('hex') !== metadata.sha256.toLowerCase()) throw new Error('Candidate hash/size mismatch; rebuild before testing')
if (!existsSync(sdk)) throw new Error('Windows SDK SignTool not found')
mkdirSync(input, { recursive: true }); mkdirSync(report, { recursive: true })
for (const [source, name] of [
  [resolve(root, `src-tauri/target/msix/BlinkStream_${version}_x64.msix`), 'candidate.msix'],
  [resolve(root, 'src-tauri/msix/identity.json'), 'identity.json'],
  [resolve(root, 'src-tauri/target/msix/candidate.json'), 'candidate.json'],
  [resolve(root, 'scripts/sandbox-msix-test.ps1'), 'test.ps1'],
  [resolve(root, 'scripts/sandbox-open-app.ps1'), 'open-app.ps1'],
  [resolve(root, 'scripts/sandbox-runtime-context.ps1'), 'context.ps1'],
  [sdk, 'signtool.exe'],
]) copyFileSync(source, resolve(input, name))
if (network) {
  copyFileSync(resolve(root, 'src-tauri/target/msix/winsdksetup.exe'), resolve(input, 'winsdksetup.exe'))
  copyFileSync(resolve(root, 'scripts/sandbox-msix-sdk.ps1'), resolve(input, 'sdk.ps1'))
  copyFileSync(resolve(root, 'scripts/sandbox-wack-installed.ps1'), resolve(input, 'wack.ps1'))
  copyFileSync(resolve(root, 'scripts/sandbox-webview2-context.ps1'), resolve(input, 'webview-context.ps1'))
  copyFileSync(resolve(root, 'scripts/sandbox-sdk-progress.ps1'), resolve(input, 'sdk-progress.ps1'))
}
writeFileSync(resolve(input, 'sandbox-only.marker'), 'Guest-only MSIX installation test; never run on host Windows.\n')
writeFileSync(resolve(input, 'test-config.json'), JSON.stringify({ network: network ? 'authorized-enabled' : 'disabled' }))
const xml = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
const config = `<Configuration>
 <VGpu>Disable</VGpu><Networking>${network ? 'Enable' : 'Disable'}</Networking><MemoryInMB>4096</MemoryInMB>
 <ClipboardRedirection>Disable</ClipboardRedirection><AudioInput>Disable</AudioInput><VideoInput>Disable</VideoInput><PrinterRedirection>Disable</PrinterRedirection>
 <MappedFolders>
  <MappedFolder><HostFolder>${xml(input)}</HostFolder><SandboxFolder>C:\\BlinkStreamInput</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
  <MappedFolder><HostFolder>${xml(report)}</HostFolder><SandboxFolder>C:\\BlinkStreamReport</SandboxFolder><ReadOnly>false</ReadOnly></MappedFolder>
 </MappedFolders>
 <LogonCommand><Command>powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File C:\\BlinkStreamInput\\test.ps1</Command></LogonCommand>
</Configuration>\n`
const path = resolve(stage, 'BlinkStream-install-test.wsb')
writeFileSync(path, config)
console.log(JSON.stringify({ config: path, input, report: resolve(report, 'result.json'), network, hostChanges: 'files only; no certificates or app installed' }))
