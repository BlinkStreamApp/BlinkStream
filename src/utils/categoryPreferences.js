export const categoryPreferencesKey = owner => `blinkstream_category_preferences_v1:${owner.toLowerCase()}`

function normalizeList(items, limit) {
  const seen = new Set()
  return (Array.isArray(items) ? items : []).slice(0, 500).flatMap(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || typeof item.name !== 'string' || !item.name.trim() || seen.has(item.id)) return []
    seen.add(item.id)
    const box_art_url = typeof item.box_art_url === 'string' && item.box_art_url.startsWith('https://static-cdn.jtvnw.net/') ? item.box_art_url.slice(0, 1024) : ''
    return [{ id: item.id, name: item.name.trim().slice(0, 100), box_art_url }]
  }).slice(0, limit)
}

export function normalizeCategoryPreferences(value) {
  return { favorites: normalizeList(value?.favorites, 50), hidden: normalizeList(value?.hidden, 200) }
}

export function changeCategoryPreferences(state, action) {
  if (action.type === 'restore') return { ...state, hidden: state.hidden.filter(item => item.id !== action.id) }
  const list = action.type === 'pin' ? 'favorites' : action.type === 'hide' ? 'hidden' : null
  if (!list) return state
  const game = normalizeList([action.game], 1)[0]
  if (!game) throw new Error('Categoría no válida.')
  const exists = state[list].some(item => item.id === game.id)
  if (exists) return { ...state, [list]: state[list].filter(item => item.id !== game.id) }
  if (state[list].length >= (list === 'favorites' ? 50 : 200)) throw new Error('Has alcanzado el límite de preferencias de categorías.')
  return { ...state, [list]: [...state[list], game] }
}

export function visibleCategories(feed, preferences, { search = '', favoritesOnly = false } = {}) {
  const source = favoritesOnly ? preferences.favorites : search ? feed : [...preferences.favorites, ...feed]
  const seen = new Set(), hidden = new Set(preferences.hidden.map(item => item.id))
  return source.filter(item => {
    if (hidden.has(item.id) || seen.has(item.id)) return false
    seen.add(item.id)
    return !favoritesOnly || !search || item.name.toLowerCase().includes(search.toLowerCase())
  })
}
