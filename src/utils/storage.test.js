import { describe, expect, it, vi } from 'vitest'
import { readVolume, STORAGE_KEYS } from './storage'

describe('stored volume shared by player, settings and grid', () => {
  it.each([['0', 0], ['40', 40], ['100', 100], ['-5', 0], ['150', 100], ['NaN', 100], ['Infinity', 100], ['', 100], [' ', 100]])('reads %s as %s', (stored, expected) => {
    localStorage.setItem(STORAGE_KEYS.VOLUME, stored)
    expect(readVolume()).toBe(expected)
  })
  it('distinguishes an absent setting from a deliberate zero', () => {
    expect(readVolume()).toBe(100)
    expect(readVolume(40)).toBe(40)
    localStorage.setItem(STORAGE_KEYS.VOLUME, '0')
    expect(readVolume(40)).toBe(0)
  })
  it('falls back when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readVolume(40)).toBe(40)
  })
})
