import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startDropsWatcher, stopDropsWatcher, watchNativeDropsPlayback } from './dropsWatcher'
import { invoke } from '@tauri-apps/api/core'
import * as tauriEnv from './tauriEnv'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('dropsWatcher utility', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    invoke.mockReset()
    invoke.mockResolvedValue(undefined)
  })

  it('startDropsWatcher invokes start_drops_watcher with sanitized channel when in Tauri', async () => {
    vi.spyOn(tauriEnv, 'isTauri').mockReturnValue(true)

    await startDropsWatcher('  IBAI  ')
    expect(invoke).toHaveBeenCalledWith('start_drops_watcher', { channel: 'ibai' })
  })

  it('startDropsWatcher does nothing when channel is empty or not in Tauri', async () => {
    vi.spyOn(tauriEnv, 'isTauri').mockReturnValue(false)

    await startDropsWatcher('ibai')
    expect(invoke).not.toHaveBeenCalled()

    vi.spyOn(tauriEnv, 'isTauri').mockReturnValue(true)
    await startDropsWatcher('')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('stopDropsWatcher invokes stop_drops_watcher when in Tauri', async () => {
    vi.spyOn(tauriEnv, 'isTauri').mockReturnValue(true)

    await stopDropsWatcher()
    expect(invoke).toHaveBeenCalledWith('stop_drops_watcher')
  })

})

describe('native watch sampling', () => {
  let video
  let cleanup
  let onStatus
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
  beforeEach(() => {
    vi.useFakeTimers()
    vi.restoreAllMocks()
    invoke.mockReset()
    invoke.mockResolvedValue({ state: 'sampling', sampledSeconds: 5, acceptedReports: 0 })
    vi.spyOn(tauriEnv, 'isTauri').mockReturnValue(true)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    video = document.createElement('video')
    Object.defineProperties(video, {
      paused: { value: false, configurable: true, writable: true },
      ended: { value: false, configurable: true, writable: true },
      seeking: { value: false, configurable: true, writable: true },
      readyState: { value: 4, configurable: true, writable: true },
    })
    video.currentTime = 10
    video.playbackRate = 1
    video.getVideoPlaybackQuality = () => ({ totalVideoFrames: video.currentTime * 30 })
    onStatus = vi.fn()
  })
  afterEach(async () => {
    cleanup?.()
    cleanup = null
    await flush()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sends real media evidence, not an invented elapsed-minute counter', async () => {
    cleanup = watchNativeDropsPlayback(video, ' IBAI ', onStatus)
    await flush()
    expect(invoke).toHaveBeenCalledWith('sample_native_drops_watch', {
      channel: 'ibai', sample: { enabled: true, active: true, position: 10, playbackRate: 1, muted: false, frames: 300 },
    })
    expect(onStatus).toHaveBeenCalledWith({ state: 'sampling', sampledSeconds: 5, acceptedReports: 0 })
    video.currentTime = 15
    await vi.advanceTimersByTimeAsync(5000)
    expect(invoke.mock.calls.at(-1)[1].sample.position).toBe(15)
  })

  it.each(['paused', 'ended', 'seeking'])('reports inactive immediately when %s', async property => {
    cleanup = watchNativeDropsPlayback(video, 'ibai', onStatus)
    await flush()
    video[property] = true
    video.dispatchEvent(new Event(property === 'paused' ? 'pause' : property))
    await flush()
    expect(invoke.mock.calls.at(-1)[1].sample.active).toBe(false)
    expect(invoke.mock.calls.at(-1)[1].sample.enabled).toBe(true)
  })

  it('does not report active while buffering or with the document hidden, and preserves real mute', async () => {
    cleanup = watchNativeDropsPlayback(video, 'ibai', onStatus)
    await flush()
    video.readyState = 1
    video.dispatchEvent(new Event('waiting'))
    await flush()
    expect(invoke.mock.calls.at(-1)[1].sample.active).toBe(false)
    video.readyState = 4
    video.volume = 0
    video.dispatchEvent(new Event('playing'))
    await flush()
    expect(invoke.mock.calls.at(-1)[1].sample.muted).toBe(true)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(invoke.mock.calls.at(-1)[1].sample.active).toBe(false)
  })

  it('stops timers/listeners and serializes channel teardown before the next session', async () => {
    let finish
    invoke.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    cleanup = watchNativeDropsPlayback(video, 'ibai', onStatus)
    await flush()
    await vi.advanceTimersByTimeAsync(20000)
    expect(invoke).toHaveBeenCalledTimes(1)
    cleanup()
    cleanup = watchNativeDropsPlayback(video, 'cahos_gaming', onStatus)
    finish({ state: 'reported', acceptedReports: 1 })
    await flush()
    expect(invoke.mock.calls.slice(0, 3).map(([, args]) => [args.channel, args.sample.enabled]))
      .toEqual([['ibai', true], ['ibai', false], ['cahos_gaming', true]])
    expect(onStatus).not.toHaveBeenCalledWith({ state: 'reported', acceptedReports: 1 })
  })

  it('surfaces failures and sends no events outside native or for invalid channels', async () => {
    invoke.mockRejectedValueOnce('native failed')
    cleanup = watchNativeDropsPlayback(video, 'ibai', onStatus)
    await flush()
    expect(onStatus).toHaveBeenCalledWith({ state: 'error', error: 'native failed' })
    cleanup()
    cleanup = null
    await flush()
    invoke.mockClear()
    vi.spyOn(tauriEnv, 'isTauri').mockReturnValue(false)
    watchNativeDropsPlayback(video, 'ibai', onStatus)()
    vi.spyOn(tauriEnv, 'isTauri').mockReturnValue(true)
    watchNativeDropsPlayback(video, '../evil', onStatus)()
    await vi.advanceTimersByTimeAsync(10000)
    expect(invoke).not.toHaveBeenCalled()
  })
})
