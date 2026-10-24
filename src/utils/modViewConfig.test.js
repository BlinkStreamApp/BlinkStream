import { describe, expect, it } from 'vitest'
import { normalizeModViewConfig } from './modViewConfig'

describe('moderator layout normalization', () => {
  it.each([null, [], 4, 'broken', { enabledTabs: {} }, { enabledTabs: null }])('recovers invalid settings: %j', saved => {
    expect(normalizeModViewConfig(saved)).toMatchObject({ preset: 'standard', showPlayer: true, showInspector: true })
    expect(normalizeModViewConfig(saved).enabledTabs).toContain('audit')
  })
  it('preserves explicit visibility choices and valid ordering, without unknown or duplicate tools', () => {
    expect(normalizeModViewConfig({ preset: 'chat_left', showPlayer: false, showInspector: false, enabledTabs: ['users', 'invalid', 'users', 'audit'], activeTab: 'users' }))
      .toEqual({ preset: 'chat_left', showPlayer: false, showInspector: false, enabledTabs: ['users', 'audit'], activeTab: 'users' })
  })
  it('restores a usable tool when every saved tab is invalid or disabled', () => {
    expect(normalizeModViewConfig({ enabledTabs: ['removed'], activeTab: 'removed' })).toMatchObject({ enabledTabs: ['audit'], activeTab: 'audit' })
  })
  it('migrates the legacy chat-only preset and provides independent arrays', () => {
    expect(normalizeModViewConfig({ preset: 'chat_only' }).preset).toBe('no_player')
    const config = normalizeModViewConfig()
    config.enabledTabs.length = 0
    expect(normalizeModViewConfig().enabledTabs.length).toBeGreaterThan(0)
  })
})
