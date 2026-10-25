import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { OfficialModView } from './OfficialModView'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../../utils/tauriEnv', () => ({ isTauri: () => true, safeOpenUrl: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  invoke.mockResolvedValue(undefined)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 80, right: 810, bottom: 580, width: 800, height: 500 })
})

describe('Official moderation host', () => {
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

  it('never passes arbitrary URLs as channels to the native host', () => {
    render(<OfficialModView channel="https://evil.test/" />)
    expect(invoke).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Abrir en navegador' })).not.toBeInTheDocument()
  })
})
