# Auto-updater verification

Hotfix candidate: 1.4.3 (2026-10-08), publication authorized; CI and public-artifact
verification pending. Trust/endpoint are unchanged. The evidence below is for the
published 1.4.2 and must not be confused with proof of the new candidate.

Checked: 2026-10-07. Source/published/latest: 1.4.2.
Verdict: **release and live updater manifest verified; Windows installer/restart tested; historical GUI upgrade remains limited**.

## Verified flow

- `App.jsx` checks once shortly after startup; `AboutDialog.jsx` supports a manual check.
- Installation requires user confirmation/action, calls `downloadAndInstall`, then relaunches.
- Native updater plugin, restart permission and HTTPS manifest endpoint are configured.
- Tauri verifies the downloaded artifact against the configured public key before installation.
- The configured HTTPS endpoint responds with version 1.4.2 and four platform entries.
  Downloaded published artifacts verify with the unchanged configured public key, including all
  detached signatures (NSIS/MSI, AppImage/deb and both macOS update archives).
  Release and master manifests match. Nothing was installed/executed on the user's PC.
- Windows uses NSIS, macOS uses `.app.tar.gz`, Linux uses `.AppImage`.
  The installed Tauri updater accepts raw AppImage bytes as well as the archive format.
  Linux `.deb` installations need manual/package-manager updates; the integrated updater targets
  [AppImage](https://v2.tauri.app/plugin/updater/).
- Four UI contract tests simulate no-update, check failure, explicit installation and rejected
  signature/installation; they verify no premature download/relaunch and no relaunch on failure.
- Local 1.4.2 checks: 514 frontend tests pass/1 skipped, 11 release/security tests, 56 Rust tests,
  lint/fmt/Clippy pass. Compilation is checked separately; no real installation was attempted.

## Current signer and historical incompatibility

Minisign key IDs below are public identifiers, in their encoded byte order:

- Current configured public key: `44fc384bdb89207e`.
- Published manifest signatures, all four platforms: `ecee98e9ce6f7203`.
- Neither the current key nor the public key read from tag v1.4.1 matched the Windows signature key ID.
  Ed25519 artifact and trusted-comment verification both returned false with both keys.
- The Windows NSIS/MSI artifacts from successful CI run `33440160727` (commit `baeb7f5`,
  after the public-key change) also carry signer ID `ecee98e9ce6f7203`. The new verifier
  rejects them against the configured key. They were downloaded to a temporary directory,
  never executed or installed. The historical public-key fix did not establish compatibility.

The successful [public-key diagnostic](https://github.com/BlinkStreamApp/BlinkStream/actions/runs/37668124715)
reconstructed the existing public key from `TAURI_PRIVATE_KEY` inside CI. The raw public key
exactly equals the configured key (`44fc384bdb89207e`), and its signed probe verifies with the
app's existing configuration. No key/config/secret rotation was needed. The private value was
never downloaded, displayed or uploaded; only public evidence was retrieved.

This confirms the **current** signer/config pair, not the incompatible historical artifacts.
The old CI portable executable also contains the current configured key while its NSIS/MSI
signatures carry a different ID. Do not reuse historical signatures or infer that all binaries
with the same version have identical trust. Existing installations must be checked individually;
clients trusting an unavailable older key need a verified manual transition installation.

Do not fabricate signatures, silently rotate trust or disable verification. The new artifact gate
will verify actual platform binaries once CI builds them. A signed probe alone is not a complete
check/download/install/relaunch test and does not prove historical upgrade compatibility.

The user no longer has the local signing files. A manual-only workflow,
`updater-key-check.yml`, can reconstruct **only the existing public key** using official
[Minisign `-R`](https://jedisct1.github.io/minisign/). It verifies a signed probe before uploading
an explicit three-file allowlist (public key, probe and signature). The private key is decoded
only into a mode-0600 temporary file on the runner, removed in `finally`, never logged or uploaded.
No new key is generated and no repository secret is modified. Recovery is not a trust migration:
comparison confirmed current configured trust, not acceptance by every historical installed client.
Run it with `gh workflow run updater-key-check.yml`; it does not publish a release.
The diagnostic bootstraps pinned Minisign 0.12 from its official archive, verifying its upstream
signature before extracting/executing it. This avoids an observed APT installation stall.

## Pipeline review

- Pushes to master build and cryptographically verify all four platform artifacts without publishing.
  Missing/duplicate binaries or signatures, wrong key IDs, invalid artifact/comment signatures and
  tag/config version mismatches stop manifest generation. The tests include an independent
  `minisign-verify` upstream vector, not just signatures generated by the test itself.
- Builds, notes and initial config come from the triggering commit/tag, not current master.
- Only after every platform passes does a tag run stage a complete draft release, publish it,
  then commit the manifest consumed at the raw master endpoint. A pre-publication check rejects
  master version/trust changes. If the final Git push fails, the old manifest remains in place;
  release publication and a Git commit are not a cross-service atomic transaction.
- Removed the standalone portable executable misleadingly named `Custom Setup` from future bundles.
- Signing keys, production manifest and external secrets have not been changed.
- The build wrapper removes only whitespace around/wrapping the outer Base64 signing secret.
  Tauri previously rejected a newline (symbol 10 at offset 348); the key bytes and password
  remain unchanged and never enter command-line arguments or logs.
- Linux setup replaces the stalled Azure HTTP mirror with Ubuntu's official HTTPS archive;
  repository signature checks remain active, with bounded network retries/timeouts.
- Windows CI verifies the newly signed installer before executing it on a disposable runner,
  installs into a unique runner-temp path, checks the version, then reinstalls with the actual
  Tauri passive flags `/P /R /UPDATE`, then requires the installed process to restart.
  This is installer-mode validation, not proof of historical
  key migration, user settings persistence or a complete GUI check/download/relaunch flow.

## Published release evidence and follow-ups

Five of the original six Dependabot findings are fixed in source: rustls `0.23.45`,
source-map-js `1.2.2`, brace-expansion `5.0.12`, vitest/@vitest/mocker `4.1.11`.
The local npm audit found one additional nanoid advisory; nanoid is now `3.3.18`.
`pnpm audit` reports zero vulnerabilities. GitHub closed the first five patched findings and,
after the local GLib backport, also marked alert #2 fixed. No findings remain open; no alert was
manually dismissed. This does not mean the registry's original GLib 0.18.5 is fixed.

GLib `0.18.5` is required by Tauri/GTK/WebKit on Linux. Its
[upstream advisory](https://github.com/advisories/GHSA-wrw7-89jp-8q8g) is fixed from `0.20.0`,
but current GTK3 crates require the incompatible `0.18` family. No direct application use of
`VariantStrIter` was found; that is not proof of absence in transitive paths. It is not in the
Windows target tree. Do not hide the alert or force a second unrelated GLib version as a fake fix.
The registry package is now vendored with exactly the two-line upstream fix from
[gtk-rs-core#1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343), without a fake version change.
The source-tree integrity gate passes. Linux CI passed both iteration regressions in debug and
optimized release mode, 57 native unit tests, frontend/lint/build, strict Clippy and 44 Deno tests.
The actual GTK/Tauri AppImage/deb builds also pass.
See [ADR-014](../decisions/ADR-014-glib-gtk3-security-backport.md).
Other scanners may still flag the old version label rather than the patched code.

The signed candidate at `2bd66ec` passed every job in
[CI 37675590056](https://github.com/BlinkStreamApp/BlinkStream/actions/runs/37675590056), including
Windows install/reinstall/process-restart smoke, both macOS targets, Linux AppImage/deb and the
four-artifact signature/manifest gate. Downloaded candidate binaries also passed local verification
against the configured key without executing any installer on the user's PC.
The runner's `/etc/apt/apt-mirrors.txt` URI now resolves directly to the official HTTPS archive;
this was the remaining APT timeout cause. Signing secrets exist only in bundle-building steps.
The public-key diagnostic `37668124715` succeeded using the verified official utility.
Tag `v1.4.2` at `c53c209` passed every job in
[release CI 37678585652](https://github.com/BlinkStreamApp/BlinkStream/actions/runs/37678585652).
The public release is latest/non-prerelease, with all 15 assets; the live updater endpoint is 1.4.2.
Downloaded public release bytes/signatures were rechecked locally after publication and agree
with master. No candidate or published installer was executed on the user's PC.

Read-only inspection of the maintainer's installed Windows executable reports product version
1.4.1 and contains the current encoded public key. This is compatibility evidence, not proof of
a GUI check/download/install/relaunch or session persistence on that installation.

1. Current signer/config pair is verified. Verify newly built real artifacts and inventory installed-client trust;
   document a manual transition for incompatible clients before promising automatic upgrade.
2. Run frontend/lint, Rust fmt/Clippy/tests, release-manifest tests and CI.
3. Build signed platform artifacts from the intended tag; match manifest URLs and signatures.
4. Verify artifact and manifest availability before exposing the release as latest.
5. Installer-mode install/reinstall/restart is verified on a disposable Windows runner.
   A full GUI historical upgrade, authenticated settings/session persistence and upgrade during an
   active recording are separate unverified scenarios; do not infer them from this smoke test.

The user explicitly authorized publication of 1.4.2 after validation on all three platforms,
but not installing anything on their PC. A source push alone is not release validation.

## Delivery rollback

If a critical post-release regression appears, withdraw 1.4.2 from the updater by restoring the
previous production manifest, mark the release draft and restore the previous latest release.
This stops offering the update; it does not downgrade installed clients. Preserve the current
public key and security fixes: never fabricate signatures, bypass verification or revert the
GLib backport merely to hide an alert. Historical signing incompatibility remains a known limit.
