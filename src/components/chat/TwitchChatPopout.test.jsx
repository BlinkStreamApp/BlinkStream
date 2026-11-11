import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react'
import { TwitchChatPopout } from './TwitchChatPopout'
import { openTwitchChatPopoutWindow } from '../../utils/twitchPopout'
import * as tauriEnv from '../../utils/tauriEnv'
import { invoke } from '@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('TwitchChatPopout', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
  beforeEach(() => {
    vi.restoreAllMocks()
    invoke.mockClear()
    vi.spyOn(tauriEnv, 'isTauri').mockReturnValue(true)
    invoke.mockResolvedValue(undefined)
  })

  it('renders Twitch Chat Popout header with controls', () => {
    render(<TwitchChatPopout channelName="shroud" />)

    expect(screen.getByText('Twitch Popout')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Abrir ventana flotante' })).toBeDefined()
  })

  it('restores native chat bounds on return without remounting and respects an open dialog', async () => {
    vi.useFakeTimers()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 800, top: 100, width: 380, height: 600 })
    render(<TwitchChatPopout channelName="shroud" />)
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    invoke.mockClear()
    await act(async () => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')) })
    expect(invoke).toHaveBeenCalledWith('set_embedded_twitch_chat_visible', { visible: true, x: 800, y: 100, width: 380, height: 600 })
    expect(invoke.mock.calls.some(([command]) => command === 'mount_embedded_twitch_chat')).toBe(false)
    invoke.mockClear()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    await act(async () => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
    expect(invoke).toHaveBeenCalledWith('set_embedded_twitch_chat_visible', { visible: false })
    expect(invoke.mock.calls.some(([command, args]) => command === 'set_embedded_twitch_chat_visible' && args.visible)).toBe(false)
    dialog.remove()
  })

  it('renders empty message when channel name is missing', () => {
    render(<TwitchChatPopout channelName="" />)

    expect(screen.getByText(/Sin canal asignado para Twitch Popout/i)).toBeDefined()
  })

  it('hides a zero-sized host and restores the same native chat instead of navigating again', async () => {
    vi.useFakeTimers()
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 800, top: 100, width: 380, height: 600 })
    render(<TwitchChatPopout channelName="shroud" />)
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(invoke.mock.calls.filter(([command]) => command === 'mount_embedded_twitch_chat')).toHaveLength(1)
    bounds.mockReturnValue({ left: 0, top: 0, width: 0, height: 0 })
    await act(async () => { window.dispatchEvent(new Event('resize')) })
    expect(invoke).toHaveBeenCalledWith('set_embedded_twitch_chat_visible', { visible: false })
    bounds.mockReturnValue({ left: 800, top: 100, width: 380, height: 600 })
    await act(async () => { window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('focus')) })
    expect(invoke).toHaveBeenCalledWith('set_embedded_twitch_chat_visible', { visible: true, x: 800, y: 100, width: 380, height: 600 })
    expect(invoke.mock.calls.filter(([command]) => command === 'mount_embedded_twitch_chat')).toHaveLength(1)
    expect(invoke.mock.calls.some(([command]) => command === 'unmount_embedded_twitch_chat')).toBe(false)
  })

  it('triggers onClose when "Chat Ligero" button is clicked', () => {
    const onCloseMock = vi.fn()
    render(<TwitchChatPopout channelName="shroud" onClose={onCloseMock} />)

    const backBtn = screen.getByRole('button', { name: 'Volver a chat ligero' })
    fireEvent.click(backBtn)

    expect(onCloseMock).toHaveBeenCalledTimes(1)
  })

  it('opens floating popout window via Tauri invoke when button is clicked', async () => {
    render(<TwitchChatPopout channelName="shroud" twitchToken="my_token" twitchUsername="albert" />)

    const floatingBtn = screen.getByRole('button', { name: 'Abrir ventana flotante' })
    fireEvent.click(floatingBtn)

    expect(invoke).toHaveBeenCalledWith('open_twitch_popout_window', {
      channel: 'shroud',
      alwaysOnTop: true,
      authToken: 'my_token',
      username: 'albert',
    })
  })

  it('openTwitchChatPopoutWindow calls window.open when not in Tauri', async () => {
    vi.spyOn(tauriEnv, 'isTauri').mockReturnValue(false)
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    await openTwitchChatPopoutWindow('ibai', false)

    expect(openSpy).toHaveBeenCalledWith(
      'https://twitch.tv/popout/ibai/chat?popout=',
      'twitch_chat_ibai',
      expect.any(String)
    )
  })
})
