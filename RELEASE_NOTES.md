# BlinkStream 1.4.3 — Session and branding hotfix

Date: 2026-10-08.

## Session cleanup and follows

- Logout immediately hides account data, clears recent history/session caches, closes
  playback and returns to the guest welcome without deleting preferences or shared Twitch cookies.
- Manual pinned favorites are isolated by account; Twitch follows are refreshed separately
  every 60 seconds while visible and on focus, reconnection or return to the app.
- Unfollows replace the old snapshot; failed requests preserve the last valid list and report errors.
- Pagination supports more than 500 follows; cancellation and timeouts reject partial/stale results.
- Pending authentication and native token writes cannot restore an account after logout.
- The legacy mixed list is backed up; unowned data is not assigned to another account.
  A legacy follow removed before migration cannot always be distinguished from a manual pin.

## Approved branding and small polish

- New user-approved B/lightning logo across the interface, desktop icons, favicon and website.
- Classic centered guest welcome retained, without extra panels or login buttons.
- Name colors match the header: white Blink and violet-to-fuchsia Stream.
- Removed unused hero image, Vite asset and social sprite.
- Documented a reusable stable PATCH hotfix process: 1.4.2 → 1.4.3, not a prerelease suffix.

## Validation and limits

- Windows logout and the classic welcome/logo were accepted by the user.
- 542 frontend tests pass, one skipped; lint and frontend build pass locally.
- 11 release/signature tests and 56 Rust Windows tests pass; fmt and Clippy pass.
- Live Twitch follow/unfollow confirmation remains pending; automated tests cover its refresh flow.
- Cross-platform signed builds, installer smoke and updater signatures are publication gates in CI.
- Signing trust remains unchanged. This hotfix does not deploy Supabase or change database schemas.
- Historical trust migration, authenticated GUI upgrades and automatic Drops claim validation
  retain the limits documented for 1.4.2. Nothing is installed automatically on the user's PC.

See [hotfix policy](docs/guides/HOTFIX_RELEASES.md),
[updater verification](docs/guides/UPDATER_VERIFICATION.md) and [roadmap](ROADMAP.md).
