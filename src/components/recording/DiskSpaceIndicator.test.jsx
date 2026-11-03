import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import DiskSpaceIndicator from './DiskSpaceIndicator'
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../../utils/i18n', () => ({ useT: () => (_key, fallback) => fallback, getLanguage: () => 'en' }))
beforeEach(() => { vi.useFakeTimers(); vi.mocked(invoke).mockReset() })
afterEach(() => vi.useRealTimers())
const settle = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(301) }) }
describe('recording destination disk space', () => {
  it('does not query a default disk or display a permanent percentage bar', () => {
    render(<DiskSpaceIndicator />)
    expect(screen.getByRole('status')).toHaveTextContent('Selecciona una carpeta')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(invoke).not.toHaveBeenCalled()
  })
  it('shows actual capacity for the chosen folder, including an empty disk', async () => {
    vi.mocked(invoke).mockResolvedValue({ diskFreeGb: 78.4, diskTotalGb: 1000 })
    render(<DiskSpaceIndicator directory={'D:\\Recordings'} />)
    await settle()
    expect(invoke).toHaveBeenCalledWith('recorder_get_global_state', { directory: 'D:\\Recordings' })
    expect(screen.getByRole('status')).toHaveTextContent('78.4 GiB disponibles de 1,000.0 GiB')
    vi.mocked(invoke).mockResolvedValue({ diskFreeGb: 0, diskTotalGb: 1000 })
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    await settle()
    expect(screen.getByRole('status')).toHaveTextContent('0.0 GiB disponibles')
  })
  it.each([null, { diskFreeGb: 10 }, { diskFreeGb: NaN, diskTotalGb: 1000 }, { diskFreeGb: 1100, diskTotalGb: 1000 }])('does not invent totals for an invalid result', async data => {
    vi.mocked(invoke).mockResolvedValue(data)
    render(<DiskSpaceIndicator directory={'D:\\Recordings'} />)
    await settle()
    expect(screen.getByRole('status')).toHaveTextContent('Espacio en disco desconocido')
  })
  it('ignores a late response for a previous folder', async () => {
    let finish
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      .mockResolvedValueOnce({ diskFreeGb: 20, diskTotalGb: 200 })
    const view = render(<DiskSpaceIndicator directory={'C:\\Recordings'} />)
    await settle()
    view.rerender(<DiskSpaceIndicator directory={'D:\\Recordings'} />)
    await settle()
    await act(async () => { finish({ diskFreeGb: 78.4, diskTotalGb: 1000 }) })
    expect(screen.getByRole('status')).toHaveTextContent('20.0 GiB disponibles de 200.0 GiB')
  })
  it('preserves significant whitespace in a selected directory name', async () => {
    vi.mocked(invoke).mockResolvedValue({ diskFreeGb: 20, diskTotalGb: 200 })
    render(<DiskSpaceIndicator directory="/Volumes/Recordings " />)
    await settle()
    expect(invoke).toHaveBeenCalledWith('recorder_get_global_state', { directory: '/Volumes/Recordings ' })
  })
  it('handles an unavailable destination without stale numbers', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('unavailable'))
    render(<DiskSpaceIndicator directory={'D:\\Recordings'} />)
    await settle()
    expect(screen.getByRole('status')).toHaveTextContent('Espacio en disco desconocido')
  })
})
