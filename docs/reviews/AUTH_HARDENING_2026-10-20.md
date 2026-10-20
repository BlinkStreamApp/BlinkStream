# Authentication hardening — 2026-10-20

## Applied cloud containment

Project: BlinkStream (`oncbojnqxpxctwnhehau`). User authorized the security fixes
and deployment in this conversation.

- Removed permissive anon policies and every PUBLIC/anon/authenticated grant on
  `public.auth_tokens`. RLS is enabled and forced; only the trusted backend uses it.
- Purged 22 expired OAuth exchanges containing bearer credentials. Token values
  were not inspected or copied. Deletion is deliberate; no credential backup exists.
- Enforced UUID v4 request IDs, bounded handoff lifetimes, mandatory numeric Twitch
  user IDs and normalized login names. Kept the existing unique request ID index.
- Aligned local migration filenames with the versions assigned in remote history,
  including the previously deployed favorites privilege migration.

## Backend and desktop changes

`twitch-auth` version 38 is deployed. Twitch validates the token's application,
baseline scopes, immutable user ID and expiry. Validation failure stops the
callback. Handoffs are consumed atomically only while unexpired. Unused Twitch
refresh credentials are not returned to the desktop.

Synthetic Auth users now bind `app_metadata.twitch_user_id`. A legacy login name
alone cannot claim an existing account: linking requires its previous Supabase
session plus fresh Twitch OAuth. Existing favorites remain untouched. A user
without that previous session may need controlled account recovery; do not copy
favorites or link accounts based only on a current Twitch login name.

Session sign-in/refresh uses a separate Supabase client so it cannot replace the
shared service-role client's authorization. Refresh credentials are accepted
only in POST JSON. Legacy GET refresh responds 410; older clients must update.

Desktop token validation runs at startup and hourly. Confirmed revocation clears
local authentication. Logout attempts Twitch revocation and Supabase global
sign-out, with a bounded network wait, while local cleanup always proceeds.
Keychain reads precede queued deletion when recovering the refresh token after
restart. Offline remote revocation is reported in the event log; it is not
guaranteed. Supabase access JWTs may remain valid until expiry after sign-out.

Two unnecessary scopes were removed (`user:edit:follows`,
`channel:read:subscriptions`). Current moderation/channel-management features
still request their scopes at login; progressive consent is not implemented.

## Evidence and remaining acceptance

- Catalog verification: 0 rows after containment, 0 public policies/grants,
  forced RLS and mandatory Twitch identity. RPC execution limited to service_role.
- Live HTTP: invalid UUID 400, invalid POST 400, GET refresh 410 and valid OAuth
  redirect with state and reduced scopes.
- 748 frontend tests pass, 1 skipped; 33 release tests, 11 actual-source OAuth
  regressions and 60 Rust Windows tests pass. Frontend lint/build pass.
- Performance Advisor clean. Security Advisor's no-policy INFO is intentional
  for a backend-only table; leaked-password protection remains a manual setting.
- No real Twitch-account login/logout or installed cross-platform GUI acceptance
  has been performed. Full OAuth session creation is covered by mocks, not live
  credentials. Do not equate successful redirect/parser checks with that flow.

## Rollback

Keep table privileges private. Reopening credential access is not an acceptable
rollback. Prefer a corrected forward deployment if login fails. The two-phase
migration's mandatory identity column requires a compatible function; the old
callback cannot write valid handoffs. Preserve existing Auth users and favorites.
