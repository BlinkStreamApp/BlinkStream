import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import DropsModal from './DropsModal'
import * as dropsHook from '../../hooks/useTwitchDrops'
import { setLanguage, t } from '../../utils/i18n'

vi.mock('../../hooks/useDropsAuthorization', () => ({ useDropsAuthorization: vi.fn() }))
vi.mock('../../hooks/useEmbeddedDropsInventory', () => ({ useEmbeddedDropsInventory: () => ({ isOpen: false,
  open: vi.fn().mockResolvedValue(), close: vi.fn(), containerRef: { current: null }, reload: vi.fn() }) }))
let state
beforeEach(() => {
  state = { account: 'alice', enabled: true, phase: 'ready', session: 'a'.repeat(32), error: null,
    campaigns: [{ id: 'campaign', name: 'Campaign', gameName: 'Game', status: 'ACTIVE', drops: [
      { id: 'reward', benefitName: 'Fresh reward', requiredMinutes: 60, currentMinutes: 60, percent: 100,
        hasProgress: true, isReadyToClaim: true, dropInstanceId: 'issued' },
    ] }], claimableCount: 1, claimBlocked: false, claimingId: null,
    autoClaim: false, remember: false, savingPreference: false,
    setAutoClaim: vi.fn(), setRemember: vi.fn(),
    connect: vi.fn(), disconnect: vi.fn(), refresh: vi.fn(), claimDrop: vi.fn() }
  vi.spyOn(dropsHook, 'useTwitchDrops').mockImplementation(() => state)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); setLanguage('es') })

it('shows one campaign browser with explicit opt-in automation and no experiment panel', () => {
  render(<DropsModal account="alice" onClose={vi.fn()} />)
  expect(screen.queryByText('Prueba temporal de Drops')).not.toBeInTheDocument()
  expect(screen.getByRole('switch', { name: /Auto-Claim/ })).not.toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: t('drops.filter.all') }))
  expect(screen.getByRole('heading', { name: 'Fresh reward' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: t('drops.center.claim') }))
  expect(state.claimDrop).toHaveBeenCalledWith('issued', 'Fresh reward')
})

it('updates the header and disables manual claims while another is in progress', () => {
  state.claimingId = 'issued'
  render(<DropsModal account="alice" onClose={vi.fn()} />)
  expect(screen.getByText(`1 ${t('drops.session.ready')}`)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: t('drops.filter.all') }))
  expect(screen.getByRole('button', { name: t('drops.center.claiming') })).toBeDisabled()
  expect(screen.getByRole('button', { name: t('drops.session.refresh') })).toBeDisabled()
  expect(screen.getByText(t('drops.probe.confirming'))).toBeInTheDocument()
})

it('changes automation and remembering only through explicit switches', () => {
  render(<DropsModal account="alice" onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('switch', { name: /Auto-Claim/ }))
  expect(state.setAutoClaim).toHaveBeenCalledWith(true)
  fireEvent.click(screen.getByRole('switch', { name: new RegExp(t('drops.session.remember')) }))
  expect(state.setRemember).toHaveBeenCalledWith(true)
  expect(state.claimDrop).not.toHaveBeenCalled()
})

it('allows stopping automation during a claim but prevents enabling blocked claims', () => {
  state.claimBlocked = true
  const view = render(<DropsModal account="alice" onClose={vi.fn()} />)
  expect(screen.getByRole('switch', { name: /Auto-Claim/ })).toBeDisabled()
  state.autoClaim = true
  state.claimingId = 'issued'
  view.rerender(<DropsModal account="alice" onClose={vi.fn()} />)
  expect(screen.getByRole('switch', { name: /Auto-Claim/ })).toBeEnabled()
  expect(screen.getByRole('switch', { name: new RegExp(t('drops.session.remember')) })).toBeDisabled()
})

it('offers explicit connection and retains official inventory access when disconnected', () => {
  Object.assign(state, { phase: 'idle', session: null, campaigns: [], claimableCount: 0 })
  render(<DropsModal account="alice" onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: t('drops.session.connect') }))
  expect(state.connect).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: t('drops.session.inventory') })).toBeEnabled()
})

it('keeps official controls available in a build where native Drops is disabled', () => {
  Object.assign(state, { enabled: false, session: null, campaigns: [], phase: 'unavailable' })
  render(<DropsModal account="alice" onClose={vi.fn()} />)
  expect(screen.getByText(t('drops.session.unavailable'))).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: t('drops.session.connect') })).not.toBeInTheDocument()
})

it('does not show private data to a signed-out user', () => {
  render(<DropsModal account="" onClose={vi.fn()} />)
  expect(screen.getByText(t('drops.session.login'))).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Fresh reward' })).not.toBeInTheDocument()
})

it('exposes a native authorization host, cancellation and no simultaneous official panel', () => {
  state.phase = 'authorizing'
  render(<DropsModal account="alice" onClose={vi.fn()} />)
  expect(screen.getByLabelText(t('drops.probe.authorizing'))).toBeInTheDocument()
  expect(screen.getByRole('button', { name: t('drops.session.inventory') })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: t('drops.session.cancel') }))
  expect(state.disconnect).toHaveBeenCalledOnce()
})

it('keeps language changes and errors coherent across all supported languages', () => {
  state.error = 'uncertain'
  state.claimBlocked = true
  render(<DropsModal account="alice" onClose={vi.fn()} />)
  for (const language of ['es', 'en', 'fr', 'de', 'pt', 'ja', 'ko', 'ru']) {
    act(() => setLanguage(language))
    expect(screen.getByRole('alert')).toHaveTextContent(t('drops.probe.uncertain'))
    expect(screen.getByRole('button', { name: t('drops.session.close') })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: new RegExp(t('drops.session.autoClaim')) })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: new RegExp(t('drops.session.remember')) })).toBeInTheDocument()
  }
})

it('closes with Escape and restores opener focus', () => {
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  const onClose = vi.fn()
  const view = render(<DropsModal account="alice" onClose={onClose} />)
  expect(screen.getByRole('button', { name: t('drops.session.close') })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(onClose).toHaveBeenCalledOnce()
  view.unmount()
  expect(opener).toHaveFocus()
  opener.remove()
})

it('offers an explicit disconnect action without the retired report section', () => {
  render(<DropsModal account="alice" onClose={vi.fn()} />)
  expect(screen.queryByText(t('drops.session.watch'))).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: t('drops.session.disconnect') }))
  expect(state.disconnect).toHaveBeenCalledOnce()
})
