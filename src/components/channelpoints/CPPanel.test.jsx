import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import CPPanel from './CPPanel'

vi.mock('../../hooks/useChannelPoints', () => ({ useChannelPoints: () => ({
  rewards: [{ id: 'r1', title: 'Hydrate', cost: 50, is_enabled: true, is_in_stock: true }],
  balance: null, loading: false, error: null,
}) }))
vi.mock('../../hooks/useManageRewards', () => ({ useManageRewards: () => ({
  rewards: [], pendingRedemptions: [], loading: false, error: null,
}) }))
vi.mock('../../utils/twitchPopout', () => ({ openOfficialRewardsChat: vi.fn() }))
afterEach(() => { cleanup(); localStorage.clear() })
const props = { open: true, onClose: vi.fn(), channel: 'kokoop', broadcasterId: '123', userId: 'alice', userToken: 't' }

it('searches rewards and switches to compact presentation without redeeming', () => {
  render(<CPPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Vista compacta' }))
  expect(screen.getByRole('button', { name: 'Vista compacta' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar recompensa' }), { target: { value: 'absent' } })
  expect(screen.queryByRole('button', { name: /Hydrate/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('catalog selection opens the official handoff and disappears on account change', () => {
  const { rerender } = render(<CPPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Hydrate/ }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Abrir chat oficial de Twitch' })).toBeInTheDocument()
  rerender(<CPPanel {...props} userId="bob" />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('closing the panel removes its official reward modal', () => {
  const { rerender } = render(<CPPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Hydrate/ }))
  rerender(<CPPanel {...props} open={false} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('viewer history explains its availability instead of presenting zero redemptions', () => {
  render(<CPPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Mis canjes/ }))
  expect(screen.getByText(/historial de tus canjes no está sincronizado/)).toBeInTheDocument()
})
