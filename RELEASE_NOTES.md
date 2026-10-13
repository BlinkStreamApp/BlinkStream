# BlinkStream 1.4.4 — Interface, discovery and multistream update

Date: 2026-10-13. Published incremental compatible update; signed cross-platform CI passed.

## Category discovery and visual polish

- Search games/categories beyond the popular list, load more results and filter live streams by language.
- Cancel obsolete requests on query, category, language or account changes; deduplicate paginated results.
- Keep HTTP/auth/rate-limit/timeout errors distinct from an empty list and offer explicit retry.
- Modernized cards, sharper stream thumbnails, readable full-name language badges and clearer controls.

## Multistream and unified chat

- Center loading/error messages in the video area; wrap long errors and adapt controls to each cell's width.
- Ignore late channel/quality responses and release HLS resources on replacement/unmount.
- Restrict audio/chat selection to visible cells; preserve zero volume and coherent binaural mute behavior.
- Apply left/right chat placement in matching DOM order; allow re-opening hidden chat from a cell.
- Optional Individual/Unified native chat mode for 2/3/4-cell grids; one subscription per unique visible channel.
- Source-colored labels, arrival-ordered messages and channel-scoped emotes, badges, anti-spam, dedupe and deletions.
- Explicit single-recipient sending requires a joined destination; drafts never transfer to another channel.
- Official embedded chat, moderation and Companion chat sends remain in Individual; `/me` targets one selected room.

## Settings and keyboard polish

- Safe initial focus, Tab containment and focus restoration in Settings and confirmation dialogs.
- Arrow-key navigation between Settings tabs, named switches/controls and a keyboard-operable Home logo.
- Shared validated volume reader preserves 0%, clamps invalid ranges and retains grid's separate default.

## Validation and delivery limits

- The user accepted category/grid/UI changes and authorized the incremental 1.4.4 publication workflow.
- 623 frontend tests pass, one skipped; lint, legacy checks and Windows local build pass.
- 56 Rust Windows tests, format checks and 19 release/signature/documentation tests pass locally.
- Socket-simulated tests cover chat routing, destination changes, assets and deletions; responsive checks cover narrow grids.
- Live Twitch authentication/sending, independent audio/keyboard acceptance and other desktop platforms are not certified by mocks.
- Candidate CI `38449215321` and tag CI `38451126905` passed quality, signed builds for Windows/both macOS architectures/Linux, NSIS smoke and manifest verification.
- All four downloaded public updater artifacts independently pass signature, trusted-comment and SHA-256 verification; the public manifest matches master after Git line-ending normalization.
- Signing trust, cloud schema and shared Twitch cookies are unchanged; no Supabase deployment or automatic PC installation.
- Historical updater-key migration, authenticated upgrades and independent Drops auto-claim retain their previous limits.
- Every hotfix/update keeps README, release notes, repository roadmap and website current; release tests enforce version markers.

See [hotfix policy](docs/guides/HOTFIX_RELEASES.md),
[updater verification](docs/guides/UPDATER_VERIFICATION.md) and [roadmap](ROADMAP.md).
