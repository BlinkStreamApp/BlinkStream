import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActiveModsPanel } from './ActiveModsPanel'
import { PredictionsPollsPanel } from './PredictionsPollsPanel'
import { UnbanRequestsPanel } from './UnbanRequestsPanel'
import { ModDataNotice } from './ModDataNotice'
import { getModerators, getVips, getChatters, getPredictions, getUnbanRequests } from '../../utils/twitch'

vi.mock('../../utils/twitch', () => ({
  getModerators: vi.fn(), getVips: vi.fn(), getChatters: vi.fn(),
  getPredictions: vi.fn(), getPolls: vi.fn(), getUnbanRequests: vi.fn(),
  createPrediction: vi.fn(), resolvePrediction: vi.fn(), createPoll: vi.fn(), endPoll: vi.fn(),
  getUserIdByLogin: vi.fn(), resolveUnbanRequest: vi.fn(),
}))
const denied = status => ({ success: false, error: { context: { status } } })

beforeEach(() => vi.resetAllMocks())

describe('moderation data is not confused with unavailable data', () => {
  it('does not recommend reauthentication for a broadcaster-only query', () => {
    render(<ModDataNotice error={{ context: { status: 401, twitchMsg: 'The ID in broadcaster_id must match the user ID found in the access token.' } }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('requiere la cuenta del creador')
    expect(screen.getByRole('alert')).not.toHaveTextContent('Vuelve a iniciar sesión')
  })
  it('renders permitted chatters while reporting each denied tab separately', async () => {
    getModerators.mockResolvedValue(denied(401))
    getVips.mockResolvedValue(denied(403))
    getChatters.mockResolvedValue({ success: true, value: [{ user_login: 'alice', user_id: '12' }] })
    render(<ActiveModsPanel broadcasterId="1" userId="2" />)
    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Mods (0)'))
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP 401')
    expect(screen.queryByText('No se encontraron moderadores.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('VIPs (0)'))
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP 403')
  })
  it('keeps other data usable when one request rejects', async () => {
    getModerators.mockRejectedValue(new Error('network'))
    getVips.mockResolvedValue({ success: true, value: [] })
    getChatters.mockResolvedValue({ success: true, value: [{ user_login: 'bob' }] })
    render(<ActiveModsPanel broadcasterId="1" userId="2" />)
    expect(await screen.findByText('bob')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Mods (0)'))
    expect(screen.getByRole('alert')).toHaveTextContent('No se han podido cargar')
  })
  it('reports authorization failures instead of claiming there are no predictions', async () => {
    getPredictions.mockResolvedValue(denied(401))
    render(<PredictionsPollsPanel broadcasterId="1" token="test" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 401')
    expect(screen.queryByText('Sin predicciones recientes')).not.toBeInTheDocument()
  })
  it('reports access failures instead of claiming there are no unban requests', async () => {
    getUnbanRequests.mockResolvedValue(denied(403))
    render(<UnbanRequestsPanel broadcasterId="1" userId="2" token="test" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 403')
    expect(screen.queryByText('Sin solicitudes pending')).not.toBeInTheDocument()
  })
})
