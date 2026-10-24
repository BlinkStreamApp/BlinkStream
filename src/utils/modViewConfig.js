const TABS = ['audit', 'users', 'activity', 'automod', 'predictions', 'rewards']
const PRESETS = ['standard', 'chat_left', 'no_player']

export function normalizeModViewConfig(value) {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const selectedTabs = Array.isArray(saved.enabledTabs)
    ? [...new Set(saved.enabledTabs.filter(tab => TABS.includes(tab)))]
    : [...TABS]
  const enabledTabs = selectedTabs.length ? selectedTabs : ['audit']
  const preset = saved.preset === 'chat_only' ? 'no_player'
    : PRESETS.includes(saved.preset) ? saved.preset : 'standard'
  return {
    preset,
    showPlayer: typeof saved.showPlayer === 'boolean' ? saved.showPlayer : true,
    showInspector: typeof saved.showInspector === 'boolean' ? saved.showInspector : true,
    enabledTabs,
    activeTab: enabledTabs.includes(saved.activeTab) ? saved.activeTab : enabledTabs[0],
  }
}
