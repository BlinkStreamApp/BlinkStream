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

## Hybrid testing option

The user requested BlinkStream video alongside the official tools after observing
that docking Twitch's widget leaves a playing mini-player. An explicit button
mounts the existing BlinkStream player to the left of the tools, with a bounded
width control (25–55%, initially 40%). Video keeps its 16:9 shape and tools retain
the available height. The previous top strip was rejected in the user's real
test because it wasted width and compressed moderation panels.
Video starts disabled on entry/channel change; only its width is saved.
Hide/exit unmounts the player. Visibility/size changes update the existing official
host without navigating or replacing its session. Unchanged bounds do not generate
native resize calls for player DOM updates.

Twitch's video must be paused and muted manually using its own controls. Docking
does not imply playback/ads stopped. No scripts alter Twitch's player or ad flow;
this layout does not guarantee the absence of ads or concurrent playback.
