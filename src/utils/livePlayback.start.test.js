import { describe, expect, it } from 'vitest'
import { getBufferedLivePosition } from './livePlayback'

function fixture(ranges = [[34, 56]]) {
  const video = { currentTime: 49, paused: false, seeking: false, readyState: 4,
    buffered: { length: ranges.length, start: i => ranges[i][0], end: i => ranges[i][1] },
    getVideoPlaybackQuality: () => ({ totalVideoFrames: 100 }) }
  return video
}

describe('explicit return to downloaded live video', () => {
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

  it('does not treat seekable but undownloaded video as a safe target', () => {
    expect(getBufferedLivePosition({ currentTime: 49, seekable: { length: 1, end: () => 100 } })).toBeNull()
    expect(getBufferedLivePosition(fixture([[49, 51]]))).toBeNull()
  })
})
