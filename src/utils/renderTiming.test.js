import { expect, it, vi } from 'vitest'
import { createRenderTiming } from './renderTiming'

function fixture() {
  let now = 0, frame, presented, observed
  const observer = { observe: vi.fn(), disconnect: vi.fn() }
  class Observer { static supportedEntryTypes = ['longtask']; constructor(callback) { observed = callback; return observer } }
  const environment = { performance: { now: () => now }, document: { visibilityState: 'visible' },
    innerWidth: 1280, innerHeight: 800, PerformanceObserver: Observer,
    requestAnimationFrame: vi.fn(callback => { frame = callback; return 1 }), cancelAnimationFrame: vi.fn() }
  const video = { requestVideoFrameCallback: vi.fn(callback => { presented = callback; return 2 }), cancelVideoFrameCallback: vi.fn() }
  const probe = createRenderTiming(video, environment)
  return { probe, environment, video, observer,
    advance: value => { now = value; frame(value) },
    present: metadata => presented(now, metadata),
    observe: entries => observed({ getEntries: () => entries }) }
}

it('aggregates UI cadence, decode duration and task duration without storing attribution or media URLs', () => {
  const f = fixture()
  f.advance(10); f.advance(30); f.advance(1000)
  f.present({ processingDuration: 0.002, expectedDisplayTime: 990, mediaTime: 44, url: 'secret' })
  f.present({ processingDuration: 0.004, expectedDisplayTime: 1002 })
  f.observe([{ duration: 60, name: 'secret', attribution: ['private'] }])
  const sample = f.probe.sample()
  expect(sample).toMatchObject({ uiFps: 3, uiMaxGapMs: 970, decodeAvgMs: 3, decodeMaxMs: 4,
    presentationLateMaxMs: 10, longTasks: 1, longTaskMs: 60, hidden: false, viewportWidth: 1280 })
  expect(JSON.stringify(sample)).not.toMatch(/secret|private|url|mediaTime/)
  f.probe.stop()
  expect(f.environment.cancelAnimationFrame).toHaveBeenCalledWith(1)
  expect(f.video.cancelVideoFrameCallback).toHaveBeenCalledWith(2)
  expect(f.observer.disconnect).toHaveBeenCalledOnce()
})

it('resets interval aggregates and ignores hidden-window callbacks', () => {
  const f = fixture()
  f.advance(100); f.advance(200); f.probe.sample()
  f.environment.document.visibilityState = 'hidden'
  f.advance(300); f.present({ processingDuration: 2 }); f.observe([{ duration: 999 }])
  expect(f.probe.sample()).toMatchObject({ uiFps: null, decodeAvgMs: null, longTaskMs: 0, hidden: true })
  f.environment.document.visibilityState = 'visible'
  f.advance(1000); f.advance(1016)
  expect(f.probe.sample().uiMaxGapMs).toBe(16)
  f.probe.stop()
})

it('reports unsupported metrics as unknown rather than zero', () => {
  const probe = createRenderTiming({}, { performance: { now: () => 0 } })
  expect(probe.sample()).toMatchObject({ uiFps: null, uiMaxGapMs: null, longTasks: null, decodeAvgMs: null, presentationLateMaxMs: null })
  probe.stop()
})

it('rejects malformed decode timing and stops rescheduling after cleanup', () => {
  const f = fixture()
  f.present({ processingDuration: NaN }); f.present({ processingDuration: -1 })
  expect(f.probe.sample().decodeAvgMs).toBeNull()
  f.probe.stop()
  const frameCount = f.environment.requestAnimationFrame.mock.calls.length
  f.advance(1000)
  expect(f.environment.requestAnimationFrame).toHaveBeenCalledTimes(frameCount)
})
