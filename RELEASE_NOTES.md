# BlinkStream 1.4.2 — Twitch reliability and integrated Drops

Date: 2026-10-07.

## Drops in one window

- Native progress and official Twitch inventory share the Drops panel without a separate claim window.
  Twitch integrity checks and game-account linkage requirements remain in the official flow.
- Session-scoped mounting, timeouts, resize and close cleanup protect reopened panels from stale views.
  Native visibility is reconciled after mounting and when another dialog changes visibility.
- Unconfirmed claims persistently pause Auto-Claim rather than repeatedly opening the inventory.
  Authoritative inventory reads reconcile successful claims and clear stale close errors.
- Experimental opt-in watch reporting measures actual native playback and pauses on stopped playback
  or hidden app. DNS filtering errors remain explicit; no bypass or extra official player is added.
- Only Twitch-confirmed inventory counts as progress/claim success; an accepted report is not proof of credit.

## Twitch events and UI reliability

- EventSub replaces retired PubSub for authorized custom redemption events, with explicit permission
  and connection states, deduplication, reconnection and cleanup.
- Channel search ignores stale responses and remains dismissed after Escape, selection or outside clicks.
- Player shortcuts respect interactive controls and visible modals. Drops restores focus, cycles Tab
  through visible React controls, consumes Escape and highlights the active pane.
- Remote Twitch views do not inherit application IPC capabilities; authentication stays native.
- Update publication now verifies all four real artifacts against the configured Minisign key,
  including trusted comments, and rejects incomplete releases before publishing assets/manifests.
- Patched rustls, Vitest/mocker, source-map-js, brace-expansion and nanoid. npm audit is clean.
  GTK3 uses an exact upstream GLib security backport with a reproducible integrity check;
  Dependabot may still flag the old version label. See ADR-014 for scope and removal criteria.

## Validation and known limits

- The Windows user accepted the integrated Drops panel and subsequent polish.
- 514 frontend tests pass, one skipped; lint and 11 release/security tests pass. Backend: 56 Rust tests,
  fmt/Clippy and local Windows build pass. Linux CI: 57 unit tests and two GLib regressions,
  also executed with release optimizations; 44 Edge Function tests pass.
- Signed updater artifacts pass cryptographic verification for Windows x64, macOS Intel,
  macOS Apple Silicon and Linux x64. The Linux AppImage/deb and both macOS bundles build successfully.
- A disposable Windows runner verified the NSIS signature, installed 1.4.2, reinstalled with
  Tauri's passive updater flags and confirmed the installed process restarted.
- An authorized EventSub redemption, separate automatic-click confirmation, and isolated
  native-watch pause/session tests remain outstanding.
- The current signing secret matches the unchanged configured public key; all new updater
  artifacts verify against it. Historical artifacts used another signer. Clients trusting an
  unavailable older key need a verified manual transition, not disabled signature verification.
- The installer smoke test is not a historical 1.4.1 migration or complete GUI upgrade test.
  Authenticated settings/session persistence and upgrades during active recording remain unverified.
- Updater signatures do not replace Authenticode or macOS notarization; OS trust warnings may appear.

Details: [updater verification](docs/guides/UPDATER_VERIFICATION.md), [roadmap](ROADMAP.md)
and [Drops watch test](docs/guides/DROPS_NATIVE_WATCH_TEST.md).
