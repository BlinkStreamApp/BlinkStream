import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { OfficialModView } from './OfficialModView'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../../utils/tauriEnv', () => ({ isTauri: () => true, safeOpenUrl: vi.fn() }))
vi.mock('../VideoPlayer', () => ({ default: props => <div data-testid="hybrid-player" data-channel={props.channel} data-quality={props.quality} data-volume={props.volume}>
  <button onClick={() => props.onQualityChange('720p')}>Test quality</button>
  <button onClick={() => props.onVolumeChange(25)}>Test volume</button>
</div> }))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  invoke.mockResolvedValue(undefined)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 80, right: 810, bottom: 580, width: 800, height: 500 })
})

describe('Official moderation host', () => {
  it('adds and removes the BlinkStream player without remounting the official page', async () => {
    const onQualityChange = vi.fn()
    const onVolumeChange = vi.fn()
    render(<OfficialModView channel="AlbertPlayXD" quality="best" volume={50} onQualityChange={onQualityChange} onVolumeChange={onVolumeChange} />)
    expect(screen.queryByTestId('hybrid-player')).not.toBeInTheDocument()
    const host = screen.getByTestId('official-modview-host')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar vídeo BlinkStream' }))
    const player = await screen.findByTestId('hybrid-player')
    expect(player).toHaveAttribute('data-channel', 'albertplayxd')
    expect(player).toHaveAttribute('data-volume', '50')
    expect(player).toHaveAttribute('data-quality', 'best')
    expect(screen.getByText(/Anclarlo no detiene/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Test quality' }))
    fireEvent.click(screen.getByRole('button', { name: 'Test volume' }))
    expect(onQualityChange).toHaveBeenCalledWith('720p')
    expect(onVolumeChange).toHaveBeenCalledWith(25)
    fireEvent.change(screen.getByRole('slider', { name: 'Ancho del vídeo' }), { target: { value: '55' } })
    expect(screen.getByTestId('hybrid-video-panel')).toHaveStyle({ width: '55%' })
    expect(localStorage.getItem('bs.modview.hybrid.width')).toBe('55')
    HTMLElement.prototype.getBoundingClientRect.mockReturnValue({ left: 350, top: 80, right: 810, bottom: 580, width: 460, height: 500 })
    fireEvent(window, new Event('resize'))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('update_official_modview_bounds', expect.objectContaining({ x: 350, height: 500, visible: true })))
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar vídeo BlinkStream' }))
    expect(screen.queryByTestId('hybrid-player')).not.toBeInTheDocument()
    expect(screen.getByTestId('official-modview-host')).toBe(host)
    expect(invoke.mock.calls.filter(([command]) => command === 'mount_official_modview')).toHaveLength(1)
    expect(invoke.mock.calls.filter(([command]) => command === 'unmount_official_modview')).toHaveLength(0)
  })

  it.each([['invalid', '40%'], ['NaN', '40%'], ['100', '55%'], ['-10', '25%']])('bounds a saved video size of %s', async (saved, expected) => {
    localStorage.setItem('bs.modview.hybrid.width', saved)
    render(<OfficialModView channel="testchannel" />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar vídeo BlinkStream' }))
    expect(await screen.findByTestId('hybrid-video-panel')).toHaveStyle({ width: expected })
  })

  it('mounts the official channel without tokens and resizes without navigating again', async () => {
    const view = render(<OfficialModView channel="AlbertPlayXD" />)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('mount_official_modview', {
      session: expect.stringMatching(/^[a-f0-9]{32}$/), channel: 'albertplayxd', x: 10, y: 80, width: 800, height: 500,
    }))
    fireEvent(window, new Event('resize'))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('update_official_modview_bounds', expect.objectContaining({ visible: true })))
    expect(invoke.mock.calls.filter(([command]) => command === 'mount_official_modview')).toHaveLength(1)
    const session = invoke.mock.calls[0][1].session
    view.unmount()
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('unmount_official_modview', { session }))
  })

  it('closes a late mount using only its old session', async () => {
    let finish
    invoke.mockImplementation(command => command === 'mount_official_modview' && !finish
      ? new Promise(resolve => { finish = resolve }) : Promise.resolve())
    const view = render(<OfficialModView channel="oldchannel" />)
    const oldSession = invoke.mock.calls[0][1].session
    view.rerender(<OfficialModView channel="newchannel" />)
    const newSession = invoke.mock.calls.find(([command, args]) => command === 'mount_official_modview' && args.channel === 'newchannel')[1].session
    await act(async () => finish())
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('unmount_official_modview', { session: oldSession }))
    expect(invoke).not.toHaveBeenCalledWith('unmount_official_modview', { session: newSession })
  })

  it('avoids native resize calls for unrelated player DOM changes', async () => {
    render(<OfficialModView channel="testchannel" />)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('update_official_modview_bounds', expect.objectContaining({ visible: true })))
    invoke.mockClear()
    const progress = document.createElement('div')
    await act(async () => {
      document.body.appendChild(progress)
      progress.style.width = '10%'
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    expect(invoke).not.toHaveBeenCalled()
    progress.remove()
  })

  it('hides the native surface behind visible dialogs', async () => {
    render(<OfficialModView channel="testchannel" />)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('update_official_modview_bounds', expect.objectContaining({ visible: true })))
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('update_official_modview_bounds', expect.objectContaining({ visible: false })))
    invoke.mockClear()
    dialog.remove()
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('update_official_modview_bounds', expect.objectContaining({ visible: true })))
  })

  it('reports failures and retries with a fresh session', async () => {
    invoke.mockRejectedValueOnce(new Error('native failure'))
    render(<OfficialModView channel="testchannel" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo abrir la vista oficial')
    const oldSession = invoke.mock.calls[0][1].session
    fireEvent.click(screen.getByRole('button', { name: 'Recargar' }))
    await waitFor(() => expect(invoke.mock.calls.filter(([command]) => command === 'mount_official_modview')).toHaveLength(2))
    const sessions = invoke.mock.calls.filter(([command]) => command === 'mount_official_modview').map(([, args]) => args.session)
    expect(sessions[1]).not.toBe(oldSession)
  })

  it('hides official tools during BlinkStream fullscreen and restores them on exit', async () => {
    render(<OfficialModView channel="testchannel" />)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('update_official_modview_bounds', expect.objectContaining({ visible: true })))
    try {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.createElement('video') })
      fireEvent(document, new Event('fullscreenchange'))
      await waitFor(() => expect(invoke).toHaveBeenCalledWith('update_official_modview_bounds', expect.objectContaining({ visible: false })))
    } finally { delete document.fullscreenElement }
    invoke.mockClear()
    fireEvent(document, new Event('fullscreenchange'))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('update_official_modview_bounds', expect.objectContaining({ visible: true })))
    expect(invoke).not.toHaveBeenCalledWith('mount_official_modview', expect.anything())
  })

  it('never passes arbitrary URLs as channels to the native host', () => {
    render(<OfficialModView channel="https://evil.test/" />)
    expect(invoke).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Abrir en navegador' })).not.toBeInTheDocument()
  })
})
