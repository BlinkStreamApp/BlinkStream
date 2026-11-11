import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Hls from 'hls.js'
import { StrictMode, useState } from 'react'
import VideoPlayer from './VideoPlayer'
import QualitySelector from './QualitySelector'
import { measureInvoke } from '../utils/perf'

vi.mock('../utils/perf', () => ({ measureInvoke: vi.fn() }))
vi.mock('../hooks/useDropsProgress', () => ({ useDropsProgress: () => null }))
vi.mock('../hooks/useAudioCompressor', () => ({ useAudioCompressor: () => ({}) }))
vi.mock('../hooks/useRecording', () => ({ useRecording: () => ({}) }))
const dvr = vi.hoisted(() => ({ updateDVRMetrics: () => {}, isFollowingLive: () => true }))
vi.mock('../hooks/useLiveDVR', () => ({ useLiveDVR: () => dvr }))
vi.mock('../utils/playbackDiagnostics', () => ({ createPlaybackProbe: () => ({ sample: () => ({}), stop: vi.fn(), destroy: vi.fn(), dispose: vi.fn(), setRenderTimingEnabled: vi.fn() }) }))
vi.mock('../utils/tauriHls', () => ({ attachLivePlaylistBootstrap: () => () => {}, PUBLISHED_LIVE_HLS_TRANSPORT: {}, COMPLETED_HLS_TRANSPORT: {}, HLS_WORKER_CONFIG: {} }))
vi.mock('hls.js', () => {
  class MockHls {
    static instances = []
    static isSupported = () => true
    static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error', LEVEL_UPDATED: 'level' }
    static ErrorTypes = { NETWORK_ERROR: 'network' }
    handlers = {}
    levels = []
    loadSource = vi.fn()
    attachMedia = vi.fn()
    stopLoad = vi.fn()
    destroy = vi.fn()
    on = (event, handler) => { this.handlers[event] = handler }
    off = vi.fn()
    constructor() { MockHls.instances.push(this) }
  }
  return { default: MockHls }
})
const props = { channel: 'first', quality: 'best', volume: 50, theatreMode: false, compact: false, onToggleTheatre: vi.fn(), onToggleCompact: vi.fn(), onQualityChange: vi.fn(), onVolumeChange: vi.fn() }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const sources = () => Hls.instances.flatMap(hls => hls.loadSource.mock.calls.map(([url]) => url))
const network = vi.fn(() => { throw new Error('Unexpected network') })
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals() })
beforeEach(() => {
  vi.stubGlobal('fetch', network)
  Hls.instances.length = 0
  vi.clearAllMocks()
  measureInvoke.mockImplementation(async command => command === 'get_available_qualities' ? ['audio_only', '1080p60'] : 'https://example.test/live.m3u8')
})
it('keeps best selected independently of catalog order and preserves confirmed 1440', () => {
  const change = vi.fn()
  render(<QualitySelector current="best" onChange={change} qualities={['1440p60', '720p60', 'audio_only']} />)
  expect(screen.getByRole('combobox')).toHaveValue('best')
  expect(screen.getByRole('option', { name: /1440p60/ })).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '1440p60' } })
  expect(change).toHaveBeenCalledWith('1440p60')
})
it('does not invent a catalog after discovery fails', async () => {
  measureInvoke.mockImplementation(async command => {
    if (command === 'get_available_qualities') throw new Error('offline')
    return 'https://example.test/live.m3u8'
  })
  render(<VideoPlayer {...props} />)
  await waitFor(() => expect(sources()).toHaveLength(1))
  fireEvent.click(screen.getByRole('button', { name: 'Ajustes del reproductor' }))
  expect(screen.getByText('Catálogo de calidades no disponible.')).toBeInTheDocument()
  expect(screen.getAllByRole('option').map(option => option.value)).toEqual(['best'])
  expect(screen.getByRole('button', { name: 'Abrir en Twitch' })).toBeInTheDocument()
})
it('makes fallback explicit, retains preference and reports decoded dimensions', async () => {
  measureInvoke.mockImplementation(async (command, args) => {
    if (command === 'get_available_qualities') return ['1080p60']
    if (args.quality === '1440p60') throw new Error('unavailable')
    return 'https://example.test/fallback.m3u8'
  })
  const { container } = render(<VideoPlayer {...props} quality="1440p60" />)
  await waitFor(() => expect(sources()).toContain('https://example.test/fallback.m3u8'))
  const video = container.querySelector('video')
  Object.defineProperties(video, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 } })
  fireEvent.loadedMetadata(video)
  fireEvent.click(screen.getByRole('button', { name: 'Ajustes del reproductor' }))
  expect(screen.getByRole('status')).toHaveTextContent('1920×1080 · Alternativa automática aplicada')
  expect(props.onQualityChange).not.toHaveBeenCalled()
  expect(screen.getByRole('combobox')).toHaveValue('1440p60')
  expect(screen.getByRole('option', { name: /preferida, no disponible/ })).toBeDisabled()
})
it('retains and reports a real 1440 source without fallback', async () => {
  measureInvoke.mockImplementation(async command => command === 'get_available_qualities' ? ['1440p60', '1080p60'] : 'https://example.test/1440.m3u8')
  const { container } = render(<VideoPlayer {...props} quality="1440p60" />)
  await waitFor(() => expect(sources()).toContain('https://example.test/1440.m3u8'))
  const video = container.querySelector('video')
  Object.defineProperties(video, { videoWidth: { value: 2560 }, videoHeight: { value: 1440 } })
  fireEvent.loadedMetadata(video)
  fireEvent.click(screen.getByRole('button', { name: 'Ajustes del reproductor' }))
  expect(screen.getByRole('status')).toHaveTextContent('2560×1440')
  expect(screen.getByRole('status')).not.toHaveTextContent('Alternativa')
  expect(screen.queryByRole('button', { name: 'Abrir en Twitch' })).not.toBeInTheDocument()
  expect(measureInvoke).not.toHaveBeenCalledWith('get_stream_url', expect.objectContaining({ quality: 'best' }))
})
it.each(['resolve', 'reject'])('ignores late channel playback and catalog responses: %s', async outcome => {
  const oldStream = deferred(), oldCatalog = deferred()
  measureInvoke.mockImplementation(async (command, args) => {
    if (args.channel === 'first') return command === 'get_available_qualities' ? oldCatalog.promise : oldStream.promise
    return command === 'get_available_qualities' ? ['720p60'] : 'https://example.test/second.m3u8'
  })
  const { rerender } = render(<VideoPlayer {...props} />)
  rerender(<VideoPlayer {...props} channel="second" />)
  await waitFor(() => expect(sources()).toContain('https://example.test/second.m3u8'))
  await act(async () => { oldStream[outcome](outcome === 'resolve' ? 'https://example.test/old.m3u8' : new Error('late')); oldCatalog.resolve(['1440p60']) })
  expect(sources()).not.toContain('https://example.test/old.m3u8')
  expect(measureInvoke.mock.calls.filter(([cmd, args]) => cmd === 'get_stream_url' && args.channel === 'first')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Ajustes del reproductor' }))
  expect(screen.queryByRole('option', { name: /1440/ })).not.toBeInTheDocument()
})
it('ignores a late quality result while starting the next request immediately', async () => {
  const old = deferred()
  measureInvoke.mockImplementation(async (command, args) => command === 'get_available_qualities' ? ['720p60', '1080p60'] : args.quality === '1080p60' ? old.promise : 'https://example.test/720.m3u8')
  const { rerender } = render(<VideoPlayer {...props} quality="1080p60" />)
  rerender(<VideoPlayer {...props} quality="720p60" />)
  await waitFor(() => expect(sources()).toContain('https://example.test/720.m3u8'))
  await act(async () => old.resolve('https://example.test/old.m3u8'))
  expect(sources()).not.toContain('https://example.test/old.m3u8')
  expect(measureInvoke.mock.calls.filter(([cmd]) => cmd === 'get_available_qualities')).toHaveLength(1)
})
it('never falls back from audio to video or retries best as best', async () => {
  measureInvoke.mockImplementation(async command => {
    if (command === 'get_available_qualities') return []
    throw new Error('unavailable')
  })
  const { rerender } = render(<VideoPlayer {...props} quality="audio_only" />)
  await screen.findByText('No se pudo cargar first')
  expect(measureInvoke.mock.calls.filter(([cmd]) => cmd === 'get_stream_url')).toHaveLength(1)
  rerender(<VideoPlayer {...props} channel="second" quality="best" />)
  await screen.findByText('No se pudo cargar second')
  expect(measureInvoke.mock.calls.filter(([cmd]) => cmd === 'get_stream_url')).toHaveLength(2)
})

it('applies a user selection of best once through the real parent preference flow', async () => {
  function Harness() {
    const [quality, setQuality] = useState('1080p60')
    return <VideoPlayer {...props} quality={quality} onQualityChange={setQuality} />
  }
  render(<StrictMode><Harness /></StrictMode>)
  await waitFor(() => expect(sources().length).toBeGreaterThan(0))
  fireEvent.click(screen.getByRole('button', { name: 'Ajustes del reproductor' }))
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'best' } })
  await waitFor(() => expect(measureInvoke).toHaveBeenCalledWith('get_stream_url', { channel: 'first', quality: 'best' }))
  expect(screen.getByRole('combobox')).toHaveValue('best')
  expect(measureInvoke.mock.calls.filter(([cmd, args]) => cmd === 'get_stream_url' && args.quality === 'best')).toHaveLength(1)
})
it('tries best once after a manual decode failure and retains the saved preference', async () => {
  const { container } = render(<VideoPlayer {...props} quality="1440p60" />)
  await waitFor(() => expect(sources()).toHaveLength(1))
  const video = container.querySelector('video')
  Object.defineProperty(video, 'error', { value: { code: 3 } })
  fireEvent.error(video)
  await waitFor(() => expect(sources()).toHaveLength(2))
  fireEvent.click(screen.getByRole('button', { name: 'Ajustes del reproductor' }))
  expect(props.onQualityChange).not.toHaveBeenCalled()
  expect(screen.getByRole('status')).toHaveTextContent('Alternativa automática aplicada')
  fireEvent.error(video)
  expect(screen.getByText(/Fallo de decodificación de vídeo/)).toBeInTheDocument()
  expect(Hls.instances.at(-1).stopLoad).toHaveBeenCalledOnce()
  expect(measureInvoke.mock.calls.filter(([cmd, args]) => cmd === 'get_stream_url' && args.quality === 'best')).toHaveLength(1)
})

