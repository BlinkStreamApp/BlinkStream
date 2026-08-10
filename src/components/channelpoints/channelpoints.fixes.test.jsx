

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RedeemModal from './RedeemModal'
import RewardForm from './RewardForm'
import PendingRedemptions from './PendingRedemptions'

function makeReward(overrides = {}) {
  return {
    id: 'r1',
    title: 'Hydrate',
    cost: 50,
    prompt: 'Bebe agua',
    is_user_input_required: false,
    is_enabled: true,
    background_color: '#9146ff',
    ...overrides,
  }
}

function renderRedeemModal(rewardOverrides = {}, extraProps = {}) {
  const onRedeem = vi.fn()
  const onClose = vi.fn()
  const reward = makeReward(rewardOverrides)
  render(
    <RedeemModal
      reward={reward}
      userBalance={null}
      submitting={false}
      error={null}
      success={null}
      onRedeem={onRedeem}
      onClose={onClose}
      {...extraProps}
    />
  )
  return { onRedeem, onClose, reward }
}

describe('FIX 2: RedeemModal — reward.is_enabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('si reward.is_enabled=false muestra banner y deshabilita submit', () => {
    renderRedeemModal({ is_enabled: false })

    expect(
      screen.getByText(/esta recompensa ya no est[áa] disponible|no disponible|disabled/i)
    ).toBeInTheDocument()

    const submitBtn = screen.getByRole('button', { name: /canjear|submit|✓/i })
    expect(submitBtn).toBeDisabled()
  })

  it('si reward.is_enabled=true (o undefined) el submit esta habilitado', () => {
    renderRedeemModal({ is_enabled: true })
    const submitBtn = screen.getByRole('button', { name: /canjear|submit/i })
    expect(submitBtn).not.toBeDisabled()
  })

  it('reward sin is_enabled explicito (undefined) se trata como activo', () => {
    renderRedeemModal({ is_enabled: undefined })
    const submitBtn = screen.getByRole('button', { name: /canjear|submit/i })
    expect(submitBtn).not.toBeDisabled()
  })
})

describe('FIX 3: RewardForm — cost >= 0', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('con cost=0 el boton guardar esta habilitado', () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true })
    const onCancel = vi.fn()
    render(
      <RewardForm
        initial={null}
        saving={false}
        onSave={onSave}
        onCancel={onCancel}
      />
    )

    const titleInput = screen.getAllByRole('textbox')[0]
    fireEvent.change(titleInput, { target: { value: 'Test reward' } })

    const costInput = screen.getByRole('spinbutton')
    fireEvent.change(costInput, { target: { value: '0' } })

    const submitBtn = screen.getByRole('button', { name: /cp\.manage\.save|guardar|save/i })
    expect(submitBtn).not.toBeDisabled()
  })

  it('el input cost tiene min=0 (no min=1)', () => {
    render(
      <RewardForm
        initial={null}
        saving={false}
        onSave={vi.fn().mockResolvedValue({ ok: true })}
        onCancel={vi.fn()}
      />
    )
    const costInput = screen.getByRole('spinbutton')
    expect(costInput).toHaveAttribute('min', '0')
  })

  it('initial con cost=0 NO se sobrescribe al default 50', () => {

    render(
      <RewardForm
        initial={{ title: 'Free', cost: 0, is_enabled: true }}
        saving={false}
        onSave={vi.fn().mockResolvedValue({ ok: true })}
        onCancel={vi.fn()}
      />
    )
    const costInput = screen.getByRole('spinbutton')
    expect(costInput.value).toBe('0')
  })

  it('initial con cost valido (50) se respeta', () => {
    render(
      <RewardForm
        initial={{ title: 'Test', cost: 50, is_enabled: true }}
        saving={false}
        onSave={vi.fn().mockResolvedValue({ ok: true })}
        onCancel={vi.fn()}
      />
    )
    const costInput = screen.getByRole('spinbutton')
    expect(costInput.value).toBe('50')
  })
})

function makeRedemptions(n, prefix = 'rd') {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    reward_id: 'r1',
    reward_title: 'Reward 1',
    user_name: `user${i}`,
    user_login: `user${i}`,
    redeemed_at: '2026-01-01T00:00:00Z',
  }))
}

describe('FIX 4: PendingRedemptions — paginacion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('con 120 redenciones, solo se renderizan 50 por defecto', () => {
    const redemptions = makeRedemptions(120)
    render(
      <PendingRedemptions
        redemptions={redemptions}
        loading={false}
        error={null}
        onFulfill={vi.fn()}
        onCancel={vi.fn()}
        onBulkFulfill={vi.fn()}
        onBulkCancel={vi.fn()}
        onRefresh={vi.fn()}
      />
    )

    expect(screen.getByText('user0')).toBeInTheDocument()
    expect(screen.getByText('user49')).toBeInTheDocument()
    expect(screen.queryByText('user50')).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: /cp\.pending\.loadMore|ver m[áa]s|load more/i })).toBeInTheDocument()
  })

  it('click en "Ver mas" carga 50 mas', () => {
    const redemptions = makeRedemptions(120)
    render(
      <PendingRedemptions
        redemptions={redemptions}
        loading={false}
        error={null}
        onFulfill={vi.fn()}
        onCancel={vi.fn()}
        onBulkFulfill={vi.fn()}
        onBulkCancel={vi.fn()}
        onRefresh={vi.fn()}
      />
    )
    const loadMore = screen.getByRole('button', { name: /cp\.pending\.loadMore|ver m[áa]s|load more/i })
    fireEvent.click(loadMore)

    expect(screen.getByText('user50')).toBeInTheDocument()
    expect(screen.getByText('user99')).toBeInTheDocument()

    expect(screen.queryByText('user100')).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: /cp\.pending\.loadMore|ver m[áa]s|load more/i })).toBeInTheDocument()
  })

  it('con menos de 50 redenciones, NO aparece "Ver mas"', () => {
    const redemptions = makeRedemptions(10)
    render(
      <PendingRedemptions
        redemptions={redemptions}
        loading={false}
        error={null}
        onFulfill={vi.fn()}
        onCancel={vi.fn()}
        onBulkFulfill={vi.fn()}
        onBulkCancel={vi.fn()}
        onRefresh={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /ver m[áa]s|load more/i })).not.toBeInTheDocument()
  })

  it('con exactamente 50 redenciones, NO aparece "Ver mas"', () => {
    const redemptions = makeRedemptions(50)
    render(
      <PendingRedemptions
        redemptions={redemptions}
        loading={false}
        error={null}
        onFulfill={vi.fn()}
        onCancel={vi.fn()}
        onBulkFulfill={vi.fn()}
        onBulkCancel={vi.fn()}
        onRefresh={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /ver m[áa]s|load more/i })).not.toBeInTheDocument()
  })
})
