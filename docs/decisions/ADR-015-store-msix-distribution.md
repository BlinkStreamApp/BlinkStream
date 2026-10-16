# ADR-015: Separate Microsoft Store MSIX distribution

Status: Accepted
Date: 2026-10-14

## Context

The user chose MSIX after the Store EXE/MSI signing rejection. Source 1.5.0
includes locally accepted features; public GitHub stable remains 1.4.4.
The reserved Store product is Blink Stream, with the identity recorded in
`src-tauri/msix/identity.json`. Microsoft re-signing of Store packages does not
replace security review or guarantee acceptance.

## Decision

Build a Windows x64 packaged classic app using Tauri custom-protocol and the
`microsoft-store` Cargo feature. Generate the manifest/profile and use the SDK
MakeAppx pack/unpack validation. No installer capture or machine installation.
The Store profile removes native/IPC/GitHub updater access and prevents automatic
winget installation. GitHub NSIS remains a separate distribution authority.
Bundle the SHA256-pinned official Streamlink portable runtime (including Python and
FFmpeg), retaining notices and preparing corresponding sources separately. The user
chose external Evergreen WebView2, not a fixed bundled browser. Probe it before UI
creation and present a native OS-language notice if absent; no automatic app-side
installation or production browser-folder override.

## Consequences

- Reproducible local candidate generation without a paid signing certificate.
- No competing updater inside the MSIX edition; GitHub users retain existing behavior.
- Bundled Streamlink/FFmpeg and external Evergreen WebView2 remain explicit gates;
  review licenses/corresponding sources before redistribution. App Installer's
  external dependency declaration helps sideloads but does not provision WebView2
  through Store, Add-AppxPackage or WACK.
- Installation/update/session tests, WACK and Store approval remain pending.
- See `docs/guides/MSIX_STORE.md` for commands, boundaries and rollback.
