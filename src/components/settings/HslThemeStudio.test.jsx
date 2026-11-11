import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import HslThemeStudio from './HslThemeStudio'
import BrandIcon from '../icons/BrandIcon'
import { getBrandIconTheme, saveAndApplyBrandIconTheme } from '../../utils/hslTheme'
import { setLanguage } from '../../utils/i18n'
import { featureLanguages, recentTranslations } from '../../utils/recentTranslations'

vi.mock('../icons/brandIconAssets', () => {
  const keys = ['grid', 'drops', 'crimson-grid', 'ice-grid', 'emerald-grid']
  return { manifest: Object.fromEntries(keys.map(key => [key, { durationMs: 1600 }])), images: Object.fromEntries(keys.flatMap(key => ['png', 'gif'].map(ext => [`/src/assets/brand-icons/${key}.${ext}`, `/synthetic/${key}.${ext}`]))) }
})

vi.mock('../icons/PhosphorIcon', () => ({ default: () => null }))
beforeEach(() => { saveAndApplyBrandIconTheme('classic'); setLanguage('es') })
afterEach(() => { cleanup(); saveAndApplyBrandIconTheme('classic'); setLanguage('es') })

it.each(featureLanguages)('selects, persists and applies an icon family in %s', language => {
  setLanguage(language)
  const { container } = render(<><BrandIcon name="grid" /><HslThemeStudio /></>)
  const region = screen.getByRole('region', { name: recentTranslations[language]['icons.theme.title'] })
  expect(region).toBeVisible()
  expect(container.querySelector('img[src*=".gif"]')).toBeNull()
  fireEvent.click(within(region).getByRole('button', { name: 'Obsidian Crimson' }))
  expect(getBrandIconTheme()).toBe('crimson')
  expect(localStorage.getItem('blinkstream_brand_icon_theme')).toBe('crimson')
  expect(within(region).getByRole('button', { name: 'Obsidian Crimson' })).toHaveAttribute('aria-pressed', 'true')
  expect(container.querySelector('img[src*="crimson-grid.png"]')).not.toBeNull()
  act(() => saveAndApplyBrandIconTheme('not-a-theme'))
  expect(getBrandIconTheme()).toBe('classic')
})

it('stops an active GIF when switching theme and keeps the accessible control', () => {
  const { container } = render(<button aria-label="Grid"><BrandIcon name="grid" /></button>)
  fireEvent.pointerEnter(screen.getByRole('button'))
  expect(container.querySelector('img[src*=".gif"]')).not.toBeNull()
  act(() => saveAndApplyBrandIconTheme('ice'))
  expect(container.querySelector('img[src*=".gif"]')).toBeNull()
  expect(container.querySelector('img[src*="ice-grid.png"]')).not.toBeNull()
  expect(screen.getByRole('button', { name: 'Grid' })).toBeVisible()
})

it('keeps a selection usable when persistence is blocked', () => {
  const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  try {
    act(() => saveAndApplyBrandIconTheme('emerald'))
    const { container } = render(<BrandIcon name="grid" />)
    expect(container.querySelector('img[src*="emerald-grid.png"]')).not.toBeNull()
  } finally { blocked.mockRestore() }
})
