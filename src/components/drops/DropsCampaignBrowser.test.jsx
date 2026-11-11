import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DropsCampaignBrowser from './DropsCampaignBrowser'
import { setLanguage, t } from '../../utils/i18n'

const campaigns = [{ id: 'ludra', name: 'Ludra Awakens', gameName: 'AION 2', isCurrentChannel: true, drops: [
  { id: 'chest', benefitName: 'Battle Chest', requiredMinutes: 60, currentMinutes: 27, percent: 45, hasProgress: true },
  { id: 'skin', benefitName: 'Skin Chest', requiredMinutes: 120, currentMinutes: 120, percent: 100, hasProgress: true, isReadyToClaim: true, dropInstanceId: 'issued-instance' },
] }]
const props = () => ({ campaigns, claimingIds: new Set(), claimDrop: vi.fn(), openOfficialInventory: vi.fn() })
afterEach(() => { cleanup(); setLanguage('es') })

describe('Drops campaign browser', () => {
  it('keeps experimental results read-only even for an issued claimable instance', () => {
    const handlers = props()
    render(<DropsCampaignBrowser {...handlers} readOnly />)
    expect(screen.queryByRole('button', { name: t('drops.center.claim') })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Skin Chest' })).toBeInTheDocument()
    expect(handlers.claimDrop).not.toHaveBeenCalled()
  })
  it('renders available campaign art and reward cards even when no watch minutes exist', () => {
    render(<DropsCampaignBrowser {...props()} campaigns={[{ id: 'new', name: 'New Campaign', gameName: 'Other Game', status: 'ACTIVE', imageUrl: 'https://static-cdn.jtvnw.net/campaign.jpg', endAt: '2099-01-01T00:00:00Z', drops: [
      { id: 'chest', benefitName: 'New Chest', benefitImage: 'https://static-cdn.jtvnw.net/chest.png', requiredMinutes: 60, currentMinutes: 0, hasProgress: false },
    ] }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Disponibles' }))
    fireEvent.click(screen.getByRole('button', { name: /Other Game/ }))
    expect(screen.getByRole('heading', { name: 'New Campaign' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'New Chest' })).toBeInTheDocument()
    expect(document.querySelector('img[src="https://static-cdn.jtvnw.net/campaign.jpg"]')).toBeInTheDocument()
    expect(document.querySelector('img[src="https://static-cdn.jtvnw.net/chest.png"]')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText('En este canal')).not.toBeInTheDocument()
    expect(screen.getByText(/Finaliza:/)).toBeInTheDocument()
  })
  it('switches all eight languages without losing search or pinned target', () => {
    render(<DropsCampaignBrowser {...props()} lastUpdatedAt={1730000000000} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'battle' } })
    fireEvent.click(screen.getByRole('button', { name: t('drops.center.pin') }))
    for (const language of ['en', 'fr', 'de', 'pt', 'ja', 'ko', 'ru', 'es']) {
      act(() => setLanguage(language))
      expect(screen.getByRole('searchbox', { name: t('drops.center.search') })).toHaveValue('battle')
      expect(screen.getByRole('button', { name: t('drops.center.unpin') })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText(t('drops.center.target').replace('{name}', 'Ludra Awakens'))).toBeInTheDocument()
      expect(screen.getByRole('group', { name: t('drops.center.filters') })).toBeInTheDocument()
    }
  })
  it('keeps confirmed progress while searching and filtering rewards', () => {
    render(<DropsCampaignBrowser {...props()} />)
    expect(screen.getByRole('progressbar', { name: 'Battle Chest' })).toHaveAttribute('aria-valuenow', '45')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'battle' } })
    expect(screen.queryByText('Skin Chest')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    const group = screen.getByRole('group')
    fireEvent.click(within(group).getAllByRole('button')[3])
    expect(screen.queryByText('Battle Chest')).not.toBeInTheDocument()
    expect(screen.getByText('Skin Chest')).toBeInTheDocument()
    expect(within(group).getAllByRole('button')[3]).toHaveAttribute('aria-pressed', 'true')
  })

  it('pins a visual target without claiming or opening Twitch', () => {
    const handlers = props()
    render(<DropsCampaignBrowser {...handlers} />)
    const pin = screen.getByRole('button', { pressed: false, name: /campaña/ })
    fireEvent.click(pin)
    expect(pin).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/Seguimiento visual: Ludra Awakens/)).toBeInTheDocument()
    expect(handlers.claimDrop).not.toHaveBeenCalled()
    expect(handlers.openOfficialInventory).not.toHaveBeenCalled()
  })

  it('claims only issued instances and routes blocked claims to official inventory', () => {
    const handlers = props()
    const { rerender } = render(<DropsCampaignBrowser {...handlers} />)
    fireEvent.click(screen.getByRole('button', { name: '¡Reclamar Drop!' }))
    expect(handlers.claimDrop).toHaveBeenCalledWith('issued-instance', 'Skin Chest')
    rerender(<DropsCampaignBrowser {...handlers} claimBlocked />)
    fireEvent.click(screen.getByRole('button', { name: 'Reclamar en Twitch' }))
    expect(handlers.openOfficialInventory).toHaveBeenCalledOnce()
    expect(handlers.claimDrop).toHaveBeenCalledOnce()
  })

  it('shows unknown data without a fake progress bar or claim control', () => {
    render(<DropsCampaignBrowser {...props()} campaigns={[{ id: 'unknown', name: 'Unknown', drops: [
      { id: 'missing', benefitName: 'Missing', requiredMinutes: null, currentMinutes: 0, hasProgress: false },
      { id: 'available', benefitName: 'Available', requiredMinutes: 60, currentMinutes: 0, hasProgress: false },
    ] }]} />)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '¡Reclamar Drop!' })).not.toBeInTheDocument()
    expect(screen.getByText('Disponible · 60 min · Progreso aún no confirmado')).toBeInTheDocument()
    expect(screen.queryByText(/0 \/ 60/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Última sincronización/)).not.toBeInTheDocument()
  })

  it('shows an empty search result without discarding the campaign list', () => {
    render(<DropsCampaignBrowser {...props()} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no match' } })
    expect(screen.getByRole('status')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    expect(screen.getByText('Battle Chest')).toBeInTheDocument()
  })
})
