import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ChannelCollections from './ChannelCollections'
import { collectionsKey } from '../utils/channelCollections'

function create(name) {
  fireEvent.click(screen.getByRole('button', { name: 'Nueva colección' }))
  fireEvent.change(screen.getByLabelText('Nombre de la nueva colección'), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Crear colección' }))
}
function add(channel) {
  fireEvent.change(screen.getByLabelText('Canal para añadir'), { target: { value: channel } })
  fireEvent.click(screen.getByRole('button', { name: 'Añadir canal' }))
}
function openEditor() { expect(screen.getByRole('heading', { name: /Tus colecciones/ })).toBeVisible() }

describe('ChannelCollections', () => {
  it('creates, adds, opens, renames, reorders and restores a deleted collection', () => {
    const onSelect = vi.fn()
    render(<ChannelCollections owner="alice" favorites={['first']} onSelect={onSelect} />)
    openEditor(); create('Gaming'); add('first'); add('second')
    fireEvent.click(screen.getByRole('button', { name: 'Subir second' }))
    expect(JSON.parse(localStorage.getItem(collectionsKey('alice')))[0].channels).toEqual(['second', 'first'])
    fireEvent.click(screen.getByRole('button', { name: 'first', exact: true }))
    expect(onSelect).toHaveBeenCalledWith('first')
    fireEvent.change(screen.getByLabelText('Renombrar colección'), { target: { value: 'Esports' } })
    fireEvent.click(screen.getByRole('button', { name: 'Renombrar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar colección' }))
    expect(JSON.parse(localStorage.getItem(collectionsKey('alice')))).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(JSON.parse(localStorage.getItem(collectionsKey('alice')))[0]).toMatchObject({ name: 'Esports', channels: ['second', 'first'] })
  })
  it('never shares drafts, undo, selection or lists between accounts or guests', () => {
    const { rerender } = render(<ChannelCollections owner="alice" onSelect={vi.fn()} />)
    openEditor(); create('Privada'); add('first')
    rerender(<ChannelCollections owner="bob" onSelect={vi.fn()} />)
    expect(screen.queryByText('Privada')).not.toBeInTheDocument()
    openEditor()
    expect(screen.queryByLabelText('Nombre de la nueva colección')).not.toBeInTheDocument()
    create('Bob')
    rerender(<ChannelCollections owner={null} onSelect={vi.fn()} />)
    expect(screen.queryByLabelText('Colecciones de canales')).not.toBeInTheDocument()
    rerender(<ChannelCollections owner="alice" onSelect={vi.fn()} />)
    openEditor()
    expect(screen.getByRole('button', { name: /Privada/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Bob/ })).not.toBeInTheDocument()
  })
  it('shows persistence errors without claiming a successful save', () => {
    render(<ChannelCollections owner="alice" onSelect={vi.fn()} />)
    openEditor()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    create('Gaming')
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar')
    expect(screen.queryByLabelText('Renombrar colección')).not.toBeInTheDocument()
  })

  it('shows saved channels immediately and keeps editing separate from watching', () => {
    localStorage.setItem(collectionsKey('alice'), JSON.stringify([{ id: 'one', name: 'Gaming', channels: ['first'] }]))
    const onSelect = vi.fn()
    render(<ChannelCollections owner="alice" onSelect={onSelect} liveStatus={{ first: { live: true, game: 'Rust' } }} />)
    expect(screen.getByRole('button', { name: 'first', exact: true })).toBeVisible()
    expect(screen.getByText('EN VIVO')).toBeVisible()
    expect(screen.queryByLabelText('Renombrar colección')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar first de la colección' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'first', exact: true }))
    expect(onSelect).toHaveBeenCalledWith('first')
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar' }))
    expect(screen.getByLabelText('Renombrar colección')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Terminar edición' }))
    expect(screen.queryByLabelText('Renombrar colección')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'first', exact: true })).toBeVisible()
  })

  it('uploads a local cover, changes color and preserves the cover through delete/undo', async () => {
    localStorage.setItem(collectionsKey('alice'), JSON.stringify([{ id: 'one', name: 'Gaming', channels: ['first'] }]))
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 400, height: 600, close: vi.fn() }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), drawImage: vi.fn() })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,YQ==')
    render(<ChannelCollections owner="alice" onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar' }))
    fireEvent.change(screen.getByLabelText('Subir portada'), { target: { files: [new File(['image'], 'cover.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(JSON.parse(localStorage.getItem(collectionsKey('alice')))[0].cover).toBe('data:image/jpeg;base64,YQ=='))
    fireEvent.change(screen.getByLabelText('Color de la tarjeta'), { target: { value: 'cyan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar colección' }))
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(JSON.parse(localStorage.getItem(collectionsKey('alice')))[0]).toMatchObject({ cover: 'data:image/jpeg;base64,YQ==', color: 'cyan', channels: ['first'] })
  })

  it('opens the hidden file picker from the compact upload button', () => {
    localStorage.setItem(collectionsKey('alice'), JSON.stringify([{ id: 'one', name: 'Gaming', channels: [] }]))
    render(<ChannelCollections owner="alice" onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar' }))
    const picker = screen.getByLabelText('Subir portada')
    const click = vi.spyOn(picker, 'click')
    expect(picker).toHaveClass('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'Subir imagen' }))
    expect(click).toHaveBeenCalledOnce()
    expect(screen.getByRole('heading', { name: 'Personaliza tu colección' })).toBeVisible()
  })

  it('minimizes content without losing selection or drafts and remembers it per account', () => {
    localStorage.setItem(collectionsKey('alice'), JSON.stringify([{ id: 'one', name: 'Gaming', channels: ['first'] }]))
    const { rerender, unmount } = render(<ChannelCollections owner="alice" onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar' }))
    fireEvent.change(screen.getByLabelText('Canal para añadir'), { target: { value: 'draft_channel' } })
    fireEvent.click(screen.getByRole('button', { name: 'Minimizar' }))
    expect(screen.queryByRole('button', { name: 'first', exact: true })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expandir' })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir' }))
    expect(screen.getByLabelText('Canal para añadir')).toHaveValue('draft_channel')
    expect(screen.getByRole('button', { name: 'first', exact: true })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Minimizar' }))
    rerender(<ChannelCollections owner="bob" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Minimizar' })).toBeVisible()
    unmount()
    render(<ChannelCollections owner="alice" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Expandir' })).toBeVisible()
  })
})
