import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PlayerSettingsPanel } from './VideoPlayer'

describe('Player settings actions', () => {
  it('toggles a setting only once when clicking its switch', () => {
    const toggle = vi.fn()
    render(<PlayerSettingsPanel onClose={vi.fn()} onToggleCompact={toggle} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Modo Compacto' }))
    expect(toggle).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Modo Compacto'))
    expect(toggle).toHaveBeenCalledTimes(2)
  })

  it('does not offer a compact action when no handler exists', () => {
    render(<PlayerSettingsPanel onClose={vi.fn()} />)
    expect(screen.queryByRole('switch', { name: 'Modo Compacto' })).not.toBeInTheDocument()
  })
})
