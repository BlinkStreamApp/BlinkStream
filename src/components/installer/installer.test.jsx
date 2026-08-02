import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import InstallerScreen from './InstallerScreen'
import UninstallerScreen from './UninstallerScreen'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    close: vi.fn(),
    minimize: vi.fn(),
  })),
}))

describe('Custom Installer & Uninstaller (Bootstrapper) UI Tests', () => {
  it('renderiza correctamente el InstallerScreen y sus opciones de instalación', () => {
    render(<InstallerScreen />)
    // Comprobar que se muestra el título de setup y el botón de instalación
    expect(screen.getByText(/BlinkStream Setup/i)).toBeInTheDocument()
    expect(screen.getByText(/Instalar BlinkStream/i)).toBeInTheDocument()
    // Comprobar que el acceso directo de escritorio está activo por defecto
    const desktopCheckbox = screen.getByLabelText(/Crear acceso directo en el Escritorio/i)
    expect(desktopCheckbox).toBeChecked()
  })

  it('permite interactuar con el botón de instalación en InstallerScreen', () => {
    render(<InstallerScreen />)
    const installBtn = screen.getByRole('button', { name: /Instalar BlinkStream/i })
    fireEvent.click(installBtn)
    // Debería cambiar al estado de progreso "Instalando en tu sistema..."
    expect(screen.getByText(/Instalando en tu sistema.../i)).toBeInTheDocument()
  })

  it('renderiza correctamente el UninstallerScreen y la encuesta de despedida', () => {
    render(<UninstallerScreen />)
    expect(screen.getAllByText(/Desinstalar BlinkStream/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Lamentamos mucho verte partir/i)).toBeInTheDocument()
    // Verificar que las razones de la encuesta están presentes
    expect(screen.getByText(/Prefiero usar la página web de Twitch/i)).toBeInTheDocument()
  })

  it('permite iniciar el proceso de desinstalación en UninstallerScreen', () => {
    render(<UninstallerScreen />)
    const uninstallBtn = screen.getByRole('button', { name: /Desinstalar BlinkStream/i })
    fireEvent.click(uninstallBtn)
    expect(screen.getByText(/Limpiando archivos.../i)).toBeInTheDocument()
  })
})
