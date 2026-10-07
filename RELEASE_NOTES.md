# BlinkStream 1.4.2 — Twitch reliability and integrated Drops

Status: release preparation, 2026-10-07. No 1.4.2 installers or update manifest are published.

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
- Patched rustls, Vitest/mocker, source-map-js, brace-expansion and nanoid. npm audit is clean;
  the Linux GTK/GLib compatibility advisory remains open.

## Validation and release blockers

- The Windows user accepted the integrated Drops panel and subsequent polish.
- 513 frontend tests pass, one skipped; lint and 8 release/security tests pass. Backend: 56 Rust tests,
  fmt/Clippy and local Windows build pass. Other desktop platforms are not certified by those checks.
- An authorized EventSub redemption, separate automatic-click confirmation, and isolated
  native-watch pause/session tests remain outstanding.
- Auto-updater verification found incompatible signing keys in the configured/public release chain.
  A post-key-change CI artifact still uses the incompatible signer; public-key recovery is prepared
  without rotating keys or exporting the private secret.
  A source push is not a signed release and does not make 1.4.2 downloadable.
- Before publication: resolve signing continuity, verify signed artifacts for supported platforms,
  and test an actual upgrade from an existing installation.

Details: [updater verification](docs/guides/UPDATER_VERIFICATION.md), [roadmap](ROADMAP.md)
and [Drops watch test](docs/guides/DROPS_NATIVE_WATCH_TEST.md).
