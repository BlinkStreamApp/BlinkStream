import { describe, expect, it } from 'vitest'
import { categoryPreferencesKey, normalizeCategoryPreferences, changeCategoryPreferences, visibleCategories } from './categoryPreferences'

const rust = { id: '1', name: 'Rust', box_art_url: '' }
const music = { id: '2', name: 'Music', box_art_url: '' }
describe('category preferences', () => {
  it('normalizes account keys and rejects corrupt entries and remote art URLs', () => {
    expect(categoryPreferencesKey('Alice')).toBe('blinkstream_category_preferences_v1:alice')
    expect(normalizeCategoryPreferences({ favorites: [rust, rust, null, { id: '../bad', name: 'Bad' }], hidden: 'bad' })).toEqual({ favorites: [rust], hidden: [] })
    expect(normalizeCategoryPreferences({ favorites: [{ ...rust, box_art_url: 'https://untrusted.test/image.png' }] }).favorites[0].box_art_url).toBe('')
  })
  it('pins once, toggles off, hides without deleting the pin and restores', () => {
    let state = changeCategoryPreferences({ favorites: [], hidden: [] }, { type: 'pin', game: rust })
    expect(visibleCategories([music, rust], state).map(g => g.id)).toEqual(['1', '2'])
    state = changeCategoryPreferences(state, { type: 'hide', game: rust })
    expect(visibleCategories([rust, music], state)).toEqual([music])
    state = changeCategoryPreferences(state, { type: 'restore', id: '1' })
    expect(visibleCategories([], state)).toEqual([rust])
    expect(changeCategoryPreferences(state, { type: 'pin', game: rust }).favorites).toEqual([])
  })
  it('does not inject unrelated pinned games into a Twitch search', () => {
    const state = { favorites: [rust], hidden: [] }
    expect(visibleCategories([music], state, { search: 'Music' })).toEqual([music])
    expect(visibleCategories([music], state, { search: 'Music', favoritesOnly: true })).toEqual([])
  })
  it('bounds storage and rejects exceeding the favorite limit', () => {
    const games = Array.from({ length: 70 }, (_, index) => ({ id: String(index), name: `Game ${index}` }))
    const state = normalizeCategoryPreferences({ favorites: games, hidden: [] })
    expect(state.favorites).toHaveLength(50)
    expect(() => changeCategoryPreferences(state, { type: 'pin', game: { id: 'new', name: 'New' } })).toThrow()
  })
})
