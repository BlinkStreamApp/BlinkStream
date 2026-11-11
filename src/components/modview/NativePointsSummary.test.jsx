import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NativePointsSummary } from './NativePointsSummary'
import * as points from '../../hooks/useConnectedChannelPoints'
import { setLanguage, t } from '../../utils/i18n'
let state
beforeEach(() => {
  state = { connected: true, balance: 0, pointsName: 'Stars', refresh: vi.fn() }
  vi.spyOn(points, 'useConnectedChannelPoints').mockImplementation(() => state)
  setLanguage('es')
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); setLanguage('es') })
it('distinguishes zero and unknown balance and refreshes only on explicit action', () => {
  const view = render(<NativePointsSummary account="viewer" channel="channel" />)
  expect(screen.getByText('0 Stars')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: t('mod.points.refresh') }))
  expect(state.refresh).toHaveBeenCalledOnce()
  state.balance = null
  view.rerender(<NativePointsSummary account="viewer" channel="channel" />)
  expect(screen.queryByText('0 Stars')).not.toBeInTheDocument()
})
it('lists only metadata-backed observed rewards, without inventing pending status from chat text', () => {
  render(<NativePointsSummary account="viewer" channel="channel" messages={[
    { id: 'text', user: 'viewer', message: 'he canjeado algo' },
    { id: 'reward', user: 'alice', isReward: true, eventHeader: 'Hydrate' },
    { id: 'reward', user: 'alice', isReward: true, eventHeader: 'Hydrate' },
  ]} />)
  expect(screen.getByText('Hydrate', { exact: false })).toBeInTheDocument()
  expect(screen.queryByText('he canjeado algo')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Cumplir|Rechazar/ })).not.toBeInTheDocument()
})
