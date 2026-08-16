import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DropsModal from './DropsModal'
import * as useTwitchDropsModule from '../../hooks/useTwitchDrops'

describe('DropsModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders login prompt when token is missing', () => {
    vi.spyOn(useTwitchDropsModule, 'useTwitchDrops').mockReturnValue({
      campaigns: [],
      loading: false,
      autoClaim: true,
      toggleAutoClaim: vi.fn(),
      claimDrop: vi.fn(),
      claimingIds: new Set(),
      claimableCount: 0,
      refreshDrops: vi.fn(),
    })

    render(<DropsModal token="" onClose={() => {}} />)
    expect(screen.getByText(/Inicia sesión con Twitch/i)).toBeDefined()
  })

  it('renders active campaign and ready to claim drop button', () => {
    const mockClaim = vi.fn()
    vi.spyOn(useTwitchDropsModule, 'useTwitchDrops').mockReturnValue({
      campaigns: [
        {
          id: 'camp_1',
          name: 'Overwatch 2 Drops',
          gameName: 'Overwatch 2',
          drops: [
            {
              id: 'd1',
              benefitName: 'Kiriko Skin',
              currentMinutes: 60,
              requiredMinutes: 60,
              percent: 100,
              isClaimed: false,
              isReadyToClaim: true,
              dropInstanceId: 'inst_kiriko',
            },
          ],
        },
      ],
      loading: false,
      autoClaim: true,
      toggleAutoClaim: vi.fn(),
      claimDrop: mockClaim,
      claimingIds: new Set(),
      claimableCount: 1,
      refreshDrops: vi.fn(),
    })

    render(<DropsModal token="valid_token" onClose={() => {}} />)

    expect(screen.getByText('Overwatch 2 Drops')).toBeDefined()
    expect(screen.getByText('Kiriko Skin')).toBeDefined()

    const claimBtn = screen.getByRole('button', { name: /¡Reclamar Drop!/i })
    fireEvent.click(claimBtn)

    expect(mockClaim).toHaveBeenCalledWith('inst_kiriko', 'Kiriko Skin')
  })
})
