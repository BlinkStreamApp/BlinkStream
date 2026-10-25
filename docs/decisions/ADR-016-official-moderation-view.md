# ADR-016: Official Twitch moderation view

Status: Accepted
Date: 2026-10-25

## Context

Helix only allows an application to update redemptions of rewards it created.
The user requests Twitch's official moderation interface inside BlinkStream,
using the same native child-webview approach as the official chat.

## Decision

Default Mod View to `https://www.twitch.tv/moderator/{channel}` in an isolated,
session-scoped child webview. Keep the existing BlinkStream interface as an
explicit alternative. Mount only the selected interface so players and chat
connections from the other interface are closed.

Use Twitch's existing web session and unmodified controls. Do not inject tokens,
extract page data, emulate private mutations, or grant remote native capabilities.
Only the local main UI can control the host; channels, bounds and session labels
are validated. Top-level navigation is limited to HTTPS Twitch hosts. Resize does
not reload the page. Teardown waits for an outstanding mount and closes only its
own session. Hide the child behind local dialogs or hidden views.

## Consequences

Twitch owns permissions, moderation actions and reward-queue behavior in the
official surface. Its web login and browser compatibility still require real
validation; local build/tests do not establish authenticated functionality.
The official surface includes Twitch's player and layout. Main BlinkStream
playback and the existing Drops policy remain unchanged.
Reload, browser fallback and the prior custom interface remain available.
