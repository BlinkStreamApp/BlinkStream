import { describe, expect, it, vi } from 'vitest'
import Hls from 'hls.js'
import { attachLiveTransportRecovery, LIVE_HLS_TRANSPORT, COMPLETED_HLS_TRANSPORT } from './tauriHls'

function fixture(transport = LIVE_HLS_TRANSPORT) {
  const listeners = new Map()
  const hls = {
    config: { ...transport, ignorePlaylistParsingErrors: false },
    on(event, handler) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(handler) },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    trigger(event, data) { for (const handler of listeners.get(event) || []) handler(event, data) },
    destroy() { this.trigger(Hls.Events.DESTROYING, {}); listeners.clear() },
  }
  const video = new EventTarget()
  Object.assign(video, { paused: false, currentTime: 40, playbackRate: 1 })
  let now = 0, followLive = true
  const fallback = vi.fn()
  const dispose = attachLiveTransportRecovery(hls, video, fallback, () => followLive, () => now)
  const loaded = (count = 2) => hls.trigger(Hls.Events.LEVEL_LOADED, {
    details: { live: true }, networkDetails: { blinkstreamPlaylist: { prefetchCount: count } },
  })
  const error = (details = 'levelParsingError', fatal = false) => hls.trigger(Hls.Events.ERROR, {
    type: Hls.ErrorTypes.NETWORK_ERROR, details, fatal, errorAction: { action: 0, flags: 0 },
  })
  return { hls, video, fallback, dispose, loaded, error, time: value => { now = value }, follow: value => { followLive = value } }
}

describe('recovery from repeated speculative playlist rejection', () => {
  it('recovers the first sequence mismatch even when the real HLS error controller escalates it to fatal', () => {
    const hls = new Hls(LIVE_HLS_TRANSPORT)
    const video = new EventTarget()
    video.paused = false
    const recover = vi.fn()
    const dispose = attachLiveTransportRecovery(hls, video, recover)
    const data = { type: Hls.ErrorTypes.NETWORK_ERROR, details: 'levelParsingError', fatal: false,
      reason: 'media sequence mismatch 123: https://private.invalid/signed', error: new Error('sequence mismatch') }
    try {
      hls.trigger(Hls.Events.LEVEL_LOADED, { level: -1, stats: { loading: { first: 1, end: 2 } }, details: { live: true }, networkDetails: { blinkstreamPlaylist: { prefetchCount: 2 } } })
      hls.trigger(Hls.Events.ERROR, data)
      expect(data.fatal).toBe(true)
      expect(recover).toHaveBeenCalledOnce()
    } finally { dispose(); hls.destroy() }
  })
  it('requests one switch after two parsing errors within ten seconds, without changing media or quality', () => {
    const f = fixture()
    f.loaded()
    f.error()
    expect(f.fallback).not.toHaveBeenCalled()
    f.time(6000)
    f.error()
    f.error()
    expect(f.fallback).toHaveBeenCalledExactlyOnceWith()
    expect(f.video.currentTime).toBe(40)
    expect(f.video.playbackRate).toBe(1)
    expect(f.hls.config.progressive).toBe(true)
    expect(f.hls.config.ignorePlaylistParsingErrors).toBe(false)
    f.dispose()
  })

  it('does not combine isolated failures outside the bounded window', () => {
    const f = fixture()
    f.loaded(); f.error()
    f.time(11000); f.error()
    expect(f.fallback).not.toHaveBeenCalled()
    f.time(12000); f.error()
    expect(f.fallback).toHaveBeenCalledOnce()
  })

  it.each(['completed', 'no-prefetch', 'paused', 'DVR', 'disposed', 'destroyed', 'fatal', 'unrelated'])('does not restart playback for %s', mode => {
    const f = fixture(mode === 'completed' ? COMPLETED_HLS_TRANSPORT : LIVE_HLS_TRANSPORT)
    f.loaded(mode === 'no-prefetch' ? 0 : 2)
    if (mode === 'paused') f.video.paused = true
    if (mode === 'DVR') f.follow(false)
    if (mode === 'disposed') f.dispose()
    if (mode === 'destroyed') f.hls.destroy()
    const detail = mode === 'unrelated' ? 'bufferStalledError' : 'levelParsingError'
    f.error(detail, mode === 'fatal'); f.error(detail, mode === 'fatal')
    expect(f.fallback).not.toHaveBeenCalled()
    f.dispose()
  })

  it('discards the previous failure when playback is paused or rewound', () => {
    const f = fixture()
    f.loaded(); f.error()
    f.video.dispatchEvent(new Event('pause'))
    f.error()
    expect(f.fallback).not.toHaveBeenCalled()
    f.follow(false); f.error(); f.follow(true); f.error()
    expect(f.fallback).not.toHaveBeenCalled()
    f.dispose(); f.dispose()
  })
})
