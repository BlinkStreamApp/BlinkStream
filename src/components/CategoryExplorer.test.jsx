import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCategories, fetchCategoryStreams } from '../utils/categories'
import CategoryExplorer from './CategoryExplorer'

vi.mock('../utils/categories', () => ({ fetchCategories: vi.fn(), fetchCategoryStreams: vi.fn() }))
vi.mock('../utils/i18n', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, useT: () => (key, fallback) => fallback || actual.t(key) }
})
const games = [{ id: 'A', name: 'AION 2' }, { id: 'B', name: 'Rust' }]
const page = (items, cursor = '') => ({ items, cursor })
const stream = (id, name) => ({ id, user_login: name.toLowerCase(), user_name: name, title: `Live ${name}`, language: 'es', viewer_count: 42 })

describe('CategoryExplorer', () => {
  beforeEach(() => {
    vi.mocked(fetchCategories).mockReset().mockResolvedValue(page(games))
    vi.mocked(fetchCategoryStreams).mockReset().mockResolvedValue(page([stream('1', 'Channel')]))
  })

  it('pins categories first, filters favorites, hides and restores without a Twitch write', async () => {
    render(<CategoryExplorer owner="alice" onSelect={vi.fn()} />)
    await screen.findByRole('button', { name: 'Rust', exact: true })
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar categorías' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fijar Rust' }))
    expect(screen.getByRole('button', { name: 'Fijar Rust' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Solo favoritas' }))
    expect(screen.queryByRole('button', { name: 'AION 2', exact: true })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar Rust' }))
    expect(screen.queryByRole('button', { name: 'Rust', exact: true })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(screen.getByRole('button', { name: 'Rust', exact: true })).toBeVisible()
    expect(JSON.parse(localStorage.getItem('blinkstream_category_preferences_v1:alice')).favorites[0].id).toBe('B')
  })

  it('keeps hidden preferences scoped to account and restores after remount', async () => {
    const { rerender } = render(<CategoryExplorer owner="alice" onSelect={vi.fn()} />)
    await screen.findByRole('button', { name: 'Rust', exact: true })
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar categorías' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar Rust' }))
    rerender(<CategoryExplorer owner="bob" onSelect={vi.fn()} />)
    await screen.findByRole('button', { name: 'Rust', exact: true })
    rerender(<CategoryExplorer owner="alice" onSelect={vi.fn()} />)
    await screen.findByRole('button', { name: 'AION 2', exact: true })
    expect(screen.queryByRole('button', { name: 'Rust', exact: true })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar categorías' }))
    fireEvent.click(screen.getByRole('button', { name: 'Categorías ocultas (1)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar Rust' }))
    expect(screen.getByRole('button', { name: 'Rust', exact: true })).toBeVisible()
  })

  it('shows cached pins outside the feed and explains empty favorites without a false API empty state', async () => {
    localStorage.setItem('blinkstream_category_preferences_v1:alice', JSON.stringify({ favorites: [{ id: 'C', name: 'Music' }] }))
    fetchCategories.mockResolvedValue(page([]))
    render(<CategoryExplorer owner="alice" onSelect={vi.fn()} />)
    await waitFor(() => expect(screen.queryByText('Consultando Twitch…')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Music', exact: true })).toBeVisible()
    expect(screen.queryByText(/No se encontraron categorías/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Solo favoritas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar categorías' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fijar Music' }))
    expect(screen.getByText(/No hay categorías visibles con estos filtros/)).toBeVisible()
  })

  it('hiding the active category aborts its stream request and ignores a late reply', async () => {
    let finish
    fetchCategoryStreams.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    render(<CategoryExplorer owner="alice" onSelect={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Rust', exact: true }))
    await waitFor(() => expect(fetchCategoryStreams).toHaveBeenCalledTimes(1))
    const signal = fetchCategoryStreams.mock.calls[0][0].signal
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar categorías' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar Rust' }))
    expect(signal.aborted).toBe(true)
    await act(async () => finish(page([stream('old', 'LateChannel')])))
    expect(screen.queryByText('LateChannel')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'En vivo en Rust' })).not.toBeInTheDocument()
  })

  it('does not hide a category when saving fails', async () => {
    render(<CategoryExplorer owner="alice" onSelect={vi.fn()} />)
    await screen.findByRole('button', { name: 'Rust', exact: true })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar categorías' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar Rust' }))
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron guardar')
    expect(screen.getByRole('button', { name: 'Rust', exact: true })).toBeVisible()
  })
  it('only shows category actions while managing, preserves pins and closes management on account change', async () => {
    const { rerender } = render(<CategoryExplorer owner="alice" onSelect={vi.fn()} />)
    await screen.findByRole('button', { name: 'Rust', exact: true })
    expect(screen.queryByRole('button', { name: 'Fijar Rust' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ocultar Rust' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar categorías' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fijar Rust' }))
    fireEvent.click(screen.getByRole('button', { name: 'Categorías ocultas (0)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terminar edición' }))
    expect(screen.queryByRole('button', { name: 'Fijar Rust' })).not.toBeInTheDocument()
    expect(screen.queryByText('No tienes categorías ocultas.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar categorías' }))
    expect(screen.getByRole('button', { name: 'Fijar Rust' })).toHaveAttribute('aria-pressed', 'true')
    rerender(<CategoryExplorer owner="bob" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Gestionar categorías' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Fijar Rust' })).not.toBeInTheDocument()
  })

  it('keeps popular cards, expands on demand and opens the exact selected stream', async () => {
    const onSelect = vi.fn()
    render(<CategoryExplorer onSelect={onSelect} />)
    const all = screen.getByRole('button', { name: 'Explorar todas' })
    expect(all).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(all)
    expect(screen.getByRole('button', { name: 'Vista compacta' })).toHaveAttribute('aria-expanded', 'true')
    const game = await screen.findByRole('button', { name: 'AION 2' })
    fireEvent.click(game)
    expect(game).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'En vivo en AION 2' })).toHaveFocus()
    fireEvent.click(await screen.findByRole('button', { name: /Channel.*Live Channel/ }))
    expect(onSelect).toHaveBeenCalledWith('channel')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(game).toHaveFocus()
  })
  it('searches beyond the popular categories after debounce', async () => {
    render(<CategoryExplorer onSelect={vi.fn()} />)
    await screen.findByRole('button', { name: 'AION 2' })
    fetchCategories.mockResolvedValue(page([{ id: 'C', name: 'Music' }]))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar juego o categoría' }), { target: { value: 'Music' } })
    expect(screen.queryByRole('button', { name: 'AION 2' })).not.toBeInTheDocument()
    await screen.findByRole('button', { name: 'Music' })
    expect(fetchCategories).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'Music' }))
  })
  it('cannot show old-category results after selecting another category', async () => {
    let resolveOld
    fetchCategoryStreams.mockImplementation(({ categoryId }) => categoryId === 'A'
      ? new Promise(resolve => { resolveOld = resolve }) : Promise.resolve(page([stream('B', 'NewChannel')])))
    render(<CategoryExplorer onSelect={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'AION 2' }))
    await waitFor(() => expect(fetchCategoryStreams).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Rust' }))
    await screen.findByRole('button', { name: /NewChannel.*Live NewChannel/ })
    await act(async () => resolveOld(page([stream('A', 'OldChannel')])))
    expect(screen.queryByText('OldChannel')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'En vivo en Rust' })).toBeInTheDocument()
  })
  it('filters by language and distinguishes a failed query from no live streams', async () => {
    render(<CategoryExplorer onSelect={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'AION 2' }))
    await screen.findByText('Channel')
    fetchCategoryStreams.mockRejectedValueOnce(Object.assign(new Error('expired'), { code: 'auth' })).mockResolvedValueOnce(page([]))
    fireEvent.change(screen.getByRole('combobox', { name: 'Idioma' }), { target: { value: 'es' } })
    expect(screen.queryByText('Channel')).not.toBeInTheDocument()
    await screen.findByRole('alert')
    expect(fetchCategoryStreams).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: 'A', language: 'es' }))
    expect(screen.queryByText(/No hay directos/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await screen.findByText(/No hay directos en esta categoría para el idioma/)
  })
  it('loads more categories and streams without duplicating cards', async () => {
    fetchCategories.mockResolvedValueOnce(page(games, 'categories-2')).mockResolvedValueOnce(page([games[1], { id: 'C', name: 'Music' }]))
    fetchCategoryStreams.mockResolvedValueOnce(page([stream('1', 'First')], 'streams-2')).mockResolvedValueOnce(page([stream('1', 'First'), stream('2', 'Second')]))
    render(<CategoryExplorer onSelect={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cargar más categorías' }))
    await screen.findByRole('button', { name: 'Music' })
    expect(screen.getAllByRole('button', { name: 'Rust' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'AION 2' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cargar más directos' }))
    await screen.findByText('Second')
    expect(screen.getAllByText('First')).toHaveLength(1)
  })
  it('announces loading more categories and prevents duplicate requests', async () => {
    let resolveMore
    fetchCategories.mockResolvedValueOnce(page(games, 'categories-2')).mockImplementationOnce(() => new Promise(resolve => { resolveMore = resolve }))
    render(<CategoryExplorer onSelect={vi.fn()} />)
    const more = await screen.findByRole('button', { name: 'Cargar más categorías' })
    expect(more).toHaveAttribute('aria-busy', 'false')
    fireEvent.click(more)
    const loading = screen.getByRole('button', { name: 'Consultando Twitch…' })
    expect(loading).toBeDisabled()
    expect(loading).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Vista compacta' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(loading)
    expect(fetchCategories).toHaveBeenCalledTimes(2)
    await act(async () => resolveMore(page([{ id: 'C', name: 'Music' }], 'categories-3')))
    expect(screen.getByRole('button', { name: 'Cargar más categorías' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cargar más categorías' })).toHaveAttribute('aria-busy', 'false')
  })
  it('unmount cancels in-flight browsing requests', async () => {
    fetchCategories.mockReturnValue(new Promise(() => {}))
    const { unmount } = render(<CategoryExplorer onSelect={vi.fn()} />)
    await waitFor(() => expect(fetchCategories).toHaveBeenCalledTimes(1))
    const signal = fetchCategories.mock.calls[0][0].signal
    unmount()
    expect(signal.aborted).toBe(true)
  })
  it('shows full language names and codes, not only faint abbreviations', async () => {
    fetchCategoryStreams.mockResolvedValue(page([
      { ...stream('es', 'Spanish'), language: 'es' },
      { ...stream('fr', 'French'), language: 'fr' },
      { ...stream('en', 'EnglishChannel'), language: 'en' },
    ]))
    render(<CategoryExplorer onSelect={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'AION 2' }))
    expect(await screen.findByTitle('Idioma: Español')).toHaveTextContent('EspañolES')
    expect(screen.getByTitle('Idioma: Francés')).toHaveTextContent('FrancésFR')
    expect(screen.getByTitle('Idioma: Inglés')).toHaveTextContent('InglésEN')
  })
  it('does not invent a language when Twitch omits it', async () => {
    fetchCategoryStreams.mockResolvedValue(page([{ ...stream('1', 'Unknown'), language: '' }, { ...stream('2', 'Other'), language: 'other' }]))
    render(<CategoryExplorer onSelect={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'AION 2' }))
    expect(await screen.findByTitle('Idioma: Idioma no indicado')).toBeInTheDocument()
    expect(screen.getByTitle('Idioma: Otros idiomas')).toBeInTheDocument()
  })
})
