# Auto-updater verification

Checked: 2026-10-07. Source: 1.4.2. Published: 1.4.1.
Verdict: **not release-ready — signing continuity is unresolved**.

## Verified flow

- `App.jsx` checks once shortly after startup; `AboutDialog.jsx` supports a manual check.
- Installation requires user confirmation/action, calls `downloadAndInstall`, then relaunches.
- Native updater plugin, restart permission and HTTPS manifest endpoint are configured.
- Tauri verifies the downloaded artifact against the configured public key before installation.
- The endpoint responds with version 1.4.1 and four platform entries whose assets exist in the release.
  The Windows installer was downloaded only into memory for verification, not run or installed.
- Windows uses NSIS, macOS uses `.app.tar.gz`, Linux uses `.AppImage`.
  The installed Tauri updater accepts raw AppImage bytes as well as the archive format.
- Four UI contract tests simulate no-update, check failure, explicit installation and rejected
  signature/installation; they verify no premature download/relaunch and no relaunch on failure.
- Local 1.4.2 checks: 513 frontend tests pass/1 skipped, 4 manifest tests, 56 Rust tests,
  lint/fmt/Clippy pass. Compilation is checked separately; no real installation was attempted.

## Signing blocker

Minisign key IDs below are public identifiers, in their encoded byte order:

- Current configured public key: `44fc384bdb89207e`.
- Published manifest signatures, all four platforms: `ecee98e9ce6f7203`.
- Neither the current key nor the public key read from tag v1.4.1 matched the Windows signature key ID.
  Ed25519 artifact and trusted-comment verification both returned false with both keys.

GitHub lists `TAURI_PRIVATE_KEY` as a repository secret. Its value was not accessed;
presence does not prove it matches installed trust. The optional password secret is not listed,
which matters only if the signing key requires a password.

Do not fabricate signatures, silently rotate trust or disable verification. Identify/recover the
production signing key and trusted public key, then establish which installed versions accept it.
If recovery is impossible, document a verified manual migration instead of promising automatic upgrade.

## Pipeline review

- Pushes to master run quality/build jobs; tag pushes publish assets and the updater manifest.
- The final manifest job checks out master, not the tag: concurrent changes could supply unrelated notes.
  Uploading the manifest to release assets is disabled; clients consume the raw master manifest
  committed by the workflow bot.
- Platform jobs publish assets separately; partial release exposure and manifest availability are not
  atomic. Never update `updater.json` to 1.4.2 without actual signed assets.
- This review did not change signing keys, production manifest, workflow or external secrets.

## Before a release

1. Resolve signing continuity; verify a real artifact using the key trusted by installed clients.
2. Run frontend/lint, Rust fmt/Clippy/tests, release-manifest tests and CI.
3. Build signed platform artifacts from the intended tag; match manifest URLs and signatures.
4. Verify artifact and manifest availability before exposing the release as latest.
5. Test check/download/verification/install/relaunch and settings persistence in a disposable installation.

A source push does not authorize a release tag or installing an update.
