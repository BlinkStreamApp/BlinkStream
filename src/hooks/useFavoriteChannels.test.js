import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sync = vi.hoisted(() => ({
  fetchCloudFavorites: vi.fn(), fetchFollowedChannels: vi.fn(),
  addCloudFavorite: vi.fn(), removeCloudFavorite: vi.fn(),
}))
vi.mock('../utils/favoritesSync', () => sync)
import { useFavoriteChannels } from './useFavoriteChannels'

const alice = { username: 'alice', token: 'alice-token' }
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }

describe('useFavoriteChannels: cuenta, logout y refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    sync.fetchFollowedChannels.mockResolvedValue(['follow_a'])
    sync.fetchCloudFavorites.mockResolvedValue([])
  })
  afterEach(() => vi.useRealTimers())

  it('logout oculta follows inmediatamente, conserva ajustes y no los persiste como favoritos', async () => {
    localStorage.setItem('blinkstream_volume', '40')
    const { result, rerender } = renderHook(props => useFavoriteChannels(props), { initialProps: alice })
    await flush()
    expect(result.current.favorites).toEqual(['follow_a'])
    expect(result.current.pinnedFavorites).toEqual([])
    expect(localStorage.getItem('blinkstream_favorites_v2:alice')).toBe('[]')
    rerender({ username: null, token: null })
    expect(result.current.favorites).toEqual([])
    await flush()
    expect(result.current.favorites).toEqual([])
    expect(localStorage.getItem('blinkstream_volume')).toBe('40')
  })

  it('actualiza follows nuevos y unfollows cada minuto sin subirlos a la nube', async () => {
    const { result } = renderHook(() => useFavoriteChannels(alice))
    await flush()
    sync.fetchFollowedChannels.mockResolvedValue(['follow_b'])
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(result.current.favorites).toEqual(['follow_b'])
    expect(sync.fetchCloudFavorites).toHaveBeenCalledTimes(1)
    expect(sync.fetchCloudFavorites).toHaveBeenCalledWith('alice')
    expect(sync.addCloudFavorite).not.toHaveBeenCalled()
  })

  it('refresca al volver a la app, evita peticiones duplicadas y limpia listeners', async () => {
    const { unmount } = renderHook(() => useFavoriteChannels(alice))
    await flush()
    await act(async () => { await vi.advanceTimersByTimeAsync(16000) })
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('online'))
    })
    expect(sync.fetchFollowedChannels).toHaveBeenCalledTimes(2)
    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); window.dispatchEvent(new Event('focus')) })
    expect(sync.fetchFollowedChannels).toHaveBeenCalledTimes(2)
  })

  it('no aplica una respuesta de la cuenta anterior tras cambiar de usuario', async () => {
    let resolveAlice
    sync.fetchFollowedChannels.mockImplementation(token => token === 'alice-token'
      ? new Promise(resolve => { resolveAlice = resolve }) : Promise.resolve(['bob_follow']))
    localStorage.setItem('blinkstream_favorites_v2:alice', '["alice_pin"]')
    const { result, rerender } = renderHook(props => useFavoriteChannels(props), { initialProps: alice })
    await flush()
    rerender({ username: 'bob', token: 'bob-token' })
    expect(result.current.favorites).toEqual([])
    await flush()
    await act(async () => { resolveAlice(['private_alice_follow']) })
    expect(result.current.favorites).toEqual(['bob_follow'])
    expect(sync.fetchCloudFavorites).not.toHaveBeenCalledWith('alice')
  })

  it('migra la lista antigua solo para su propietario y conserva una copia recuperable', async () => {
    localStorage.setItem('blinkstream_twitch_username', 'alice')
    localStorage.setItem('blinkstream_favorites', '["manual_pin","follow_a"]')
    sync.fetchCloudFavorites.mockResolvedValue(['cloud_pin', 'follow_a'])
    const { result } = renderHook(() => useFavoriteChannels(alice))
    await flush()
    expect(result.current.pinnedFavorites).toEqual(['cloud_pin', 'manual_pin'])
    expect(localStorage.getItem('blinkstream_favorites')).toBeNull()
    expect(JSON.parse(localStorage.getItem('blinkstream_favorites_legacy')).channels).toEqual(['manual_pin', 'follow_a'])
    expect(sync.addCloudFavorite).not.toHaveBeenCalled()
  })

  it('no asigna una lista antigua sin propietario a otra cuenta ni al invitado', async () => {
    localStorage.setItem('blinkstream_favorites', '["old_account"]')
    const { result } = renderHook(() => useFavoriteChannels(alice))
    await flush()
    expect(result.current.favorites).toEqual(['follow_a'])
    expect(result.current.pinnedFavorites).toEqual([])
  })

  it('conserva la última lista ante un error y permite pin explícito de un follow', async () => {
    const { result } = renderHook(() => useFavoriteChannels(alice))
    await flush()
    await act(async () => { result.current.toggleFavorite('follow_a') })
    expect(result.current.pinnedFavorites).toEqual(['follow_a'])
    expect(sync.addCloudFavorite).toHaveBeenCalledWith('alice', 'follow_a')
    sync.fetchFollowedChannels.mockRejectedValue(new Error('HTTP 403'))
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(result.current.favorites).toEqual(['follow_a'])
    expect(result.current.followsError).toBe('HTTP 403')
    sync.fetchFollowedChannels.mockResolvedValue([])
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(result.current.favorites).toEqual(['follow_a'])
    expect(result.current.followsError).toBeNull()
  })

  it('no resucita un favorito eliminado mientras responde la nube', async () => {
    let resolveCloud
    localStorage.setItem('blinkstream_favorites_v2:alice', '["manual_pin"]')
    sync.fetchCloudFavorites.mockImplementation(() => new Promise(resolve => { resolveCloud = resolve }))
    const { result } = renderHook(() => useFavoriteChannels(alice))
    await flush()
    await act(async () => { result.current.toggleFavorite('manual_pin') })
    await act(async () => { resolveCloud(['manual_pin']) })
    expect(result.current.pinnedFavorites).toEqual([])
  })

  it('un follow importado por versiones antiguas no reaparece como pin después de unfollow y relogin', async () => {
    sync.fetchCloudFavorites.mockResolvedValue(['follow_a'])
    const first = renderHook(() => useFavoriteChannels(alice))
    await flush()
    first.unmount()
    sync.fetchFollowedChannels.mockResolvedValue([])
    const second = renderHook(() => useFavoriteChannels(alice))
    await flush()
    expect(second.result.current.favorites).toEqual([])
  })

  it('no consulta follows en segundo plano y refresca cuando vuelve a estar visible', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    renderHook(() => useFavoriteChannels(alice))
    await flush()
    await act(async () => { await vi.advanceTimersByTimeAsync(120000) })
    expect(sync.fetchFollowedChannels).toHaveBeenCalledTimes(1)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(sync.fetchFollowedChannels).toHaveBeenCalledTimes(2)
  })
})
