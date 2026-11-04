import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RedeemModal, { OfficialRewardsAccess } from './RedeemModal'
import { openOfficialRewardsChat } from '../../utils/twitchPopout'
import { setLanguage } from '../../utils/i18n'
import { featureLanguages, recentTranslations } from '../../utils/recentTranslations'

vi.mock('../../utils/twitchPopout', () => ({ openOfficialRewardsChat: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks(); setLanguage('es') })
const reward = { id: 'hydrate', title: 'Hydrate', prompt: 'Drink water', cost: 100, is_user_input_required: true }

describe('official viewer reward flow', () => {
  it('opens the correct official chat without entering text, spending points or announcing a redemption', async () => {
    const redeem = vi.fn()
    const close = vi.fn()
    render(<RedeemModal reward={reward} channel="kokoop" onClose={close} onRedeem={redeem} />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chat oficial de Twitch' }))
    await waitFor(() => expect(openOfficialRewardsChat).toHaveBeenCalledWith('kokoop'))
    expect(redeem).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(screen.queryByText('Canjeado')).not.toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://www.twitch.tv/kokoop')
  })
  it('shows a failed opening and permits retry without a success message', async () => {
    vi.mocked(openOfficialRewardsChat).mockRejectedValueOnce(new Error('native window failed'))
    render(<OfficialRewardsAccess channel="kokoop" />)
    fireEvent.click(screen.getByRole('button'))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo abrir')
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(openOfficialRewardsChat).toHaveBeenCalledTimes(2))
  })
  it('blocks duplicate opens while the native request is pending', async () => {
    let done
    vi.mocked(openOfficialRewardsChat).mockImplementation(() => new Promise(resolve => { done = resolve }))
    render(<OfficialRewardsAccess channel="kokoop" />)
    const button = screen.getByRole('button')
    fireEvent.click(button); fireEvent.click(button)
    expect(openOfficialRewardsChat).toHaveBeenCalledTimes(1)
    await act(async () => done())
  })
  it.each(['', '../other', 'kokoop?token=bad'])('rejects an invalid channel %s', channel => {
    render(<OfficialRewardsAccess channel={channel} />)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
  it('states unavailable history instead of presenting an empty redemption list', () => {
    render(<OfficialRewardsAccess channel="kokoop" history />)
    expect(screen.getByText(/historial de tus canjes no está sincronizado/)).toBeInTheDocument()
  })
  it('closes on Escape and returns focus to the opener', () => {
    const close = vi.fn()
    const opener = document.createElement('button')
    document.body.append(opener); opener.focus()
    const view = render(<RedeemModal reward={reward} channel="kokoop" onClose={close} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(1)
    view.unmount(); expect(document.activeElement).toBe(opener); opener.remove()
  })
  it.each(featureLanguages)('updates language in %s without changing reward content', language => {
    render(<RedeemModal reward={reward} channel="kokoop" onClose={vi.fn()} />)
    act(() => setLanguage(language))
    expect(screen.getByRole('button', { name: recentTranslations[language]['cp.official.open'] })).toBeInTheDocument()
    expect(screen.getByText('Hydrate')).toBeInTheDocument()
  })
})
