import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DropsModal from './DropsModal'
import * as useTwitchDropsModule from '../../hooks/useTwitchDrops'
import * as embeddedInventory from '../../hooks/useEmbeddedDropsInventory'

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

  it('renders a watcher bridge error instead of an empty state', () => {
    vi.spyOn(useTwitchDropsModule, 'useTwitchDrops').mockReturnValue({
      campaigns: [],
      loading: false,
      authRequired: false,
      syncStatus: 'bridge-timeout',
      syncError: 'El visor de Twitch no pudo conectar con BlinkStream.',
      autoClaim: true,
      toggleAutoClaim: vi.fn(),
      claimDrop: vi.fn(),
      claimingIds: new Set(),
      claimableCount: 0,
      refreshDrops: vi.fn(),
    })

    render(<DropsModal token="valid_token" onClose={() => {}} />)

    expect(screen.getByText('No se pudo sincronizar el inventario')).toBeDefined()
    expect(screen.getByText('El visor de Twitch no pudo conectar con BlinkStream.')).toBeDefined()
  })

  it('shows channel availability without presenting unconfirmed progress as zero', () => {
    vi.spyOn(useTwitchDropsModule, 'useTwitchDrops').mockReturnValue({
      campaigns: [{ id: 'aion', name: 'War for Atreia - Series 1', gameName: 'AION 2', isCurrentChannel: true,
        drops: [{ id: 'voucher', benefitName: 'Customization Voucher', requiredMinutes: 30,
          currentMinutes: 0, percent: 0, hasProgress: false, isReadyToClaim: false }] }],
      loading: false, autoClaim: true, claimingIds: new Set(), claimableCount: 0,
      toggleAutoClaim: vi.fn(), claimDrop: vi.fn(), refreshDrops: vi.fn(),
    })
    render(<DropsModal token="valid_token" channel="cahos_gaming" onClose={() => {}} />)
    expect(screen.getByText('En este canal')).toBeDefined()
    expect(screen.getByText(/Progreso aún no confirmado/)).toBeDefined()
    expect(screen.queryByText('No hay Drops en progreso detectados')).toBeNull()
    expect(screen.queryByRole('button', { name: /¡Reclamar Drop!/i })).toBeNull()
  })

  it('offers the official inventory instead of retrying a blocked native claim', () => {
    const openInventory = vi.fn().mockResolvedValue('a'.repeat(32))
    vi.spyOn(embeddedInventory, 'useEmbeddedDropsInventory').mockReturnValue({
      isOpen: false, open: openInventory, close: vi.fn(), error: null, containerRef: { current: null },
    })
    const claim = vi.fn()
    vi.spyOn(useTwitchDropsModule, 'useTwitchDrops').mockReturnValue({
      campaigns: [{ id: 'aion', name: 'Campaign', drops: [{ id: 'voucher', benefitName: 'Voucher',
        requiredMinutes: 30, currentMinutes: 30, percent: 100, isReadyToClaim: true, dropInstanceId: 'instance' }] }],
      claimBlocked: true, claimError: 'failed integrity check', autoClaim: false,
      claimingIds: new Set(), claimableCount: 1, claimDrop: claim, toggleAutoClaim: vi.fn(), refreshDrops: vi.fn(),
    })
    render(<DropsModal token="token" onClose={() => {}} />)
    expect(screen.getByText('Auto-Claim: pausado')).toBeDefined()
    expect(screen.getByRole('alert').textContent).toContain('verificación de integridad')
    fireEvent.click(screen.getByRole('button', { name: 'Reclamar en Twitch' }))
    expect(openInventory).toHaveBeenCalledTimes(1)
    expect(claim).not.toHaveBeenCalled()
  })

  it('shows the official inventory inside the modal with a return-to-progress control', () => {
    mockCurrentChannel()
    const close = vi.fn()
    vi.spyOn(embeddedInventory, 'useEmbeddedDropsInventory').mockReturnValue({
      isOpen: true, open: vi.fn().mockResolvedValue('a'.repeat(32)), close, error: null, containerRef: { current: null },
    })
    vi.stubGlobal('isTauri', true)
    try {
      render(<DropsModal token="token" onClose={() => {}} />)
      expect(screen.getByLabelText('Inventario oficial de Twitch integrado')).toBeDefined()
      expect(screen.getByText(/Twitch oficial integrado/)).toBeDefined()
      fireEvent.click(screen.getByRole('button', { name: 'Progreso' }))
      expect(close).toHaveBeenCalledTimes(1)
    } finally { vi.unstubAllGlobals() }
  })

  function mockCurrentChannel() {
    vi.spyOn(useTwitchDropsModule, 'useTwitchDrops').mockReturnValue({
      campaigns: [{ id: 'aion', name: 'Campaign', isCurrentChannel: true,
        drops: [{ id: 'voucher', benefitName: 'Voucher', requiredMinutes: 30,
          currentMinutes: 0, percent: 0, hasProgress: true }] }],
      autoClaim: true, claimingIds: new Set(), claimableCount: 0,
      claimDrop: vi.fn(), toggleAutoClaim: vi.fn(), refreshDrops: vi.fn(),
    })
  }

  it('focuses the close control, wraps Tab and restores the opener on unmount', () => {
    mockCurrentChannel()
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { unmount } = render(<DropsModal token="token" onClose={() => {}} />)
    const close = screen.getByRole('button', { name: 'Cerrar modal' })
    const first = screen.getByRole('button', { name: 'Auto-Claim: ON' })
    try {
      expect(close).toHaveFocus()
      fireEvent.keyDown(close, { key: 'Tab' })
      expect(first).toHaveFocus()
      fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
      expect(close).toHaveFocus()
      unmount()
      expect(opener).toHaveFocus()
    } finally { unmount(); opener.remove() }
  })

  it('consumes Escape without closing other layers', () => {
    mockCurrentChannel()
    const onClose = vi.fn()
    const background = vi.fn()
    render(<DropsModal token="token" onClose={onClose} />)
    window.addEventListener('keydown', background)
    try {
      fireEvent.keyDown(screen.getByRole('button', { name: 'Cerrar modal' }), { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(background).not.toHaveBeenCalled()
    } finally { window.removeEventListener('keydown', background) }
  })

  it('moves the visual highlight when switching inventory panes', () => {
    mockCurrentChannel()
    const inventory = { isOpen: false, open: vi.fn(), close: vi.fn(), error: null, containerRef: { current: null } }
    vi.spyOn(embeddedInventory, 'useEmbeddedDropsInventory').mockReturnValue(inventory)
    vi.stubGlobal('isTauri', true)
    try {
      const { rerender } = render(<DropsModal token="token" onClose={() => {}} />)
      expect(screen.getByRole('button', { name: 'Progreso' })).toHaveClass('bg-purple-500/15')
      expect(screen.getByRole('button', { name: 'Inventario oficial' })).not.toHaveClass('bg-purple-500/15')
      inventory.isOpen = true
      rerender(<DropsModal token="token" onClose={() => {}} />)
      expect(screen.getByRole('button', { name: 'Inventario oficial' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Inventario oficial' })).toHaveClass('bg-purple-500/15')
      expect(screen.getByRole('button', { name: 'Progreso' })).not.toHaveClass('bg-purple-500/15')
    } finally { vi.unstubAllGlobals() }
  })

  it('excludes hidden progress controls from the official-pane Tab cycle', () => {
    mockCurrentChannel()
    vi.spyOn(embeddedInventory, 'useEmbeddedDropsInventory').mockReturnValue({
      isOpen: true, open: vi.fn(), close: vi.fn(), reload: vi.fn(), error: null, containerRef: { current: null },
    })
    render(<DropsModal token="token" channel="channel" nativeWatchEnabled
      onToggleNativeWatch={() => {}} onClose={() => {}} />)
    const back = screen.getByRole('button', { name: 'Volver al inventario de Twitch' })
    back.focus()
    fireEvent.keyDown(back, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Auto-Claim: ON' })).toHaveFocus()
    expect(screen.getByRole('checkbox', { hidden: true })).not.toHaveFocus()
  })

  it('does not close Drops for Escape originating in a nested dialog', () => {
    mockCurrentChannel()
    const onClose = vi.fn()
    render(<DropsModal token="token" onClose={onClose} />)
    const nested = document.createElement('div')
    nested.setAttribute('role', 'dialog')
    const control = nested.appendChild(document.createElement('button'))
    screen.getByRole('dialog').appendChild(nested)
    fireEvent.keyDown(control, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('reports unresolved native accreditation without sending the viewer to a second player', () => {
    mockCurrentChannel()
    render(<DropsModal token="token" channel="cahos_gaming" onClose={() => {}} />)
    expect(screen.getByText(/acreditación de minutos desde el reproductor nativo/)).toBeDefined()
    expect(screen.getByText('0 / 30 min (0%)')).toBeDefined()
    expect(screen.queryByRole('button', { name: /Ver canal en Twitch/ })).toBeNull()
  })

  it('keeps telemetry acceptance separate from earned Drop progress and offers an opt-in', () => {
    mockCurrentChannel()
    const toggle = vi.fn()
    render(<DropsModal token="token" channel="cahos_gaming" onClose={() => {}}
      nativeWatchEnabled nativeWatchStatus={{ state: 'reported', acceptedReports: 2 }}
      onToggleNativeWatch={toggle} />)
    expect(screen.getByText(/2 reportes aceptados por Twitch/)).toBeDefined()
    expect(screen.getByText('0 / 30 min (0%)')).toBeDefined()
    fireEvent.click(screen.getByRole('checkbox', { name: /Reporte nativo/ }))
    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it('displays rejected experimental reports without disguising them as progress', () => {
    mockCurrentChannel()
    render(<DropsModal token="token" channel="cahos_gaming" onClose={() => {}}
      nativeWatchEnabled nativeWatchStatus={{ state: 'blocked', error: 'Telemetría Twitch HTTP 403' }}
      onToggleNativeWatch={() => {}} />)
    expect(screen.getByText(/Telemetría Twitch HTTP 403/)).toBeDefined()
    expect(screen.getByText('0 / 30 min (0%)')).toBeDefined()
  })
})
