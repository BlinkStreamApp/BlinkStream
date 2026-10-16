# Readiness — BlinkStream 1.5.2

Reviewed: 2026-10-17 (Europe/Madrid)
Status: local verification passed; signed cross-platform CI and distribution gates pending.

## Scope and result

Reviewed the complete working-tree release diff, including new untracked search
components/tests. No blocking application regression identified in the reviewed
changes. This is not a guarantee that every runtime/service/platform is bug-free.
The user accepted the translated candidate before this review.

Search remains literal, bounded to the existing 500 retained messages, in memory,
and independent of the unified send destination. Tests cover combined filters,
moderation removal including queued messages, session/source reset, bot/mention
filters, focus restoration, and language switches without reconnecting or losing drafts.
No production auth, IPC, CSP, updater key, dependencies or native code changed.

## Checks performed

- Frontend: 59 files, 730 tests passed, one existing skipped test; full ESLint passed.
- Release/metadata/MSIX/manifest documentation: 31 tests passed; diff whitespace check passed.
- Rust: format and Clippy all-targets/all-features with warnings denied passed.
  Default GitHub profile: 60 tests passed. Store profile: 61 tests passed.
  Linux-only optimized GLib test does not execute on Windows; CI remains required.
- Security regression scripts: Companion 2, refresh 2, OAuth 16 passed with synthetic inputs.
  No Edge Function deployment or real-account login was performed.
- Current dependency checks: pnpm production audit reported no known vulnerabilities;
  OSV checked 565 registry Rust packages and reported no vulnerabilities. Six
  transitive packages have informational unmaintained notices; local vendored GLib
  is excluded from OSV and covered separately by release regression checks.
- Browser: 66 checks passed, findings empty; individual/unified, eight languages,
  widths 280/320/390/700 and compact 320×400. Isolated Chrome, simulated messages
  and sockets, external requests blocked; not a live Twitch/WebView2 playback test.
  Russian screenshot visually inspected. Report: ignored `scratch/chat-search-browser-report.json`.
- Windows standalone Tauri production build passed (not launched or installed).
- MSIX production Store build, MakePRI indexing/dump, MakeAppx pack/unpack and
  executable/manifest/63 icon/PRI/runtime hash verification passed.
- Public login confirmation and official privacy page both returned HTTP 200.
  Independent `auth` Pages and OAuth redirects remain unchanged.

The first sandboxed native test was denied a temporary-file rename; the identical
suite passed outside the sandbox. The first browser attempt could not connect
across sandbox loopback; the full run passed with server/browser in the same context.
These failures were not suppressed or counted as passing evidence.

## Exact Store candidate

- File: `src-tauri/target/msix/BlinkStream_1.5.2.0_x64.msix`
- Bytes: 94,721,474
- SHA256: `4AA3F112961F2C013488304B70C7FDC2F0252FA9610FC3A48289E2DFFD3AD46E`
- Official package identity/PFN unchanged; no extra capabilities.
- Unsigned local candidate. Not installed, uploaded, certified or published.
- Runtime unchanged; retain the existing 1.5.0 source companion, do not duplicate it.

## Corrections during review

- Recorded user acceptance in repository roadmap/execution plan.
- Removed the retired marketing website's milestone parity requirement from
  release tests; new release versions no longer require an archived site update.
  APX Studio is the only commercial website. Login confirmation is an explicit exception.

## Remaining gates

1. Commit/push and run signed four-target CI, Windows installer smoke and updater
   manifest verification on the exact candidate SHA. Then tag/publish and independently
   verify public signatures/hashes before changing stable download links.
2. Update and verify only the APX Studio website for publication; SSH deployment
   remains with the maintainer. No website deployment was performed here.
3. For Store distribution, close the documented corresponding-source/license
   review and persistent recipient access for bundled GPL runtime sources
   (`MSIX_RUNTIME_SOURCES.md`). Local source preparation does not prove public access;
   the current GitHub 1.5.1 release has no runtime-source companion asset.
4. New MSIX has no fresh installed end-to-end acceptance or WACK report. Previous
   user acceptance/Store certification is not certification of this new package.
   Partner Center and publication remain the maintainer's responsibility.

No commit, push, tag, release, remote cleanup, host installation or cloud deployment
was performed during this review. Stable GitHub/Store version remains 1.5.1.
