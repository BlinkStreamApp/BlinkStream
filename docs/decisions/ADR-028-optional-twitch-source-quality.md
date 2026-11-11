# ADR-028: Optional Twitch session for source quality

Status: Accepted
Date: 2026-11-11

## Context

Twitch may offer a higher source variant to a signed-in viewer. On the same Lolito broadcast, a Windows playback test reported 1920×1080 anonymously and 2560×1440 with the authenticated session. Both samples reported 60 FPS and 3.5 seconds of latency.

## Decision

Offer this option in the Windows GitHub build, off by default. The first activation prepares a pinned official Streamlink runtime in app data. Rust verifies the archive before extraction and the installed files before execution. Only the local main window can request preparation. Rust validates that the official Twitch session belongs to the same account as BlinkStream and sends its credential to the verified process through stdin.

## Consequences

Playback keeps using public variants during setup and can fall back to them if Twitch rejects the authenticated request. The settings show the decoded resolution. Logging out or changing account clears the opt-in. The first activation can download about 85 MB. Twitch controls the variants available to each viewer. Microsoft Store and non-Windows builds retain the existing public playback path.
