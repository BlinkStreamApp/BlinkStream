import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { check } from '@tauri-apps/plugin-updater'
import AboutDialog from './AboutDialog'
import { setLanguage } from '../utils/i18n'
import { featureLanguages, recentTranslations } from '../utils/recentTranslations'

vi.mock('../utils/distribution', () => ({ IS_STORE_BUILD: true }))
afterEach(() => { vi.unstubAllGlobals(); setLanguage('es') })
it('Store edition does not offer or invoke GitHub updates', () => {
  vi.stubGlobal('isTauri', true)
  vi.mocked(check).mockClear()
  render(<AboutDialog onClose={() => {}} />)
  expect(screen.queryByRole('button', { name: 'Buscar actualizaciones' })).not.toBeInTheDocument()
  expect(check).not.toHaveBeenCalled()
  expect(screen.getByText('Streamlink · Python · FFmpeg')).toBeInTheDocument()
  expect(screen.getByText(/No ownership of these components/)).toBeInTheDocument()
})

it.each(featureLanguages)('Store runtime source download is accessible and translated in %s', language => {
  setLanguage(language)
  render(<AboutDialog onClose={() => {}} />)
  const sources = screen.getByRole('link', { name: recentTranslations[language]['about.runtimeSources'], hidden: true })
  expect(sources).toHaveAttribute('href', 'https://github.com/BlinkStreamApp/BlinkStream/releases/download/v1.5.0/BlinkStream-1.5.0-runtime-sources.zip')
  expect(screen.getByText(/Source download \(same runtime/)).toHaveTextContent('f3bd70b2068668b6cfaa035ad405e1fb4d9b78a3327e90b586884d141befe0db')
  expect(check).not.toHaveBeenCalled()
})
