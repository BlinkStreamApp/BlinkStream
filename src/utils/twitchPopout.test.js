import { afterEach, describe, expect, it, vi } from 'vitest'
import { isTauri } from './tauriEnv'
import { openOfficialRewardsChat } from './twitchPopout'
import { invoke } from '@tauri-apps/api/core'
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('./tauriEnv', () => ({ isTauri: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
describe('official rewards opening', () => {
  it('uses the existing native window without passing OAuth credentials', async () => {
    vi.mocked(isTauri).mockReturnValue(true)
    vi.mocked(invoke).mockResolvedValue(undefined)
    await openOfficialRewardsChat(' KoKoop ')
    expect(invoke).toHaveBeenCalledWith('open_twitch_popout_window', {
      channel: 'kokoop', alwaysOnTop: false, authToken: null, username: null,
    })
  })
  it.each(['', null, 'abc/other', 'abc?token=x'])('rejects invalid channel %s before IPC', async channel => {
    await expect(openOfficialRewardsChat(channel)).rejects.toThrow()
    expect(invoke).not.toHaveBeenCalled()
  })
  it('propagates native failures so the caller can offer a browser link', async () => {
    vi.mocked(isTauri).mockReturnValue(true)
    vi.mocked(invoke).mockRejectedValue(new Error('window failed'))
    await expect(openOfficialRewardsChat('kokoop')).rejects.toThrow('window failed')
  })
})
