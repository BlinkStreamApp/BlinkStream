import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import HomeScreen from './HomeScreen'

vi.mock('../utils/i18n', () => ({ useT: () => (_key, fallback) => fallback }))
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
  it('muestra bienvenida sin historial, favoritos, recomendaciones ni consultas aunque reciba datos antiguos', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<HomeScreen {...props} isLoggedIn={false} />)
    expect(screen.getByRole('heading', { name: 'Descubre BlinkStream' })).toBeInTheDocument()
    expect(screen.queryByText('old_follow')).not.toBeInTheDocument()
    expect(screen.queryByText('old_recent')).not.toBeInTheDocument()
    expect(screen.queryByText('Vistos Recientemente')).not.toBeInTheDocument()
    expect(screen.queryByText('Juegos populares')).not.toBeInTheDocument()
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
