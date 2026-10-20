import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import AboutDialog from './AboutDialog'
import { safeOpenUrl } from '../utils/tauriEnv'

vi.mock('../utils/i18n', () => ({ useT: () => (_key, fallback) => fallback }))
vi.mock('../utils/errors', () => ({ logError: vi.fn() }))
vi.mock('../utils/tauriEnv', async importOriginal => ({ ...await importOriginal(), safeOpenUrl: vi.fn() }))

beforeEach(() => {
  vi.stubGlobal('isTauri', true)
  check.mockReset()
  relaunch.mockReset().mockResolvedValue(undefined)
  vi.mocked(safeOpenUrl).mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('manual updater UI contract', () => {
  it('opens Ko-fi, the official website and support externally without closing About or checking updates', () => {
    const onClose = vi.fn()
    render(<AboutDialog onClose={onClose} />)
    for (const [name, href] of [
      ['Invitar a un café', 'https://ko-fi.com/apxstudio'],
      ['Web oficial', 'https://apxstudio.es/'],
      ['Soporte', 'mailto:contacto.apxstudio@gmail.com'],
    ]) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      fireEvent.click(link)
      expect(safeOpenUrl).toHaveBeenLastCalledWith(href)
    }
    expect(safeOpenUrl).toHaveBeenCalledTimes(3)
    expect(onClose).not.toHaveBeenCalled()
    expect(check).not.toHaveBeenCalled()
  })

  it('credits APX Studio as the publisher', () => {
    render(<AboutDialog onClose={() => {}} />)
    expect(screen.getByText('© 2026 APX Studio')).toBeInTheDocument()
    expect(screen.queryByText(/BlinkStream Team/)).not.toBeInTheDocument()
  })

  it('does not install or relaunch merely because a new version is found', async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined)
    check.mockResolvedValue({ version: '1.4.2', downloadAndInstall })
    render(<AboutDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Buscar actualizaciones' }))
    const install = await screen.findByRole('button', { name: 'Instalar v1.4.2 y reiniciar' })
    expect(downloadAndInstall).not.toHaveBeenCalled()
    expect(relaunch).not.toHaveBeenCalled()
    fireEvent.click(install)
    await vi.waitFor(() => expect(relaunch).toHaveBeenCalledTimes(1))
    expect(downloadAndInstall).toHaveBeenCalledTimes(1)
    expect(downloadAndInstall.mock.invocationCallOrder[0]).toBeLessThan(relaunch.mock.invocationCallOrder[0])
  })

  it('does not relaunch after a rejected signature or failed installation', async () => {
    check.mockResolvedValue({ version: '1.4.2', downloadAndInstall: vi.fn().mockRejectedValue(new Error('Invalid signature')) })
    render(<AboutDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Buscar actualizaciones' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Instalar v1.4.2 y reiniciar' }))
    expect(await screen.findByText('Error al instalar la actualización')).toBeDefined()
    expect(relaunch).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Instalar v1.4.2 y reiniciar' })).toBeNull()
  })

  it('reports check failures without pretending the application is up to date', async () => {
    check.mockRejectedValue(new Error('Endpoint unavailable'))
    render(<AboutDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Buscar actualizaciones' }))
    expect(await screen.findByText('No se pudo comprobar la actualización')).toBeDefined()
    expect(screen.queryByText('Tienes la versión más reciente ✓')).toBeNull()
    expect(relaunch).not.toHaveBeenCalled()
  })

  it('reports no update without exposing an install action', async () => {
    check.mockResolvedValue(null)
    render(<AboutDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Buscar actualizaciones' }))
    expect(await screen.findByText('Tienes la versión más reciente ✓')).toBeDefined()
    expect(screen.queryByRole('button', { name: /Instalar v/ })).toBeNull()
  })
})
