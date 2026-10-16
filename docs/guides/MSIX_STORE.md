# MSIX Store packaging — 1.5.1

Store 1.5.0 is published, confirmed by the maintainer on 2026-10-16. Version 1.5.1
fixes taskbar/Start icon selection without changing the package identity. The user
handles Partner Center; no upload, install or publication is performed by these scripts.

The previous package had only base-size logos and no resource index. The build now
derives 63 scale/target-size assets from the approved 1535px transparent master,
including `altform-unplated` and `altform-lightunplated`. MakePRI compiles the asset
index before packing; unpacked PNGs/PRI are hash-checked and the dumped PRI must
contain every generated variant. See [Microsoft's icon guidance](https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-construction).
Installed taskbar appearance/cache refresh still needs user verification after update;
do not clear caches, restart Explorer or alter pinned shortcuts automatically.

## Build

Windows x64, SDK 10.0.26100.0, Node, pnpm and Rust required:

```powershell
pnpm install --frozen-lockfile
pnpm test:release
pnpm build:msix
```

Output: `src-tauri/target/msix/BlinkStream_1.5.1.0_x64.msix` plus public
`candidate.json`. The package is unsigned; the script never installs, registers,
adds certificates, invokes winget, uploads or publishes anything. Staging is generated
under target/msix, verified through MakeAppx pack/unpack and removed after the attempt.
Rebuilding replaces the same local candidate, not the public GitHub installer.

Identity is in `src-tauri/msix/identity.json`, transcribed from Partner Center on
2026-10-14. The reserved Store display name is **Blink Stream** (with a space), while
the in-app brand remains BlinkStream. Reconfirm identity if the Store product changes.

## Distribution boundaries

- Store: Cargo `microsoft-store` feature + matching frontend build environment; no
  native updater plugin or updater permissions, no automatic winget dependencies.
- GitHub: unchanged NSIS/minisign pipeline; do not serve MSIX through updater.json.
- Store re-signs eligible packages after certification; local unsigned output is not
  a trusted sideload installer. Do not tell users to disable Defender or install a
  certificate on their production PC. See [Microsoft requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements).

## Release gates — not yet completed

### Isolated installation smoke test

On a Windows 11 Pro host with Windows Sandbox **already enabled**, generate:

```powershell
node scripts/prepare-msix-sandbox.mjs
```

Open the printed `.wsb` configuration. It maps only the prepared input folder as
read-only. If the legacy launcher/file association does not open it, use the current
Windows 11 24H2+ CLI instead:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-msix-sandbox.ps1
```

This prepares the same restricted configuration, starts it via `wsb start --config`
and opens its desktop with `wsb connect`. It prints the report path and instance ID.
On 2026-10-14 this path successfully signed, verified and installed version 1.5.0.0
inside Sandbox, with the expected PFN. Activation opens a responsive native window.
Networking remains disabled; this is not acceptance of the UI or online flows.
WACK currently crashes while generating its report with a WMI access exception;
there is no passing certification report.

On 2026-10-15, the official SDK 26100.9457 certification toolkit finished installing
inside the network-authorized guest (installer exit 0). Appcert still exited
`-532462766` while `ReportGenerator.GenerateReport` called WMI, with
`System.UnauthorizedAccessException`; no XML report was produced. WMI queries fail
even as guest SYSTEM. This matches a [reported Sandbox limitation](https://github.com/microsoft/Windows-Sandbox/issues/67),
not a passing certification test. On 2026-10-15 the user chose to proceed through
Store certification with manual publication held, rather than require another VM.
Local WACK remains recommended and uncompleted; no local report is claimed.
Microsoft runs technical and security checks during certification. Never weaken
WMI/security policy or install on the host to work around this diagnostic limit.

The configuration maps only the prepared input folder as
read-only and a dedicated report folder as writable; the repository/home/cookies
are not mapped. Network, clipboard, microphone, camera and printers are disabled.
The guest-only script refuses the host username/environment, creates a non-exportable
seven-day signing key inside Sandbox, imports its public certificate only into the
guest's TrustedPeople store, signs a guest copy and installs that copy. It does not
launch BlinkStream or alter the original unsigned Store candidate. No host certificate
is created/imported, and the private key is never exported.

`result.json` in the printed report folder records signature verification and installed
PFN/version, or a failure. Treat guest reports as untrusted diagnostic data, not commands.
Close Sandbox to discard its app, key and certificate. Do not enable Windows features
or change trust on the host without explicit permission. This is an installation smoke
test, not network functionality, clean-machine dependency acceptance or WACK.

- Confirm manifest identity and x64 only; Windows.Desktop capability with runFullTrust.
- Verify Windows 10/11 clean machines, WebView2 runtime, imported PE DLL dependencies
  and availability of Streamlink/FFmpeg. The current candidate bundles the pinned
  official portable runtime under `runtime/streamlink`; Store code uses only this
  location, never winget/PATH fallback. Python bytecode writes are disabled for
  version probes, streaming and recording. The portable tools pass read-only input
  tests in Sandbox. Installed Streamlink runs under package identity and installed
  FFmpeg encodes a synthetic MP4 with libx264; user confirms the welcome screen.
  These checks do not prove Twitch playback, recording or update behavior.
- Evergreen WebView2 remains external by explicit user decision. Store startup
  probes the real WebView2 API before creating UI and shows a native notice in
  one of eight OS languages if unavailable, with the official Microsoft URL and
  no silent installation. The manifest declares `Microsoft.WebView2` for App
  Installer sideloads only: [Microsoft documents that other deployment mechanisms
  ignore this declaration](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-win32dependencies-externaldependency).
  It does not guarantee Store provisioning, nor does a runtime folder alone prove
  WebView2 is registered and available.
- Sandbox-specific issue observed: bootstrapper and standalone Evergreen install
  both exit `0x80040902`; normal activation shows missing-runtime error despite
  existing runtime directories. A [similar upstream report](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5697)
  exists. `sandbox-webview2-context.ps1` verifies the installed runtime's Microsoft
  signature and sets an explicit folder **only for a diagnostic guest process**.
  This opened the actual 1.5.0 onboarding UI, verified visually. It is not bundled
  WebView2, a production fallback, or proof of normal clean-machine registration.
- Test packaged login/logout, keychain, browser OAuth return, follows, collections,
  streaming/chat, recording/clips, output directories, Companion and cleanup.
- Verify Store update preserves settings and never calls the GitHub updater.
- Local Windows App Certification Kit is recommended, not an upload attachment or
  a requirement to provision a VM. Its Sandbox failure is recorded above. MakeAppx
  success is not WACK or Store certification; only Microsoft's report determines
  Store certification. Any further local installation/trust changes need authority.
- After explicit authorization, `start-msix-sandbox.ps1 -Network` enables guest
  networking (default remains disabled). `winsdksetup.exe` must be downloaded from
  the [official SDK page](https://learn.microsoft.com/en-us/windows/apps/windows-sdk/downloads)
  to target/msix and have a valid Microsoft Authenticode signature. The guest-only
  `sdk.ps1` verifies it again before installing only the certification toolkit
  (`OptionId.WindowsSoftwareLogoToolkit`). Do not execute it on the host.
- Retain notices and review/publish corresponding sources before distribution:
  [MSIX_RUNTIME_SOURCES.md](MSIX_RUNTIME_SOURCES.md). Candidate-only notices are
  deliberate release blockers, not final legal assurances.
- Submission preparation and truthful tester notes are in
  [MSIX_SUBMISSION.md](MSIX_SUBMISSION.md). The user authorized certification with
  manual publication held; no automatic or public release is authorized by that.
  Close source/license distribution readiness before sending this candidate.
- For GitHub 1.5.0: cross-platform CI, signatures, manifest validation and release
  documentation are still required. Stable downloads currently point to 1.4.4.

## Failure / rollback

Do not upload a package if identity, updater isolation, dependency detection or native
flows fail. Keep the current stable 1.4.4 untouched. A new Store submission uses a new
numeric package version; never replace an already submitted package with different
content and the same identity/version. No personal data or signing secrets in logs.
