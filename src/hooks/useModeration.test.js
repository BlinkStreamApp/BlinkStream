// Tests del hook useModeration (M1 / WT-20260628-13).
// Cubre: acciones ban/unban/timeout/delete, rate limit local, audit
// log persistente, y los helpers parseDuration + formatRemaining.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const banUserMock = vi.fn()
const unbanUserMock = vi.fn()
const deleteChatMessageMock = vi.fn()
vi.mock('../utils/twitch', async () => {
  const actual = await vi.importActual('../utils/twitch')
  return {
    ...actual,
    banUser: (...args) => banUserMock(...args),
    unbanUser: (...args) => unbanUserMock(...args),
    deleteChatMessage: (...args) => deleteChatMessageMock(...args),
  }
})

const { useModeration, parseDuration, formatRemaining, clearRateLimitState } = await import('./useModeration')

describe('useModeration — acciones basicas', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearRateLimitState() // CRITICO: limpia el state modulo-level entre tests
    banUserMock.mockReset()
    unbanUserMock.mockReset()
    deleteChatMessageMock.mockReset()
    banUserMock.mockResolvedValue({ success: true, value: null })
    unbanUserMock.mockResolvedValue({ success: true, value: null })
    deleteChatMessageMock.mockResolvedValue({ success: true, value: null })
  })

  afterEach(() => vi.restoreAllMocks())

  it('ban: llama al helper, persiste en auditLog, devuelve true', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: '111' }))
    let ok
    await act(async () => { ok = await result.current.ban('u1', 'alice', 'spam') })
    expect(ok).toBe(true)
    expect(banUserMock).toHaveBeenCalledWith('111', 'u1', 'spam')
    expect(result.current.auditLog).toHaveLength(1)
    expect(result.current.auditLog[0].action).toBe('ban')
    expect(result.current.auditLog[0].targetName).toBe('alice')
    expect(result.current.auditLog[0].success).toBe(true)
  })

  it('ban falla: registra error en audit y devuelve false', async () => {
    banUserMock.mockResolvedValueOnce({ success: false, error: { message: 'Forbidden' } })
    const { result } = renderHook(() => useModeration({ broadcasterId: '111' }))
    let ok
    await act(async () => { ok = await result.current.ban('u1', 'alice', 'spam') })
    expect(ok).toBe(false)
    expect(result.current.auditLog[0].success).toBe(false)
    expect(result.current.auditLog[0].error).toBe('Forbidden')
  })

  it('unban: llama a unbanUser, audit OK', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: '111' }))
    await act(async () => { await result.current.unban('u1', 'alice') })
    expect(unbanUserMock).toHaveBeenCalledWith('111', 'u1')
    expect(result.current.auditLog[0].action).toBe('unban')
  })

  it('timeout: pasa duration en segundos al banUser', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: '111' }))
    await act(async () => { await result.current.timeout('u1', 'alice', 600, 'spam') })
    expect(banUserMock).toHaveBeenCalledWith('111', 'u1', 'spam', 600)
    expect(result.current.auditLog[0].action).toBe('timeout')
    expect(result.current.auditLog[0].duration).toBe(600)
  })

  it('deleteMessage: llama a deleteChatMessage, audit OK', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: '111' }))
    await act(async () => { await result.current.deleteMessage('msg-1', 'alice') })
    expect(deleteChatMessageMock).toHaveBeenCalledWith('111', 'msg-1')
    expect(result.current.auditLog[0].action).toBe('delete')
  })

  it('sin broadcasterId: todas las acciones devuelven false sin llamar a Helix', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: null }))
    let ok
    await act(async () => { ok = await result.current.ban('u1', 'alice') })
    expect(ok).toBe(false)
    expect(banUserMock).not.toHaveBeenCalled()
    expect(result.current.auditLog).toHaveLength(0)
  })
})

