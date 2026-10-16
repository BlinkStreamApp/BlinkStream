import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import HomeScreen from './HomeScreen'

vi.mock('../utils/i18n', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, useT: () => (key, fallback) => fallback || actual.t(key) }
})
vi.mock('../utils/twitch', () => ({
  PUBLIC_CLIENT_ID: 'test-client',
  getHeaders: vi.fn(async () => ({})),
  sanitizeChannelForGraphQL: ch => ch,
}))

const props = {
  onSelect: vi.fn(), onToggleFavorite: vi.fn(), onShowAbout: vi.fn(),
  favorites: ['old_follow'], recentChannels: ['old_recent'],
}

describe('HomeScreen después de cerrar sesión', () => {
  it('checks collection-only channels and distinguishes offline from unknown status', async () => {
    localStorage.setItem('blinkstream_collections_v1:alice', JSON.stringify([{ id: 'one', name: 'Gaming', channels: ['only_collection'] }]))
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      if (String(url).includes('/helix/streams?')) return { ok: true, json: async () => ({ data: [] }) }
      return { ok: false }
    })
    const { unmount } = render(<HomeScreen {...props} isLoggedIn categorySessionKey="alice" />)
    await waitFor(() => expect(screen.getByText('OFFLINE')).toBeInTheDocument())
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('user_login=only_collection'))).toBe(true)
    unmount()
    sessionStorage.clear()
    fetchSpy.mockResolvedValue({ ok: false })
    render(<HomeScreen {...props} isLoggedIn categorySessionKey="alice" />)
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    expect(screen.queryByText('OFFLINE')).not.toBeInTheDocument()
    expect(screen.getByText('Sin confirmar')).toBeInTheDocument()
  })
  it('muestra bienvenida sin historial, favoritos, recomendaciones ni consultas aunque reciba datos antiguos', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<HomeScreen {...props} isLoggedIn={false} />)
    expect(screen.getByRole('heading', { name: 'Descubre BlinkStream' })).toBeInTheDocument()
    expect(screen.queryByText('old_follow')).not.toBeInTheDocument()
    expect(screen.queryByText('old_recent')).not.toBeInTheDocument()
    expect(screen.queryByText('Vistos Recientemente')).not.toBeInTheDocument()
    expect(screen.queryByText('Juegos populares')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Explorar categorías' })).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('la transición autenticado → invitado oculta inmediatamente los datos visibles', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false })
    const { rerender } = render(<HomeScreen {...props} isLoggedIn />)
    expect(screen.getAllByText('old_recent').length).toBeGreaterThan(0)
    rerender(<HomeScreen {...props} isLoggedIn={false} />)
    expect(screen.getByRole('heading', { name: 'Descubre BlinkStream' })).toBeInTheDocument()
    expect(screen.queryByText('old_recent')).not.toBeInTheDocument()
    expect(screen.queryByText('old_follow')).not.toBeInTheDocument()
  })
})
