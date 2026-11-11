import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import BrandIcon from './BrandIcon'

vi.mock('./brandIconAssets', () => {
  const keys = ['grid', 'drops', 'crimson-grid', 'ice-grid', 'emerald-grid']
  return { manifest: Object.fromEntries(keys.map(key => [key, { durationMs: 1600 }])), images: Object.fromEntries(keys.flatMap(key => ['png', 'gif'].map(ext => [`/src/assets/brand-icons/${key}.${ext}`, `/synthetic/${key}.${ext}`]))) }
})
vi.mock('./PhosphorIcon', () => ({ default: ({ name, ...props }) => <span {...props} data-testid="fallback-icon">{name}</span> }))

let motion
beforeEach(() => {
  vi.useFakeTimers()
  motion = new EventTarget()
  motion.matches = false
  vi.spyOn(window, 'matchMedia').mockReturnValue(motion)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
const animated = container => container.querySelectorAll('img[src*=".gif"]')

it('loads only static art at rest and preserves the containing control label', () => {
  const { container } = render(<button>Grid<BrandIcon name="grid" /></button>)
  expect(animated(container)).toHaveLength(0)
  expect(container.querySelector('img').src).toContain('grid.png')
  expect(screen.getByRole('button', { name: 'Grid' })).toBeVisible()
  expect(vi.getTimerCount()).toBe(0)
})

it('runs one brief interaction, preserves static art during loading and stops without repeating', () => {
  const { container } = render(<button>Grid<BrandIcon name="grid" /></button>)
  fireEvent.pointerEnter(screen.getByRole('button'))
  expect(animated(container)).toHaveLength(1)
  expect(container.querySelector('img[src*=".png"]')).not.toHaveClass('invisible')
  fireEvent.load(animated(container)[0])
  expect(container.querySelector('img[src*=".png"]')).toHaveClass('invisible')
  act(() => vi.advanceTimersByTime(1601))
  expect(animated(container)).toHaveLength(0)
  act(() => vi.advanceTimersByTime(10000))
  expect(animated(container)).toHaveLength(0)
  expect(vi.getTimerCount()).toBe(0)
})

it('supports keyboard focus and a single animation across controls', () => {
  const { container } = render(<><button>Grid<BrandIcon name="grid" /></button><button>Drops<BrandIcon name="drops" /></button></>)
  fireEvent.focusIn(screen.getByRole('button', { name: 'Grid' }))
  expect(animated(container)).toHaveLength(1)
  fireEvent.pointerEnter(screen.getByRole('button', { name: 'Drops' }))
  expect(animated(container)).toHaveLength(1)
  expect(animated(container)[0].src).toContain('drops.gif')
  fireEvent.pointerLeave(screen.getByRole('button', { name: 'Drops' }))
  expect(animated(container)).toHaveLength(0)
})

it('respects reduced motion initially and when the OS preference changes', () => {
  motion.matches = true
  const { container } = render(<button>Grid<BrandIcon name="grid" /></button>)
  fireEvent.pointerEnter(screen.getByRole('button'))
  expect(animated(container)).toHaveLength(0)
  motion.matches = false
  fireEvent.focusIn(screen.getByRole('button'))
  expect(animated(container)).toHaveLength(1)
  act(() => { motion.matches = true; motion.dispatchEvent(new Event('change')) })
  expect(animated(container)).toHaveLength(0)
})

it('returns to static art on load error, backgrounding or blur and cleans pending work on unmount', () => {
  const { container, unmount } = render(<button>Grid<BrandIcon name="grid" /></button>)
  const button = screen.getByRole('button')
  fireEvent.pointerEnter(button)
  fireEvent.error(animated(container)[0])
  expect(animated(container)).toHaveLength(0)
  fireEvent.focusIn(button)
  fireEvent(window, new Event('blur'))
  expect(animated(container)).toHaveLength(0)
  fireEvent.pointerEnter(button)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  fireEvent(document, new Event('visibilitychange'))
  expect(animated(container)).toHaveLength(0)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('uses a Phosphor fallback for missing private artwork without losing the label', () => {
  const { container } = render(<button>Search<BrandIcon name="search" /></button>)
  expect(screen.getByTestId('fallback-icon')).toHaveTextContent('MagnifyingGlass')
  fireEvent.pointerEnter(screen.getByRole('button', { name: 'Search' }))
  expect(container.querySelector('img')).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})