it.each(['audio', 'audio_only', 'best'])('stops when %s cannot start without requesting a replacement video', async quality => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  const { unmount } = render(<VideoPlayer {...props} quality={quality} />)
  await waitFor(() => expect(sources()).toHaveLength(1))
  vi.useFakeTimers()
  try {
    const hls = Hls.instances.at(-1)
    await act(async () => {
      hls.handlers.manifest(null, { levels: [] })
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(screen.getByText('No se pudo iniciar la reproducción.')).toBeInTheDocument()
    expect(hls.stopLoad).toHaveBeenCalledOnce()
    expect(measureInvoke.mock.calls.filter(([cmd]) => cmd === 'get_stream_url')).toHaveLength(1)
    expect(measureInvoke).toHaveBeenCalledWith('get_stream_url', { channel: 'first', quality: quality === 'audio' ? 'audio_only' : quality })
  } finally {
    unmount()
    vi.useRealTimers()
    play.mockRestore()
  }
})

it('does not let a queued network retry replace a decode fallback in progress', async () => {
  const fallback = deferred()
  measureInvoke.mockImplementation(async (command, args) => {
    if (command === 'get_available_qualities') return ['1440p60', '1080p60']
    return args.quality === 'best' ? fallback.promise : 'https://example.test/1440.m3u8'
  })
  const { container, unmount } = render(<VideoPlayer {...props} quality="1440p60" />)
  await waitFor(() => expect(sources()).toHaveLength(1))
  vi.useFakeTimers()
  try {
    const video = container.querySelector('video')
    Object.defineProperty(video, 'error', { value: { code: 3 } })
    act(() => {
      Hls.instances.at(-1).handlers.error(null, { fatal: true, type: 'network', details: 'manifestLoadError' })
      fireEvent.error(video)
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
    expect(measureInvoke.mock.calls.filter(([cmd]) => cmd === 'get_stream_url')).toHaveLength(2)
    await act(async () => fallback.resolve('https://example.test/1080.m3u8'))
    expect(sources()).toContain('https://example.test/1080.m3u8')
  } finally {
    unmount()
    vi.useRealTimers()
  }
})

it('keeps offline classification without exposing native output', async () => {
  measureInvoke.mockImplementation(async command => {
    if (command === 'get_available_qualities') return []
    throw new Error('No playable streams found: https://example.test/private')
  })
  render(<VideoPlayer {...props} />)
  await screen.findByText('first está Offline')
  expect(document.body).not.toHaveTextContent('example.test/private')
})
