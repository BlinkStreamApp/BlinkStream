# ADR-017: Progressive Twitch playlist transport

Status: Accepted for candidate testing
Date: 2026-10-28

## Context

Candidate 13 exhausted its contiguous buffer after a startup seek. The supplied
report showed one five-second wait, without a new seek or a player reset. Merely
seeking closer to completed segments could not sustain low latency.

Public Kokoop 1080p60 playlists contain two Twitch prefetch URLs, two-second
segments and a nominal six-second target duration. hls.js ignores the proprietary
prefetch tags. Configuring our native loader globally also disables its streaming
FetchLoader. Resolving URLs with Streamlink does not use Streamlink's media reader.

## Decision

Use the native loader for playlists only (`pLoader`), with `progressive: true`.
Expose at most two available Twitch prefetch references as estimated-duration
segments, following the duration averaging used by
[Streamlink's Twitch parser](https://github.com/streamlink/streamlink/blob/master/src/streamlink/plugins/twitch.py).
Only accept HTTPS references on a Twitch CDN host already used by completed
segments, without credentials or nonstandard ports. Preserve encryption,
discontinuities, date ranges and other tags. Keep normal handling for VOD,
standard LL-HLS parts and streams without eligible prefetch references.

Remove the automatic startup seek. Preserve the existing seek-loop guard, normal
high-resolution playback speed and explicit DVR controls. Native requests have
bounded timeouts; cancellation/disposal suppresses late callbacks. CSP, native
URL validation and remote webview privileges remain unchanged.

Keep raw HLS latency in diagnostics. When program date time is available, display
the local wall-clock difference from `hls.playingDate`; future prefetch durations
make the raw predicted-edge measure unsuitable as source delay. Invalid or
negative clock differences fall back to the raw value. The estimate depends on
the source and local clocks and is not a capture-to-screen measurement.

## Consequences

A simultaneous 60-second public-stream comparison in Edge 156 measured source
timestamp delay around 9.055s before and 5.082–5.085s after, about four seconds less.
After the first ten seconds the new transport maintained approximately 60 FPS,
zero dropped frames and no additional waits or seeks. A brief startup wait
remained in both transports: the initial playlist refresh follows the nominal
six-second target before a forward buffer is established. Do not claim this wait
is eliminated or infer universal latency from this sample.

Real user WebView2, authenticated playback, HEVC, ads/discontinuity transitions,
long playback and multistream still need acceptance. Do not publish 1.5.4 until
accepted and release gates pass. Earlier stable candidates remain available.
