# ADR-018: Separate official chat window on Windows

Status: Accepted for candidate testing
Date: 2026-10-28

## Context

Candidate 14's real Kokoop report contains continuous dropped frames despite a
stable 5.4s source timestamp delay, more than 5s of contiguous buffer, normal
playback speed and no additional waits or seeks. CPU/GPU sampling showed no
saturation. Hiding controls/statistics and fullscreen did not fix it.

The user switched from the embedded official chat to Chat Ligero. The next
30-sample report covers 29.099s: approximately 60 presented FPS, dropped frames
constant at 478, zero interval losses, no new waits and source delay 5.592–5.601s.
Opening the official chat in a separate window retained fluent video according
to the user's comparison. The observed fault is specific to the inline official
chat integration; this does not establish a universal WebView2 defect.

An isolated WebView2 156 test with public anonymous playback maintained 60 FPS
with and without blurred overlays. Connecting Web Audio caused three transition
drops, then no further drops. The actual VideoPlayer component also maintained
approximately 60 FPS without drops in the isolated native window. Do not change
HLS timing, audio routing or GPU flags based on unsupported hypotheses.

## Decision

On native Windows, keep the lightweight chat inside BlinkStream and open the
official chat through the existing separate-window path. Ignore a saved inline
preference on this platform without deleting it. The primary Popout action opens
the official window; omit the duplicate window button. Existing official session
and native authorization remain unchanged. Other platforms retain their current
embedding behavior pending evidence specific to them.

## Consequences

Official rewards, points and emotes remain available through Twitch's own window,
with the integrated lightweight chat still receiving messages. Windows loses the
inline official chat option while this compatibility policy is active. The user
has verified both underlying presentation paths; candidate 15's automatic routing
still needs final acceptance.

The official Mod View hybrid also uses a native child view. Its concurrent video
performance needs separate validation; do not claim this chat change fixes that
surface or publish the release before acceptance. Keep candidate 14 for comparison.
