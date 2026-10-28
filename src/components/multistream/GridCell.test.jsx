import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Hls from 'hls.js'
import { measureInvoke } from '../../utils/perf'
import GridCell from './GridCell'

vi.mock('../../utils/perf', () => ({ measureInvoke: vi.fn() }))
vi.mock('../../utils/tauriHls', () => ({ TauriPlaylistLoader: class {}, HLS_WORKER_CONFIG: { enableWorker: true, workerPath: '/hls.worker.js' } }))
vi.mock('../../utils/i18n', () => {
  const translate = (_key, fallback) => fallback
  return { useT: () => translate, t: translate }
})
vi.mock('../../hooks/useStereoPanner', () => ({ useStereoPanner: () => ({ pan: 0, setPan: vi.fn(), isSupported: true }) }))
vi.mock('hls.js', () => {
  class MockHls {
    static instances = []
    static isSupported = () => true
    static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error', LEVEL_UPDATED: 'level-updated' }
    handlers = {}
    loadSource = vi.fn()
    attachMedia = vi.fn()
    destroy = vi.fn()
    stopLoad = vi.fn()
    startLoad = vi.fn()
    on = (event, handler) => { this.handlers[event] = handler }
    off = vi.fn((event) => { delete this.handlers[event] })
    constructor(config) { this.config = config; MockHls.instances.push(this) }
  }
  return { default: MockHls }
})

