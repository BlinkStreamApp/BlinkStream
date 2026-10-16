import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { check } from '@tauri-apps/plugin-updater'
import AboutDialog from './AboutDialog'

vi.mock('../utils/distribution', () => ({ IS_STORE_BUILD: true }))
afterEach(() => vi.unstubAllGlobals())
it('Store edition does not offer or invoke GitHub updates', () => {
  vi.stubGlobal('isTauri', true)
  vi.mocked(check).mockClear()
  render(<AboutDialog onClose={() => {}} />)
  expect(screen.queryByRole('button', { name: 'Buscar actualizaciones' })).not.toBeInTheDocument()
  expect(check).not.toHaveBeenCalled()
  expect(screen.getByText('Streamlink · Python · FFmpeg')).toBeInTheDocument()
  expect(screen.getByText(/No ownership of these components/)).toBeInTheDocument()
})