describe('useModeration — rate limit local', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearRateLimitState() // CRITICO: limpia el state modulo-level entre tests
    banUserMock.mockReset()
    unbanUserMock.mockReset()
    deleteChatMessageMock.mockReset()
    banUserMock.mockResolvedValue({ success: true, value: null })
  })

  afterEach(() => {
    clearRateLimitState()
    vi.restoreAllMocks()
  })

  it('20 acciones consecutivas permitidas, la 21 bloqueada', async () => {
    const { result } = renderHook(() =>
      useModeration({ broadcasterId: '111', maxActions: 20, windowMs: 30000 }),
    )
    // 20 oks
    for (let i = 0; i < 20; i++) {
      let ok
      await act(async () => { ok = await result.current.ban(`u${i}`, `user${i}`) })
      expect(ok).toBe(true)
    }
    // La 21 deberia bloquearse
    let ok21
    await act(async () => { ok21 = await result.current.ban('u21', 'user21') })
    expect(ok21).toBe(false)
    expect(result.current.isRateLimited).toBe(true)
    expect(result.current.remainingActions).toBe(0)
  })

  it('FIX P0-3: un 403 NO consume rate limit — los slots siguen disponibles', async () => {
    // FIX P0-3: antes `_consumeRate` se ejecutaba ANTES del await de
    // banUser. Si Twitch devolvia 403, el slot quedaba consumido y
    // bloqueaba futuras acciones legitimas hasta que expirara la
    // ventana. Ahora `_recordRate` se llama solo tras un await exitoso.
    // Simulamos maxActions=3 para que el test sea rapido.
    // Primer fetch: 403 (fallo). Segundo fetch: 200 (exito). Tercero: 200.
    // Si el bug estuviera presente, solo el primer fetch consumiria
    // un slot (los siguientes contarian como 2 y 3, bloqueando el 4).
    // Con el fix, el 403 NO consume, asi que los 2 exitosos cuentan
    // como 1 y 2, y quedan 1 slot libre (no 0).
    banUserMock
      .mockResolvedValueOnce({ success: false, error: { message: 'Forbidden' } })
      .mockResolvedValueOnce({ success: true, value: null })
      .mockResolvedValueOnce({ success: true, value: null })
    const { result } = renderHook(() =>
      useModeration({ broadcasterId: 'FIX-P03', maxActions: 3, windowMs: 30000 }),
    )
    // 1) ban con 403 — falla, NO consume
    let ok1
    await act(async () => { ok1 = await result.current.ban('u1', 'alice') })
    expect(ok1).toBe(false)
    // El slot 1 NO se consumio. Quedan 3 disponibles, no 2.
    expect(result.current.remainingActions).toBe(3)
    expect(result.current.isRateLimited).toBe(false)
    // 2) ban con 200 — consume
    let ok2
    await act(async () => { ok2 = await result.current.ban('u2', 'bob') })
    expect(ok2).toBe(true)
    expect(result.current.remainingActions).toBe(2)
    // 3) ban con 200 — consume
    let ok3
    await act(async () => { ok3 = await result.current.ban('u3', 'charlie') })
    expect(ok3).toBe(true)
    expect(result.current.remainingActions).toBe(1)
    // 4) ban con 200 — consume (debe pasar, no estar bloqueado por el 403 fantasma)
    let ok4
    await act(async () => { ok4 = await result.current.ban('u4', 'diana') })
    expect(ok4).toBe(true)
    expect(result.current.remainingActions).toBe(0)
    // 5) ban — ahora SI debe bloquearse (ya consumio los 3 exitosos)
    let ok5
    await act(async () => { ok5 = await result.current.ban('u5', 'eve') })
    expect(ok5).toBe(false)
    expect(result.current.isRateLimited).toBe(true)
  })

  it('FIX P0-3: un fallo de red (helper devuelve error) tampoco consume rate limit', async () => {
    // Variante: el helper de twitch NO lanza (helixFetch captura todo
    // y devuelve {success:false, error:AppError}), pero queremos validar
    // la misma semantica desde la perspectiva del wrapper. Esto cubre
    // tambien el caso donde la red se cayo: el helper devuelve error,
    // el wrapper lo recibe, NO consume el slot, y reporta el fallo en
    // el audit. Asi, el siguiente intento (cuando la red vuelva) tiene
    // el slot completo disponible.
    banUserMock.mockResolvedValueOnce({ success: false, error: { message: 'Network down' } })
    const { result } = renderHook(() =>
      useModeration({ broadcasterId: 'FIX-P03-2', maxActions: 2, windowMs: 30000 }),
    )
    let ok1
    await act(async () => { ok1 = await result.current.ban('u1', 'alice') })
    expect(ok1).toBe(false)
    // El slot NO se consumio — quedan 2 disponibles
    expect(result.current.remainingActions).toBe(2)
    expect(result.current.isRateLimited).toBe(false)
  })

  it('isRateLimited se desactiva despues de la ventana (mockeamos Date.now)', async () => {
    // FIX P0-3: con la nueva semantica, despues de maxActions exitosos
    // el state pasa a isRateLimited=true (antes era un setIsRateLimited(false)
    // hardcoded al final del _consumeRate que dejaba el state inconsistente).
    // Ahora refleja la realidad: 3 bans en ventana = 3/3 = rate limited.
    const realDateNow = Date.now
    let now = 1_000_000
    Date.now = vi.fn(() => now)
    try {
      const { result } = renderHook(() =>
        useModeration({ broadcasterId: '111', maxActions: 3, windowMs: 1000 }),
      )
      for (let i = 0; i < 3; i++) {
        await act(async () => { await result.current.ban(`u${i}`, `u${i}`) })
      }
      // Despues de 3 bans exitosos, isRateLimited DEBE ser true (3/3)
      expect(result.current.isRateLimited).toBe(true)
      expect(result.current.remainingActions).toBe(0)
      // Cuarta accion debe bloquearse
      let ok
      await act(async () => { ok = await result.current.ban('u3', 'u3') })
      expect(ok).toBe(false)
      expect(result.current.isRateLimited).toBe(true)
      // Avanzamos el reloj 1.1s
      now += 1100
      // Esperar a que el interval interno haga el check (500ms)
      await waitFor(() => expect(result.current.isRateLimited).toBe(false), { timeout: 2000 })
    } finally {
      Date.now = realDateNow
    }
  })
})

