import { describe, expect, it } from 'vitest'
import { createLiveStartAlignment, getBufferedLivePosition } from './livePlayback'

function fixture(ranges = [[34, 56]]) {
  const video = { currentTime: 49, paused: false, seeking: false, readyState: 4,
    buffered: { length: ranges.length, start: i => ranges[i][0], end: i => ranges[i][1] },
    getVideoPlaybackQuality: () => ({ totalVideoFrames: 100 }) }
  return video
}

describe('one-time buffered live start', () => {
  it('uses a three-second margin in actual downloaded video', () => {
    expect(getBufferedLivePosition(fixture())).toBe(53)
    const video = fixture()
    video.currentTime = 54
    expect(getBufferedLivePosition(video)).toBe(54)
  })

  it('does not automatically jump across a buffer gap', () => {
    const video = fixture([[34, 50], [58, 66]])
    expect(getBufferedLivePosition(video, { currentRangeOnly: true })).toBe(49)
    expect(getBufferedLivePosition(video)).toBe(63)
  })

  it.each(['paused', 'seeking', 'unready', 'no-frames'])('waits while %s rather than overwriting a pending decode', state => {
    const video = fixture()
    if (state === 'paused') video.paused = true
    if (state === 'seeking') video.seeking = true
    if (state === 'unready') video.readyState = 1
    if (state === 'no-frames') video.getVideoPlaybackQuality = () => ({ totalVideoFrames: 0 })
    const alignment = createLiveStartAlignment(video, () => true)
    expect(alignment.tryAlign()).toBe(false)
    expect(video.currentTime).toBe(49)
  })

  it('runs at most once and never becomes a periodic chase', () => {
    const video = fixture()
    const alignment = createLiveStartAlignment(video, () => true)
    expect(alignment.tryAlign()).toBe(true)
    video.buffered.end = () => 100
    for (let i = 0; i < 15; i++) expect(alignment.tryAlign()).toBe(false)
    expect(video.currentTime).toBe(53)
  })

  it('does not align after a manual DVR action or after the startup window', () => {
    const video = fixture()
    let following = false
    const alignment = createLiveStartAlignment(video, () => following)
    expect(alignment.tryAlign()).toBe(false)
    following = true
    expect(alignment.tryAlign()).toBe(false)
    let now = 0
    const expired = createLiveStartAlignment(video, () => true, () => now)
    now = 16000
    expect(expired.tryAlign()).toBe(false)
    const cancelled = createLiveStartAlignment(video, () => true)
    cancelled.cancel()
    expect(cancelled.tryAlign()).toBe(false)
  })

  it('does not treat seekable but undownloaded video as a safe target', () => {
    expect(getBufferedLivePosition({ currentTime: 49, seekable: { length: 1, end: () => 100 } })).toBeNull()
    expect(getBufferedLivePosition(fixture([[49, 51]]))).toBeNull()
  })
})
