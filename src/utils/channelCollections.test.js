import { describe, expect, it } from 'vitest'
import { changeCollections, collectionsKey, normalizeCollections } from './channelCollections'

describe('channel collections', () => {
  const items = [{ id: 'one', name: 'Gaming', channels: ['first', 'second'] }]
  it('scopes storage by account and normalizes malformed local data', () => {
    expect(collectionsKey('Alice')).toBe('blinkstream_collections_v1:alice')
    expect(normalizeCollections([{ ...items[0], channels: ['FIRST', 'first', 'bad/url', null] }, null, items[0]])).toEqual([{ ...items[0], channels: ['first'] }])
  })
  it('creates/renames without duplicate names and leaves the input immutable', () => {
    expect(changeCollections(items, { type: 'create', id: 'two', name: ' Esports ' })).toHaveLength(2)
    expect(() => changeCollections(items, { type: 'create', id: 'two', name: 'gaming' })).toThrow()
    expect(changeCollections(items, { type: 'rename', id: 'one', name: 'Nueva' })[0].name).toBe('Nueva')
    expect(items[0].name).toBe('Gaming')
  })
  it('deduplicates channel membership and rejects URLs', () => {
    expect(changeCollections(items, { type: 'add', id: 'one', channel: 'FIRST' })).toEqual(items)
    expect(() => changeCollections(items, { type: 'add', id: 'one', channel: 'https://twitch.tv/first' })).toThrow()
    expect(changeCollections(items, { type: 'remove', id: 'one', channel: 'first' })[0].channels).toEqual(['second'])
  })
  it('moves only adjacent existing entries, preserving the boundaries', () => {
    expect(changeCollections(items, { type: 'moveChannel', id: 'one', channel: 'second', delta: -1 })[0].channels).toEqual(['second', 'first'])
    expect(changeCollections(items, { type: 'moveChannel', id: 'one', channel: 'first', delta: -1 })).toEqual(items)
    const pair = [...items, { id: 'two', name: 'Dos', channels: [] }]
    expect(changeCollections(pair, { type: 'moveCollection', id: 'two', delta: -1 })[0].id).toBe('two')
  })
  it('bounds counts and does not delete channels outside a collection', () => {
    expect(() => changeCollections(Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: String(i), channels: [] })), { type: 'create', id: 'new', name: 'New' })).toThrow()
    expect(changeCollections(items, { type: 'delete', id: 'one' })).toEqual([])
    expect(items[0].channels).toEqual(['first', 'second'])
  })

  it('preserves safe appearances and rejects remote/SVG or oversized covers', () => {
    const cover = 'data:image/jpeg;base64,YQ=='
    const updated = changeCollections(items, { type: 'appearance', id: 'one', cover, color: 'cyan' })
    expect(normalizeCollections(updated)[0]).toMatchObject({ cover, color: 'cyan' })
    expect(normalizeCollections([{ ...items[0], cover: 'https://example.test/image.png' }])[0]).not.toHaveProperty('cover')
    expect(() => changeCollections(items, { type: 'appearance', id: 'one', cover: 'data:image/svg+xml;base64,YQ==' })).toThrow()
    expect(() => changeCollections(items, { type: 'appearance', id: 'one', color: 'invalid' })).toThrow()
  })
})
