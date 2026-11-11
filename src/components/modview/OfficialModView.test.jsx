import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { OfficialModView } from './OfficialModView'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))
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
  it('fits only the real video slot and restores the complete tools page without restarting video', async () => {
    invoke.mockImplementation(command => Promise.resolve(command === 'mount_official_modview' ? true : command === 'get_official_modview_video_bounds' ? { x: 0.1, y: 0.12, width: 0.35, height: 0.32 } : undefined))
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return this.dataset.testid === 'hybrid-video-panel'
        ? { left: 90, top: 140, right: 370, bottom: 300, width: 280, height: 160 }
        : { left: 10, top: 80, right: 810, bottom: 580, width: 800, height: 500 }
    })
    render(<OfficialModView channel="testchannel" />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar vídeo BlinkStream' }))
    const player = await screen.findByTestId('hybrid-player')
    fireEvent.change(await screen.findByRole('combobox', { name: 'Distribución' }), { target: { value: 'corner' } })
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('update_official_modview_bounds', expect.objectContaining({ corner: { x: 80, y: 60, width: 280, height: 160 } })))
    expect(screen.getByTestId('hybrid-video-panel')).toHaveStyle({ position: 'absolute', left: '10%', top: '12%' })
    expect(screen.getByTestId('hybrid-player')).toBe(player)
    expect(invoke.mock.calls.filter(([command]) => command === 'mount_official_modview')).toHaveLength(1)
    expect(localStorage.getItem('bs.modview.hybrid.layout')).toBe('corner')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar vídeo BlinkStream' }))
    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith('update_official_modview_bounds', expect.objectContaining({ corner: null })))
    expect(screen.queryByTestId('hybrid-player')).not.toBeInTheDocument()
    expect(invoke.mock.calls.filter(([command]) => command === 'mount_official_modview')).toHaveLength(1)
  })

  it('does not offer native corner clipping on an unsupported platform', async () => {
    render(<OfficialModView channel="testchannel" />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar vídeo BlinkStream' }))
    await screen.findByTestId('hybrid-player')
    expect(screen.queryByRole('combobox', { name: 'Distribución' })).not.toBeInTheDocument()
  })

  it('leaves official tools complete when their video panel is missing instead of masking headers', async () => {
    invoke.mockImplementation(command => Promise.resolve(command === 'mount_official_modview' ? true : null))
    render(<OfficialModView channel="testchannel" />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar vídeo BlinkStream' }))
    const player = await screen.findByTestId('hybrid-player')
    fireEvent.change(await screen.findByRole('combobox', { name: 'Distribución' }), { target: { value: 'corner' } })
    expect(await screen.findByRole('status')).toHaveTextContent('Restaura y muestra el panel Stream')
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('get_official_modview_video_bounds', expect.anything()))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Distribución' })).toHaveValue('columns'))
    expect(screen.getByTestId('hybrid-video-panel')).not.toHaveStyle({ visibility: 'hidden' })
    expect(screen.getByTestId('hybrid-player')).toBe(player)
    expect(localStorage.getItem('bs.modview.hybrid.layout')).toBe('columns')
    expect(invoke.mock.calls.filter(([command, args]) => command === 'update_official_modview_bounds' && args.corner)).toHaveLength(0)
  })

  it('restores columns and reports a rejected native corner without recreating the player', async () => {
    invoke.mockImplementation((command, args) => command === 'update_official_modview_bounds' && args.corner
      ? Promise.reject(new Error('native clipping failed')) : Promise.resolve(command === 'mount_official_modview' ? true : command === 'get_official_modview_video_bounds' ? { x: 0.1, y: 0.12, width: 0.35, height: 0.32 } : undefined))
    render(<OfficialModView channel="testchannel" />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar vídeo BlinkStream' }))
    const player = await screen.findByTestId('hybrid-player')
    const layout = await screen.findByRole('combobox', { name: 'Distribución' })
    fireEvent.change(layout, { target: { value: 'corner' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Se ha restaurado la distribución lateral')
    expect(layout).toHaveValue('columns')
    expect(screen.getByTestId('hybrid-player')).toBe(player)
    expect(localStorage.getItem('bs.modview.hybrid.layout')).toBe('columns')
  })
  it('keeps the native video while requesting a separate or embedded tools page', async () => {
    render(<OfficialModView channel="testchannel" />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desacoplar Twitch' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar vídeo BlinkStream' }))
    const player = await screen.findByTestId('hybrid-player')
    const session = invoke.mock.calls.find(([command]) => command === 'mount_official_modview')[1].session
    fireEvent.click(screen.getByRole('button', { name: 'Desacoplar Twitch' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Acoplar Twitch' })).toBeEnabled())
    expect(invoke).toHaveBeenCalledWith('set_official_modview_detached', { session, detached: true })
    expect(screen.getByTestId('hybrid-player')).toBe(player)
    expect(screen.getByTestId('hybrid-video-panel')).toHaveStyle({ width: '100%', height: '100%' })
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Acoplar Twitch' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desacoplar Twitch' })).toBeEnabled())
    expect(invoke).toHaveBeenCalledWith('set_official_modview_detached', { session, detached: false })
    expect(screen.getByTestId('hybrid-player')).toBe(player)
    expect(invoke.mock.calls.filter(([command]) => command === 'mount_official_modview')).toHaveLength(1)
    expect(invoke.mock.calls.filter(([command]) => command === 'unmount_official_modview')).toHaveLength(0)
    expect(screen.getByRole('separator')).toBeInTheDocument()
  })

  it('docks only its own native close event and removes a late listener after unmount', async () => {
    const unlisten = vi.fn()
    listen.mockResolvedValue(unlisten)
    const view = render(<OfficialModView channel="testchannel" />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desacoplar Twitch' })).toBeEnabled())
    const session = invoke.mock.calls.find(([command]) => command === 'mount_official_modview')[1].session
    const handler = listen.mock.calls.find(([event]) => event === 'bs:official-modview-dock')[1]
    invoke.mockClear()
    await act(async () => handler({ payload: 'other-session' }))
    expect(invoke).not.toHaveBeenCalledWith('set_official_modview_detached', expect.anything())
    await act(async () => handler({ payload: session }))
    expect(invoke).toHaveBeenCalledWith('set_official_modview_detached', { session, detached: false })
    view.unmount()
    await waitFor(() => expect(unlisten).toHaveBeenCalledOnce())
  })

  it('keeps the player and embedded mode if moving tools fails', async () => {
    render(<OfficialModView channel="testchannel" />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desacoplar Twitch' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar vídeo BlinkStream' }))
    const player = await screen.findByTestId('hybrid-player')
    invoke.mockImplementation(command => command === 'set_official_modview_detached' ? Promise.reject(new Error('move failed')) : Promise.resolve())
    fireEvent.click(screen.getByRole('button', { name: 'Desacoplar Twitch' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo mover Twitch')
    expect(screen.getByTestId('hybrid-player')).toBe(player)
    expect(screen.getByRole('button', { name: 'Desacoplar Twitch' })).toBeEnabled()
  })
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
    fireEvent.change(screen.getByRole('slider', { name: 'Tamaño del vídeo' }), { target: { value: '45' } })
    expect(screen.getByTestId('hybrid-video-panel')).toHaveStyle({ width: '45%' })
    expect(localStorage.getItem('bs.modview.hybrid.width')).toBe('45')
    HTMLElement.prototype.getBoundingClientRect.mockReturnValue({ left: 350, top: 80, right: 810, bottom: 580, width: 460, height: 500 })
    fireEvent(window, new Event('resize'))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('update_official_modview_bounds', expect.objectContaining({ x: 350, height: 500, visible: true })))
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar vídeo BlinkStream' }))
    expect(screen.queryByTestId('hybrid-player')).not.toBeInTheDocument()
    expect(screen.getByTestId('official-modview-host')).toBe(host)
    expect(invoke.mock.calls.filter(([command]) => command === 'mount_official_modview')).toHaveLength(1)
    expect(invoke.mock.calls.filter(([command]) => command === 'unmount_official_modview')).toHaveLength(0)
  })

  it.each([['invalid', '35%'], ['NaN', '35%'], ['100', '45%'], ['-10', '25%']])('bounds a saved video size of %s', async (saved, expected) => {
    localStorage.setItem('bs.modview.hybrid.width', saved)
    render(<OfficialModView channel="testchannel" />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar vídeo BlinkStream' }))
    expect(await screen.findByTestId('hybrid-video-panel')).toHaveStyle({ width: expected })
  })

  it('mounts the official channel without tokens and resizes without navigating again', async () => {
    const view = render(<OfficialModView channel="AlbertPlayXD" />)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('mount_official_modview', {
      session: expect.stringMatching(/^[a-f0-9]{32}$/), channel: 'albertplayxd', x: 10, y: 80, width: 800, height: 500, zoom: null,
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

  it('changes Twitch scale without remounting the page or player', async () => {
    render(<OfficialModView channel="testchannel" />)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('update_official_modview_bounds', expect.objectContaining({ zoom: null })))
    fireEvent.change(screen.getByRole('combobox', { name: 'Escala de Twitch' }), { target: { value: '0.8' } })
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('update_official_modview_bounds', expect.objectContaining({ zoom: 0.8 })))
    expect(localStorage.getItem('bs.modview.tools.zoom')).toBe('0.8')
    expect(invoke.mock.calls.filter(([command]) => command === 'mount_official_modview')).toHaveLength(1)
    expect(invoke.mock.calls.filter(([command]) => command === 'unmount_official_modview')).toHaveLength(0)
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


it('docks on four edges and resizes with keyboard without remounting page or player', async () => {
  render(<OfficialModView channel="testchannel" />)
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar vídeo BlinkStream' }))
  const player = await screen.findByTestId('hybrid-player')
  const host = screen.getByTestId('official-modview-host')
  const positions = screen.getByRole('combobox', { name: 'Posición del vídeo' })
  for (const [side, direction] of [['right', 'row-reverse'], ['top', 'column'], ['bottom', 'column-reverse'], ['left', 'row']]) {
    fireEvent.change(positions, { target: { value: side } })
    expect(screen.getByTestId('mod-workspace')).toHaveStyle({ flexDirection: direction })
    expect(screen.getByTestId('hybrid-player')).toBe(player)
    expect(screen.getByTestId('official-modview-host')).toBe(host)
  }
  fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
  expect(screen.getByTestId('hybrid-video-panel')).toHaveStyle({ width: '37%' })
  expect(invoke.mock.calls.filter(([cmd]) => cmd === 'mount_official_modview')).toHaveLength(1)
})
