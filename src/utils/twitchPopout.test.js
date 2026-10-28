import { afterEach, describe, expect, it, vi } from 'vitest'
import { isTauri } from './tauriEnv'
import { requiresOfficialChatWindow } from './twitchPopout'
vi.mock('./tauriEnv', () => ({ isTauri: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
describe('official chat presentation policy', () => {
  it.each(['Win32', 'Win64', 'Windows'])('uses a separate official window on native %s', platform => {
    vi.mocked(isTauri).mockReturnValue(true)
    vi.stubGlobal('navigator', { platform })
    expect(requiresOfficialChatWindow()).toBe(true)
  })
  it.each(['MacIntel', 'Linux x86_64'])('preserves embedding on native %s', platform => {
    vi.mocked(isTauri).mockReturnValue(true)
    vi.stubGlobal('navigator', { platform })
    expect(requiresOfficialChatWindow()).toBe(false)
  })
  it('prefers modern platform metadata and does not change ordinary browser behavior', () => {
    vi.stubGlobal('navigator', { userAgentData: { platform: 'Windows' }, platform: 'other' })
    vi.mocked(isTauri).mockReturnValue(true)
    expect(requiresOfficialChatWindow()).toBe(true)
    vi.mocked(isTauri).mockReturnValue(false)
    expect(requiresOfficialChatWindow()).toBe(false)
  })
})
