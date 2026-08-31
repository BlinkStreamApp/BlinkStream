import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TwitchChatPopout } from './TwitchChatPopout'
import { openTwitchChatPopoutWindow } from '../../utils/twitchPopout'
import * as tauriEnv from '../../utils/tauriEnv'
import { invoke } from '@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('TwitchChatPopout', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(tauriEnv, 'isTauri').mockReturnValue(true)
    invoke.mockResolvedValue(undefined)
  })

  it('renders Twitch Chat Popout launcher hub with channel and features', () => {
    render(<TwitchChatPopout channelName="shroud" />)

    expect(screen.getByText('Chat Oficial de Twitch')).toBeDefined()
    expect(screen.getByText('Canal: #shroud')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Abrir ventana flotante' })).toBeDefined()
    expect(screen.getByText('Puntos de canal y cofres de bonificación')).toBeDefined()
  })

  it('renders empty message when channel name is missing', () => {
    render(<TwitchChatPopout channelName="" />)

    expect(screen.getByText(/Sin canal asignado para Twitch Popout/i)).toBeDefined()
  })

  it('triggers onClose when "Volver a Chat Ligero" button is clicked', () => {
    const onCloseMock = vi.fn()
    render(<TwitchChatPopout channelName="shroud" onClose={onCloseMock} />)

    const backBtn = screen.getByRole('button', { name: 'Volver a chat ligero' })
    fireEvent.click(backBtn)

    expect(onCloseMock).toHaveBeenCalledTimes(1)
  })

  it('opens floating popout window via Tauri invoke when button is clicked', async () => {
    render(<TwitchChatPopout channelName="shroud" />)

    const floatingBtn = screen.getByRole('button', { name: 'Abrir ventana flotante' })
    fireEvent.click(floatingBtn)

    expect(invoke).toHaveBeenCalledWith('open_twitch_popout_window', {
      channel: 'shroud',
      alwaysOnTop: true,
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
