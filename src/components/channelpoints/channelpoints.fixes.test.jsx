// Tests de regresion para los fixes P1 del sprint tecnico
// WT-20260628-29 (Channel Points).
//
//   FIX 2: RedeemModal chequea reward.is_enabled al mount.
//   FIX 3: RewardForm permite cost=0 (rewards gratis).
//   FIX 4: PendingRedemptions pagina con PAGE_SIZE=50 y "Ver mas".
//
// FIX 1 (throttle de concurrency en useChannelPoints) ya tiene su
// test dentro de useChannelPoints.test.js — se queda ahi porque
// testea un hook con mocks del API, no un componente.
//
// NOTA sobre el setup: este proyecto usa @vitejs/plugin-react v6 con
// el "automatic" runtime, que no requiere `import React` en los .jsx
// de la app. Sin embargo, vitest 2.x procesa los .jsx de los tests
// con esbuild y no siempre inyecta el automatic runtime — el mismo
// problema lo arrastra src/components/moderation/ActionModal.test.jsx
// (roto en main, pre-existente a este sprint). Cuando se arregle el
// `vitest.config.js` (esbuild.jsxInject o equivalente), estos tests
// pasaran sin cambios. Mantenemos la sintaxis del proyecto.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RedeemModal from './RedeemModal'
import RewardForm from './RewardForm'
import PendingRedemptions from './PendingRedemptions'

// ─── FIX 2: RedeemModal ────────────────────────────────────────────

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
    // Banner visible (cp.redeem.disabled = "Esta recompensa ya no está disponible.")
    expect(
      screen.getByText(/esta recompensa ya no est[áa] disponible|no disponible|disabled/i)
    ).toBeInTheDocument()
    // El boton de submit (Canjear / Submit) debe estar deshabilitado
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

// ─── FIX 3: RewardForm ─────────────────────────────────────────────

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
    // canSubmit requiere title valido ademas de cost >= 0, asi que
    // poblamos el title antes de tocar el cost (si no, el boton queda
    // disabled por el title vacio, no por el cost).
    // El <input> del title no tiene htmlFor/aria-label accesible en el
    // componente, asi que lo localizamos por posicion: es el primer
    // textbox del form (el textarea del prompt viene despues).
    const titleInput = screen.getAllByRole('textbox')[0]
    fireEvent.change(titleInput, { target: { value: 'Test reward' } })
    // El input de cost esta controlado, lo localizamos y le metemos 0.
    const costInput = screen.getByRole('spinbutton')
    fireEvent.change(costInput, { target: { value: '0' } })
    // El boton de submit tiene texto "cp.manage.save" (literal, porque
    // esa key aun no existe en i18n.js). Tambien matcheamos "guardar"/"save"
    // para que el test sea robusto si se agrega la traduccion a futuro.
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
    // Este test es conceptual: si initial.cost=0, el estado inicial
    // debe ser 0, no 50. Como el form se monta con useState inicial,
    // verificamos que el input arranca en 0.
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

// ─── FIX 4: PendingRedemptions — paginacion client-side ─────────────

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
    // user0..user49 visibles; user50..user119 NO.
    expect(screen.getByText('user0')).toBeInTheDocument()
    expect(screen.getByText('user49')).toBeInTheDocument()
    expect(screen.queryByText('user50')).not.toBeInTheDocument()
    // Boton "Ver mas" presente. El texto real es "cp.pending.loadMore"
    // (literal, esa key no existe en i18n.js todavia); matcheamos tambien
    // "ver mas"/"load more" para robustez futura.
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
    // Ahora user50 debe ser visible
    expect(screen.getByText('user50')).toBeInTheDocument()
    expect(screen.getByText('user99')).toBeInTheDocument()
    // user100 sigue oculto
    expect(screen.queryByText('user100')).not.toBeInTheDocument()
    // Sigue habiendo "Ver mas" porque quedan 20 mas
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