describe('useModeration — audit log persistencia', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    banUserMock.mockReset()
    banUserMock.mockResolvedValue({ success: true, value: null })
  })

  afterEach(() => vi.restoreAllMocks())

  it('audit log se guarda en localStorage por canal', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: 'C1' }))
    await act(async () => { await result.current.ban('u1', 'alice') })
    await act(async () => { await result.current.ban('u2', 'bob') })
    const stored = JSON.parse(localStorage.getItem('bs.modAudit.C1'))
    expect(stored).toHaveLength(2)
    expect(stored[0].targetName).toBe('alice')
    expect(stored[1].targetName).toBe('bob')
  })

  it('audit log se carga al cambiar de canal', async () => {
    // Pre-poblar localStorage
    const seed = [
      { id: '1', timestamp: 1000, action: 'ban', target: 'u1', targetName: 'old', success: true },
    ]
    localStorage.setItem('bs.modAudit.C2', JSON.stringify(seed))
    const { result } = renderHook(() => useModeration({ broadcasterId: 'C2' }))
    await waitFor(() => expect(result.current.auditLog).toHaveLength(1))
    expect(result.current.auditLog[0].targetName).toBe('old')
  })

  it('clearAuditLog vacia el log del canal actual', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: 'C3' }))
    await act(async () => { await result.current.ban('u1', 'alice') })
    expect(result.current.auditLog).toHaveLength(1)
    act(() => result.current.clearAuditLog())
    expect(result.current.auditLog).toHaveLength(0)
    expect(localStorage.getItem('bs.modAudit.C3')).toBeNull()
  })

  it('audit log circular: max 100 entradas', async () => {
    // Hago el test con maxActions alto
    const { result: r2 } = renderHook(() => useModeration({ broadcasterId: 'C5', maxActions: 200 }))
    for (let i = 0; i < 120; i++) {
      await act(async () => { await r2.current.ban(`u${i}`, `u${i}`) })
    }
    expect(r2.current.auditLog.length).toBe(100)
    expect(r2.current.auditLog[0].targetName).toBe('u20') // 120 - 100 = 20 son los mas viejos descartados
  })
})

describe('useModeration — chat modes + clear', () => {
  beforeEach(() => {
    localStorage.clear()
    clearRateLimitState()
    banUserMock.mockReset()
  })
  afterEach(() => {
    clearRateLimitState()
    vi.restoreAllMocks()
  })

  it('setChatMode: audita con action=chat_mode, target=mode', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: 'C6' }))
    let ok
    await act(async () => { ok = await result.current.setChatMode('slow', '30') })
    expect(ok).toBe(true)
    expect(result.current.auditLog[0].action).toBe('chat_mode')
    expect(result.current.auditLog[0].target).toBe('slow')
    expect(result.current.auditLog[0].reason).toBe('30')
  })

  it('clearChat: audita con action=clear, target=channel', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: 'C7' }))
    let ok
    await act(async () => { ok = await result.current.clearChat() })
    expect(ok).toBe(true)
    expect(result.current.auditLog[0].action).toBe('clear')
    expect(result.current.auditLog[0].target).toBe('channel')
  })
})

describe('parseDuration + formatRemaining helpers', () => {
  it('parseDuration: segundos, minutos, horas, dias', () => {
    expect(parseDuration('30s')).toBe(30)
    expect(parseDuration('5m')).toBe(300)
    expect(parseDuration('1h')).toBe(3600)
    expect(parseDuration('2d')).toBe(2 * 86400)
  })

  it('parseDuration: invalido devuelve null', () => {
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('xyz')).toBeNull()
    expect(parseDuration('0m')).toBeNull()
    expect(parseDuration('5x')).toBeNull()
  })

  it('formatRemaining: HH:MM:SS', () => {
    expect(formatRemaining(0)).toBe('00:00:00')
    expect(formatRemaining(59)).toBe('00:00:59')
    expect(formatRemaining(60)).toBe('00:01:00')
    expect(formatRemaining(3600)).toBe('01:00:00')
    expect(formatRemaining(3661)).toBe('01:01:01')
    expect(formatRemaining(-5)).toBe('00:00:00')
    expect(formatRemaining(NaN)).toBe('00:00:00')
  })
})
