import { afterEach, describe, expect, it, vi } from 'vitest'
import Hls from 'hls.js'
import { HLS_WORKER_CONFIG } from './tauriHls'

afterEach(() => vi.unstubAllGlobals())

describe('ESM HLS worker integration', () => {
  it('loads a bundled worker and sends segments off-thread, then terminates it', () => {
    const workers = []
    vi.stubGlobal('Worker', class {
      constructor(url) { this.url = url; this.messages = []; this.terminate = vi.fn(); workers.push(this) }
      addEventListener() {}
      removeEventListener() {}
      postMessage(message) { this.messages.push(message) }
    })
    const hls = new Hls(HLS_WORKER_CONFIG)
    try {
      const controller = hls.streamController
      controller.levels = [{ videoCodec: 'hvc1.1.6.L120.90', audioCodec: 'mp4a.40.2', details: { live: true, totalduration: 6 } }]
      controller._handleFragmentLoadProgress({
        frag: { level: 0, sn: 1, cc: 0, type: 'main', start: 0, stats: { chunkCount: 1, parsing: { start: 0 } } },
        payload: new ArrayBuffer(0), part: null,
      })
      expect(workers).toHaveLength(1)
      expect(workers[0].url).toContain('hls.worker')
      expect(workers[0].messages.map(message => message.cmd)).toEqual(['init', 'configure', 'demux'])
    } finally { hls.destroy() }
    expect(workers[0].terminate).toHaveBeenCalledOnce()
  })
})
