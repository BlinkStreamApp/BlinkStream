import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

export function publisherId(publisher) {
  const digest = createHash('sha256').update(publisher, 'utf16le').digest().subarray(0, 8)
  const bits = [...digest].map(byte => byte.toString(2).padStart(8, '0')).join('') + '0'
  return Array.from({ length: 13 }, (_, index) => '0123456789abcdefghjkmnpqrstvwxyz'[parseInt(bits.slice(index * 5, index * 5 + 5), 2)]).join('')
}

export function packageVersion(version) {
  if (!/^[1-9]\d*\.\d+\.\d+$/.test(version) || version.split('.').some(part => Number(part) > 65535)) throw new Error('MSIX requires a stable numeric version within 0–65535')
  return `${version}.0`
}
const xml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character])

export function manifest(identity, version) {
  if (!/^[A-Za-z0-9.-]{3,50}$/.test(identity.name) || !/^CN=[\w-]+$/.test(identity.publisher)) throw new Error('Invalid Store identity')
  if (!identity.displayName || !identity.publisherDisplayName) throw new Error('Missing Store display names')
  if (identity.packageFamilyName !== `${identity.name}_${publisherId(identity.publisher)}`) throw new Error('Publisher does not match the Partner Center package family')
  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
 xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
 xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
 xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
 xmlns:win32dependencies="http://schemas.microsoft.com/appx/manifest/externaldependencies"
 IgnorableNamespaces="uap uap10 rescap win32dependencies">
 <Identity Name="${xml(identity.name)}" Publisher="${xml(identity.publisher)}" Version="${packageVersion(version)}" ProcessorArchitecture="x64" />
 <Properties><DisplayName>${xml(identity.displayName)}</DisplayName><PublisherDisplayName>${xml(identity.publisherDisplayName)}</PublisherDisplayName><Description>BlinkStream desktop streaming client</Description><Logo>Assets\\StoreLogo.png</Logo></Properties>
 <Resources>${['es-ES', 'en-US', 'fr-FR', 'de-DE', 'pt-BR', 'ja-JP', 'ko-KR', 'ru-RU'].map(language => `<Resource Language="${language}" />`).join('')}</Resources>
 <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" />
  <win32dependencies:ExternalDependency Name="Microsoft.WebView2" Publisher="CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US" MinVersion="1.1.1.1" Optional="false" />
 </Dependencies>
 <Applications><Application Id="BlinkStream" Executable="blinkstream.exe" uap10:RuntimeBehavior="packagedClassicApp" uap10:TrustLevel="mediumIL">
  <uap:VisualElements DisplayName="${xml(identity.displayName)}" Description="BlinkStream desktop streaming client" Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png" BackgroundColor="transparent" />
 </Application></Applications>
 <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>
`
}

export function storeProfile(capability) {
  if (capability.remote || !capability.webviews?.includes('main')) throw new Error('Unexpected native capability scope')
  return {
    bundle: { active: false, createUpdaterArtifacts: false },
    app: { security: { capabilities: [{ ...capability, identifier: 'store', description: 'Store build: no external updater', permissions: capability.permissions.filter(permission => !permission.startsWith('updater:')) }] } },
    plugins: { updater: null },
  }
}

export function prepare(stage, root) {
  const readJSON = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
  const version = readJSON('package.json').version
  const identity = readJSON('src-tauri/msix/identity.json')
  const packageDir = resolve(stage, 'Package')
  mkdirSync(resolve(packageDir, 'Assets'), { recursive: true })
  writeFileSync(resolve(stage, 'icon-assets.json'), JSON.stringify(storeIconAssets(), null, 2))
  writeFileSync(resolve(stage, 'priconfig.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources targetOsVersion="10.0.0" majorVersion="1"><index root="\\" startIndexAt="\\">
<default><qualifier name="Language" value="en-US"/><qualifier name="Scale" value="100"/><qualifier name="Contrast" value="standard"/></default>
<indexer-config type="folder" foldernameAsQualifier="true" filenameAsQualifier="true" qualifierDelimiter="."/>
</index></resources>`)
  for (const [name, size] of [['StoreLogo.png', 50], ['Square150x150Logo.png', 150], ['Square44x44Logo.png', 44]]) {
    const source = resolve(root, 'src-tauri/icons', name)
    const bytes = readFileSync(source)
    if (bytes.readUInt32BE(16) !== size || bytes.readUInt32BE(20) !== size) throw new Error(`Invalid icon dimensions: ${name}`)
    copyFileSync(source, resolve(packageDir, 'Assets', name))
  }
  writeFileSync(resolve(packageDir, 'AppxManifest.xml'), manifest(identity, version))
  copyFileSync(resolve(root, 'src-tauri/msix/THIRD_PARTY.txt'), resolve(packageDir, 'THIRD_PARTY.txt'))
  writeFileSync(resolve(stage, 'tauri.store.json'), JSON.stringify(storeProfile(readJSON('src-tauri/capabilities/default.json')), null, 2))
  writeFileSync(resolve(stage, 'candidate.json'), JSON.stringify({ version: packageVersion(version), identity, channel: 'microsoft-store', status: 'unsigned candidate; certification pending' }, null, 2))
}

export function storeIconAssets() {
  const targets = [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256]
  const assets = targets.flatMap(size => ['', '_altform-unplated', '_altform-lightunplated'].map(theme => ({ name: `Square44x44Logo.targetsize-${size}${theme}.png`, size })))
  for (const [name, base] of [['Square44x44Logo', 44], ['Square150x150Logo', 150], ['StoreLogo', 50]]) {
    for (const scale of [100, 125, 150, 200, 250, 300, 400]) assets.push({ name: `${name}.scale-${scale}.png`, size: Math.round(base * scale / 100) })
  }
  return assets
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/msix.mjs <staging-directory>')
  prepare(resolve(process.argv[2]), resolve(dirname(fileURLToPath(import.meta.url)), '..'))
}
