import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Settings from './Settings'

vi.mock('../utils/i18n', () => ({
  useT: () => (key, fallback) => fallback || ({ settings: 'Configuración', close: 'Cerrar' }[key] || key),
  getLanguage: () => 'es', setLanguage: vi.fn(),
}))
vi.mock('./settings/HslThemeStudio', () => ({ default: () => <button>Estudio de temas</button> }))
vi.mock('./settings/SettingsAccountTab', () => ({ SettingsAccountTab: () => <button>Cuenta de prueba</button> }))
vi.mock('./settings/SettingsModerationTab', () => ({ SettingsModerationTab: () => <button>Moderación de prueba</button> }))
vi.mock('./settings/SettingsRecordingTab', () => ({ SettingsRecordingTab: () => <button>Grabación de prueba</button> }))
vi.mock('./settings/SettingsAdvancedTab', () => ({ SettingsAdvancedTab: () => <button>Avanzado de prueba</button> }))

describe('Settings keyboard and state', () => {
  it('names the dialog, focuses close and wraps Tab without focusing the background', () => {
    const onClose = vi.fn()
    render(<><button>Fondo</button><Settings onClose={onClose} /></>)
    const dialog = screen.getByRole('dialog', { name: 'Configuración' })
    const close = screen.getByRole('button', { name: 'Cerrar' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    const last = document.activeElement
    expect(dialog).toContainElement(last)
    expect(last).not.toBe(close)
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(close).toHaveFocus()
    screen.getByRole('button', { name: 'Fondo' }).focus()
    expect(close).toHaveFocus()
    fireEvent.keyDown(close, { key: 'Escape', code: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('navigates tabs with arrows and Home/End, keeping the panel labelled', () => {
    render(<Settings onClose={vi.fn()} />)
    const general = screen.getByRole('tab', { name: 'General' })
    expect(general).toHaveAttribute('aria-selected', 'true')
    general.focus()
    fireEvent.keyDown(general, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Personalización & Temas' })).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Personalización & Temas' })).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement, { key: 'End' })
    expect(screen.getByRole('tab', { name: 'Avanzado' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement, { key: 'Home' })
    expect(general).toHaveFocus()
    expect(screen.getAllByRole('tab').filter(tab => tab.tabIndex === 0)).toHaveLength(1)
  })
  it('does not overwrite muted volume when opening settings', () => {
    localStorage.setItem('blinkstream_volume', '0')
    render(<Settings onClose={vi.fn()} />)
    const volume = screen.getByRole('slider', { name: 'Volumen por defecto' })
    expect(volume).toHaveValue('0')
    expect(localStorage.getItem('blinkstream_volume')).toBe('0')
    expect(screen.getByRole('combobox', { name: 'Calidad de stream' })).toBeInTheDocument()
    for (const label of ['Modo teatro automático', 'Chat a la derecha', 'Modo compacto']) {
      expect(screen.getByRole('switch', { name: label })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('switch', { name: 'Modo compacto' }))
    expect(screen.getByRole('switch', { name: 'Modo compacto' })).toHaveAttribute('aria-checked', 'true')
  })
  it('restores focus to the opener on unmount', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { unmount } = render(<Settings onClose={vi.fn()} />)
    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })
})
