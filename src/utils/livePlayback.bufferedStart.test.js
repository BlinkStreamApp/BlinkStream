import { expect, it, vi } from 'vitest'
import Hls from 'hls.js'
import { attachBufferedLiveStart } from './livePlayback'

function fixture() {
  const handlers = new Map()
  const hls = { latestLevelDetails: { live: true }, on: (e, cb) => handlers.set(e, cb), off: (e) => handlers.delete(e) }
  const video = new EventTarget()
  Object.assign(video, { currentTime: 10, readyState: 4, paused: false, seeking: false,
    buffered: { length: 1, start: () => 8, end: () => 16 } })
  const dispose = attachBufferedLiveStart(hls, video)
  return { hls, video, handlers, dispose }
}
it('approaches only downloaded live media once, retaining three seconds of buffer', () => {
  const f = fixture()
  f.video.dispatchEvent(new Event('playing'))
  expect(f.video.currentTime).toBe(13)
  expect(f.handlers.size).toBe(0)
  f.video.currentTime = 10
  f.video.dispatchEvent(new Event('playing'))
  expect(f.video.currentTime).toBe(10)
  f.dispose()
})
it.each(['paused', 'seeking', 'small-buffer', 'gap', 'VOD', 'dispose'])('does not jump on %s', mode => {
  const f = fixture()
  if (mode === 'paused') f.video.paused = true
  if (mode === 'seeking') f.video.seeking = true
  if (mode === 'small-buffer') f.video.buffered.end = () => 12
  if (mode === 'gap') f.video.buffered.start = () => 11
  if (mode === 'VOD') f.hls.latestLevelDetails.live = false
  if (mode === 'dispose') f.dispose()
  f.handlers.get(Hls.Events.FRAG_BUFFERED)?.()
  expect(f.video.currentTime).toBe(10)
  f.dispose()
})
it('cancels if the user has deliberately rewound', () => {
  const f = fixture(); f.dispose()
  const follow = vi.fn(() => false)
  attachBufferedLiveStart(f.hls, f.video, follow)
  f.video.dispatchEvent(new Event('playing'))
  expect(f.video.currentTime).toBe(10)
  expect(f.handlers.size).toBe(0)
})
