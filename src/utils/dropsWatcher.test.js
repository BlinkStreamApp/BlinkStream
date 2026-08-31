import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startDropsWatcher, stopDropsWatcher } from './dropsWatcher'
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
