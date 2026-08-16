import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GamerChatOverlay from './GamerChatOverlay'
import * as tauriEnv from '../../utils/tauriEnv'
import { invoke } from '@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    close: vi.fn(),
  })),
}))

vi.mock('../Chat', () => ({
  default: function MockChat({ channel }) {
    return <div data-testid="mock-chat">Chat for {channel}</div>
  },
}))

describe('GamerChatOverlay', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(tauriEnv, 'isTauri').mockReturnValue(true)
    invoke.mockResolvedValue(undefined)
  })

  it('renders overlay header and chat correctly', () => {
    render(<GamerChatOverlay initialChannel="shroud" />)

    expect(screen.getByText(/HUD: shroud/i)).toBeDefined()
    expect(screen.getByTestId('mock-chat')).toBeDefined()
    expect(screen.getByText(/Chat for shroud/i)).toBeDefined()
  })

  it('toggles click-through mode on button click and invokes Tauri command', async () => {
    render(<GamerChatOverlay initialChannel="shroud" />)

    const lockBtn = screen.getByRole('button', { name: /Lock \(F9\)/i })
    fireEvent.click(lockBtn)

    expect(invoke).toHaveBeenCalledWith('set_click_through', {
      label: 'gamer_overlay',
      ignore: true,
    })
    expect(screen.getByText(/Click-Through ON/i)).toBeDefined()
  })

  it('updates opacity range slider', () => {
    render(<GamerChatOverlay initialChannel="shroud" />)

    const configBtn = screen.getByRole('button', { name: 'Ajustes de transparencia' })
    fireEvent.click(configBtn)

    const slider = screen.getByLabelText('Opacidad de fondo')
    fireEvent.change(slider, { target: { value: '40' } })

    expect(screen.getByText('40%')).toBeDefined()
  })

  it('closes overlay on close button click', () => {
    render(<GamerChatOverlay initialChannel="shroud" />)

    const closeBtn = screen.getByRole('button', { name: 'Cerrar overlay' })
    fireEvent.click(closeBtn)

    expect(invoke).toHaveBeenCalledWith('close_gamer_overlay')
  })
})