const props = { index: 0, channel: 'first', onSetChannel: vi.fn(), onRemove: vi.fn(), onFocusAudio: vi.fn(), onSelectChat: vi.fn(), isAudioFocused: true }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('GridCell', () => {
  beforeEach(() => {
    vi.mocked(measureInvoke).mockReset().mockResolvedValue('https://example.test/stream.m3u8')
    Hls.instances.length = 0
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  })

  it('waits for playable data before enabling the shared live latency cap', async () => {
    render(<GridCell {...props} />)
    await waitFor(() => expect(Hls.instances).toHaveLength(1))
    expect(Hls.instances[0].config).toMatchObject({
      liveSyncDuration: 2,
      liveMaxLatencyDuration: Infinity,
      maxLiveSyncPlaybackRate: 1,
    })
    const video = document.querySelector('video')
    Object.defineProperties(video, { readyState: { configurable: true, value: 3 }, paused: { configurable: true, value: false } })
    fireEvent(video, new Event('canplay'))
    expect(Hls.instances[0].config).toMatchObject({ liveSyncDuration: 2, liveMaxLatencyDuration: 6, maxLiveSyncPlaybackRate: 1.1 })
    expect(Hls.instances[0].config).not.toHaveProperty('liveSyncDurationCount')
  })

  it('adapts live synchronization to segment duration and disables it during an unfinished seek', async () => {
    render(<GridCell {...props} />)
    await waitFor(() => expect(Hls.instances).toHaveLength(1))
    const video = document.querySelector('video')
    let seeking = false
    Object.defineProperties(video, { readyState: { configurable: true, value: 3 }, paused: { configurable: true, value: false }, videoHeight: { configurable: true, value: 1080 }, seeking: { configurable: true, get: () => seeking } })
    const hls = Hls.instances[0]
    hls.latestLevelDetails = { targetduration: 6 }
    hls.targetLatency = 3
    act(() => hls.handlers[Hls.Events.LEVEL_UPDATED]())
    expect(hls.config).toMatchObject({ liveSyncDuration: 3, liveMaxLatencyDuration: 12, maxLiveSyncPlaybackRate: 1 })
    seeking = true
    fireEvent(video, new Event('seeking'))
    expect(hls.config.liveMaxLatencyDuration).toBe(Infinity)
    seeking = false
    fireEvent(video, new Event('seeked'))
    expect(hls.config.liveMaxLatencyDuration).toBe(12)
  })

  it('positions loading over the video instead of beside it', async () => {
    measureInvoke.mockReturnValue(new Promise(() => {}))
    const { container } = render(<GridCell {...props} />)
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Conectando…')
    expect(status).toHaveClass('absolute', 'inset-0', 'items-center', 'justify-center', 'text-center')
    expect(status.parentElement).toBe(container.querySelector('video').parentElement)
    expect(status.parentElement).not.toHaveClass('flex')
  })

  it('centers offline errors, preserves wrapping and can retry', async () => {
    measureInvoke.mockRejectedValue('No playable streams found')
    render(<GridCell {...props} />)
    const error = await screen.findByRole('alert')
    expect(error).toHaveClass('absolute', 'inset-0', 'justify-center')
    expect(error).toHaveTextContent('first está Offline')
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument()
    measureInvoke.mockResolvedValue('https://example.test/retry.m3u8')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(Hls.instances.at(-1)?.loadSource).toHaveBeenCalledWith('https://example.test/retry.m3u8'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ignores old channel responses after another channel has loaded', async () => {
    const old = deferred()
    measureInvoke.mockReturnValueOnce(old.promise).mockResolvedValueOnce('https://example.test/new.m3u8')
    const { rerender } = render(<GridCell {...props} />)
    await waitFor(() => expect(measureInvoke).toHaveBeenCalledTimes(1))
    rerender(<GridCell {...props} channel="second" />)
    await waitFor(() => expect(Hls.instances.at(-1)?.loadSource).toHaveBeenCalledWith('https://example.test/new.m3u8'))
    await act(async () => old.resolve('https://example.test/old.m3u8'))
    expect(Hls.instances).toHaveLength(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not retry an obsolete quality request or hide the current loading state', async () => {
    const old = deferred(), current = deferred()
    measureInvoke.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    render(<GridCell {...props} />)
    await waitFor(() => expect(measureInvoke).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '720p60' } })
    await waitFor(() => expect(measureInvoke).toHaveBeenCalledTimes(2))
    await act(async () => old.reject('old quality failed'))
    expect(measureInvoke).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status')).toHaveTextContent('Conectando…')
    await act(async () => current.resolve('https://example.test/current.m3u8'))
    expect(Hls.instances.at(-1).loadSource).toHaveBeenCalledWith('https://example.test/current.m3u8')
  })

  it('does not attach a player or start a fallback after unmount', async () => {
    const pending = deferred()
    measureInvoke.mockReturnValueOnce(pending.promise)
    const { unmount } = render(<GridCell {...props} />)
    await waitFor(() => expect(measureInvoke).toHaveBeenCalledTimes(1))
    unmount()
    await act(async () => pending.reject('cancelled'))
    expect(measureInvoke).toHaveBeenCalledTimes(1)
    expect(Hls.instances).toHaveLength(0)
  })

  it('applies binaural volume without muting the non-focused cell and preserves zero', async () => {
    localStorage.setItem('blinkstream_volume', '40')
    const { container, rerender } = render(<GridCell {...props} isAudioFocused={false} isBinaural />)
    await waitFor(() => expect(Hls.instances).toHaveLength(1))
    const video = container.querySelector('video')
    expect(video.muted).toBe(false)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '70' } })
    expect(video.volume).toBe(0.7)
    expect(video.muted).toBe(false)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } })
    expect(video.volume).toBe(0)
    expect(video.muted).toBe(true)
    rerender(<GridCell {...props} isAudioFocused />)
    expect(video.muted).toBe(true)
  })

  it('shows fatal HLS failures and releases the player on unmount', async () => {
    const { unmount } = render(<GridCell {...props} />)
    await waitFor(() => expect(Hls.instances).toHaveLength(1))
    const hls = Hls.instances[0]
    await act(async () => hls.handlers.error('error', { fatal: true }))
    expect(screen.getByRole('alert')).toHaveTextContent('Error al cargar el stream')
    expect(hls.stopLoad).toHaveBeenCalledOnce()
    unmount()
    expect(hls.destroy).toHaveBeenCalledOnce()
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled()
  })

  it('keeps pause visible if resuming playback is rejected', async () => {
    const { container } = render(<GridCell {...props} />)
    await waitFor(() => expect(Hls.instances).toHaveLength(1))
    fireEvent.pause(container.querySelector('video'))
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error('autoplay blocked'))
    await act(async () => fireEvent.click(screen.getByTitle('Reproducir')))
    expect(screen.getByTitle('Reproducir')).toBeInTheDocument()
  })
})
