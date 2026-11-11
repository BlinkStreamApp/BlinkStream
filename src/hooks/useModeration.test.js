

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement, useLayoutEffect, useRef } from 'react'
import { ModActionFeed } from '../components/modview/ModActionFeed'
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react'

const banUserMock = vi.fn()
const unbanUserMock = vi.fn()
const deleteChatMessageMock = vi.fn()
const clearChatMessagesMock = vi.fn()
const updateChatSettingsMock = vi.fn()
const getChatSettingsMock = vi.fn()
vi.mock('../utils/twitch', async () => {
  const actual = await vi.importActual('../utils/twitch')
  return {
    ...actual,
    banUser: (...args) => banUserMock(...args),
    unbanUser: (...args) => unbanUserMock(...args),
    deleteChatMessage: (...args) => deleteChatMessageMock(...args),
    clearChatMessages: (...args) => clearChatMessagesMock(...args),
    updateChatSettings: (...args) => updateChatSettingsMock(...args),
    getChatSettings: (...args) => getChatSettingsMock(...args),
  }
})

const { useModeration, parseDuration, formatRemaining, clearRateLimitState } = await import('./useModeration')

describe('useModeration — acciones basicas', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearRateLimitState() 
    banUserMock.mockReset()
    unbanUserMock.mockReset()
    deleteChatMessageMock.mockReset()
    clearChatMessagesMock.mockReset()
    updateChatSettingsMock.mockReset()
    getChatSettingsMock.mockReset()
    banUserMock.mockResolvedValue({ success: true, value: null })
    unbanUserMock.mockResolvedValue({ success: true, value: null })
    deleteChatMessageMock.mockResolvedValue({ success: true, value: null })
    clearChatMessagesMock.mockResolvedValue({ success: true, value: null })
    updateChatSettingsMock.mockResolvedValue({ success: true, value: null })
    getChatSettingsMock.mockResolvedValue({ success: true, value: null })
  })

  afterEach(() => vi.restoreAllMocks())

  it('ban: llama al helper, persiste en auditLog, devuelve true', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: '111', userId: 'mod1' }))
    let ok
    await act(async () => { ok = await result.current.ban('u1', 'alice', 'spam') })
    expect(ok).toBe(true)
    expect(banUserMock).toHaveBeenCalledWith('111', 'mod1', 'u1', 'spam')
    expect(result.current.auditLog).toHaveLength(1)
    expect(result.current.auditLog[0].action).toBe('ban')
    expect(result.current.auditLog[0].targetName).toBe('alice')
    expect(result.current.auditLog[0].success).toBe(true)
  })

  it('ban falla: registra error en audit y devuelve false', async () => {
    banUserMock.mockResolvedValueOnce({ success: false, error: { message: 'Forbidden' } })
    const { result } = renderHook(() => useModeration({ broadcasterId: '111', userId: 'mod1' }))
    let ok
    await act(async () => { ok = await result.current.ban('u1', 'alice', 'spam') })
    expect(ok).toBe(false)
    expect(result.current.auditLog[0].success).toBe(false)
    expect(result.current.auditLog[0].error).toBe('Forbidden')
  })

  it('unban: llama a unbanUser, audit OK', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: '111', userId: 'mod1' }))
    await act(async () => { await result.current.unban('u1', 'alice') })
    expect(unbanUserMock).toHaveBeenCalledWith('111', 'mod1', 'u1')
    expect(result.current.auditLog[0].action).toBe('unban')
  })

  it('timeout: pasa duration en segundos al banUser', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: '111', userId: 'mod1' }))
    await act(async () => { await result.current.timeout('u1', 'alice', 600, 'spam') })
    expect(banUserMock).toHaveBeenCalledWith('111', 'mod1', 'u1', 'spam', 600)
    expect(result.current.auditLog[0].action).toBe('timeout')
    expect(result.current.auditLog[0].duration).toBe(600)
  })

  it('deleteMessage: llama a deleteChatMessage, audit OK', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: '111', userId: 'mod1' }))
    await act(async () => { await result.current.deleteMessage('msg-1', 'alice') })
    expect(deleteChatMessageMock).toHaveBeenCalledWith('111', 'mod1', 'msg-1')
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
    clearRateLimitState() 
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
      useModeration({ broadcasterId: '111', userId: 'mod1', maxActions: 20, windowMs: 30000 }),
    )

    for (let i = 0; i < 20; i++) {
      let ok
      await act(async () => { ok = await result.current.ban(`u${i}`, `user${i}`) })
      expect(ok).toBe(true)
    }

    let ok21
    await act(async () => { ok21 = await result.current.ban('u21', 'user21') })
    expect(ok21).toBe(false)
    expect(result.current.isRateLimited).toBe(true)
    expect(result.current.remainingActions).toBe(0)
  })

  it('FIX P0-3: un 403 NO consume rate limit — los slots siguen disponibles', async () => {

    banUserMock
      .mockResolvedValueOnce({ success: false, error: { message: 'Forbidden' } })
      .mockResolvedValueOnce({ success: true, value: null })
      .mockResolvedValueOnce({ success: true, value: null })
    const { result } = renderHook(() =>
      useModeration({ broadcasterId: 'FIX-P03', userId: 'mod1', maxActions: 3, windowMs: 30000 }),
    )

    let ok1
    await act(async () => { ok1 = await result.current.ban('u1', 'alice') })
    expect(ok1).toBe(false)

    expect(result.current.remainingActions).toBe(3)
    expect(result.current.isRateLimited).toBe(false)

    let ok2
    await act(async () => { ok2 = await result.current.ban('u2', 'bob') })
    expect(ok2).toBe(true)
    expect(result.current.remainingActions).toBe(2)

    let ok3
    await act(async () => { ok3 = await result.current.ban('u3', 'charlie') })
    expect(ok3).toBe(true)
    expect(result.current.remainingActions).toBe(1)

    let ok4
    await act(async () => { ok4 = await result.current.ban('u4', 'diana') })
    expect(ok4).toBe(true)
    expect(result.current.remainingActions).toBe(0)

    let ok5
    await act(async () => { ok5 = await result.current.ban('u5', 'eve') })
    expect(ok5).toBe(false)
    expect(result.current.isRateLimited).toBe(true)
  })

  it('FIX P0-3: un fallo de red (helper devuelve error) tampoco consume rate limit', async () => {

    banUserMock.mockResolvedValueOnce({ success: false, error: { message: 'Network down' } })
    const { result } = renderHook(() =>
      useModeration({ broadcasterId: 'FIX-P03-2', userId: 'mod1', maxActions: 2, windowMs: 30000 }),
    )
    let ok1
    await act(async () => { ok1 = await result.current.ban('u1', 'alice') })
    expect(ok1).toBe(false)

    expect(result.current.remainingActions).toBe(2)
    expect(result.current.isRateLimited).toBe(false)
  })

  it('isRateLimited se desactiva despues de la ventana (mockeamos Date.now)', async () => {

    const realDateNow = Date.now
    let now = 1_000_000
    Date.now = vi.fn(() => now)
    try {
      const { result } = renderHook(() =>
        useModeration({ broadcasterId: '111', userId: 'mod1', maxActions: 3, windowMs: 1000 }),
      )
      for (let i = 0; i < 3; i++) {
        await act(async () => { await result.current.ban(`u${i}`, `u${i}`) })
      }

      expect(result.current.isRateLimited).toBe(true)
      expect(result.current.remainingActions).toBe(0)

      let ok
      await act(async () => { ok = await result.current.ban('u3', 'u3') })
      expect(ok).toBe(false)
      expect(result.current.isRateLimited).toBe(true)

      now += 1100

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
    const { result } = renderHook(() => useModeration({ broadcasterId: 'C1', userId: 'mod1' }))
    await act(async () => { await result.current.ban('u1', 'alice') })
    await act(async () => { await result.current.ban('u2', 'bob') })
    const stored = JSON.parse(localStorage.getItem('bs.modAudit.v2.mod1.C1'))
    expect(stored).toHaveLength(2)
    expect(stored[0].targetName).toBe('alice')
    expect(stored[1].targetName).toBe('bob')
  })

  it('audit log se carga al cambiar de canal', async () => {

    const seed = [
      { id: '1', timestamp: 1000, action: 'ban', target: 'u1', targetName: 'old', success: true },
    ]
    localStorage.setItem('bs.modAudit.v2.mod1.C2', JSON.stringify(seed))
    const { result } = renderHook(() => useModeration({ broadcasterId: 'C2', userId: 'mod1' }))
    await waitFor(() => expect(result.current.auditLog).toHaveLength(1))
    expect(result.current.auditLog[0].targetName).toBe('old')
  })

  it('clearAuditLog vacia el log del canal actual', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: 'C3', userId: 'mod1' }))
    await act(async () => { await result.current.ban('u1', 'alice') })
    expect(result.current.auditLog).toHaveLength(1)
    act(() => result.current.clearAuditLog())
    expect(result.current.auditLog).toHaveLength(0)
    expect(localStorage.getItem('bs.modAudit.v2.mod1.C3')).toBeNull()
  })

  it('audit log circular: max 100 entradas', async () => {

    const { result: r2 } = renderHook(() => useModeration({ broadcasterId: 'C5', userId: 'mod1', maxActions: 200 }))
    for (let i = 0; i < 120; i++) {
      await act(async () => { await r2.current.ban(`u${i}`, `u${i}`) })
    }
    expect(r2.current.auditLog.length).toBe(100)
    expect(r2.current.auditLog[0].targetName).toBe('u20') 
  })
})

describe('useModeration — chat modes + clear', () => {
  beforeEach(() => {
    localStorage.clear()
    clearRateLimitState()
    banUserMock.mockReset()
    updateChatSettingsMock.mockReset()
    clearChatMessagesMock.mockReset()
    updateChatSettingsMock.mockResolvedValue({ success: true, value: null })
    clearChatMessagesMock.mockResolvedValue({ success: true, value: null })
  })
  afterEach(() => {
    clearRateLimitState()
    vi.restoreAllMocks()
  })

  it('setChatMode: audita con action=chat_mode, target=mode', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: 'C6', userId: 'mod1' }))
    let ok
    await act(async () => { ok = await result.current.setChatMode('slow', '30') })
    expect(ok).toBe(true)
    expect(result.current.auditLog[0].action).toBe('chat_mode')
    expect(result.current.auditLog[0].target).toBe('slow')
    expect(result.current.auditLog[0].reason).toBe('30')
  })

  it('clearChat: audita con action=clear, target=channel', async () => {
    const { result } = renderHook(() => useModeration({ broadcasterId: 'C7', userId: 'mod1' }))
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


describe('useModeration — aislamiento de auditoría', () => {
  const key = (account, channel) => `bs.modAudit.v2.${account}.${channel}`
  const row = name => ({ id: name, timestamp: 1, action: 'ban', targetName: name })
  beforeEach(() => {
    localStorage.clear()
    clearRateLimitState()
    banUserMock.mockReset().mockResolvedValue({ success: true })
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([
    [{ broadcasterId: 'B', userId: 'one' }, 'one', 'B'],
    [{ broadcasterId: 'A', userId: 'two' }, 'two', 'A'],
    [{ broadcasterId: 'A', userId: null }, null, 'A'],
  ])('oculta filas desde el primer render y conserva la respuesta en origen: %j', async (next, account, channel) => {
    localStorage.setItem(key('one', 'A'), JSON.stringify([row('original')]))
    if (account) localStorage.setItem(key(account, channel), JSON.stringify([row('other')]))
    let resolve
    banUserMock.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const renders = []
    const { result, rerender } = renderHook(props => {
      const mod = useModeration(props)
      renders.push(mod.auditLog.map(r => r.targetName))
      return mod
    }, { initialProps: { broadcasterId: 'A', userId: 'one' } })
    let pending
    act(() => { pending = result.current.ban('u', 'late') })
    renders.length = 0
    rerender(next)
    expect(renders[0]).toEqual([])
    await act(async () => { resolve({ success: true }); await pending })
    expect(result.current.auditLog.map(r => r.targetName)).toEqual(account ? ['other'] : [])
    expect(JSON.parse(localStorage.getItem(key('one', 'A'))).map(r => r.targetName)).toEqual(['original', 'late'])
    rerender({ broadcasterId: 'A', userId: 'one' })
    expect(result.current.auditLog.map(r => r.targetName)).toEqual(['original', 'late'])
  })

  it('A→B→A antes de completar conserva solo las filas de A', async () => {
    let resolve
    banUserMock.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const { result, rerender } = renderHook(props => useModeration(props), { initialProps: { broadcasterId: 'A', userId: 'one' } })
    let pending
    act(() => { pending = result.current.ban('u', 'late') })
    rerender({ broadcasterId: 'B', userId: 'one' })
    await act(async () => { await result.current.ban('v', 'other') })
    rerender({ broadcasterId: 'A', userId: 'one' })
    await act(async () => { resolve({ success: true }); await pending })
    expect(result.current.auditLog.map(r => r.targetName)).toEqual(['late'])
  })

  it('no importa ni borra legacy; clear y reload pertenecen a la cuenta actual', async () => {
    const legacy = ' [ {"timestamp":1,"action":"ban"} ] '
    localStorage.setItem('bs.modAudit.A', legacy)
    const { result, rerender } = renderHook(props => useModeration(props), { initialProps: { broadcasterId: 'A', userId: 'one' } })
    expect(result.current.auditLog).toEqual([])
    await act(async () => { await result.current.ban('u', 'one') })
    rerender({ broadcasterId: 'A', userId: 'two' })
    act(() => result.current.clearAuditLog())
    expect(JSON.parse(localStorage.getItem(key('one', 'A')))).toHaveLength(1)
    localStorage.setItem(key('two', 'A'), JSON.stringify([row('two')]))
    act(() => result.current.reloadAuditLog())
    expect(result.current.auditLog[0].targetName).toBe('two')
    act(() => result.current.clearAuditLog())
    expect(result.current.auditLog).toEqual([])
    expect(localStorage.getItem('bs.modAudit.A')).toBe(legacy)
  })

  it('dos escritores no pisan snapshots y clear se propaga', async () => {
    const a = renderHook(() => useModeration({ broadcasterId: 'A', userId: 'one' }))
    const b = renderHook(() => useModeration({ broadcasterId: 'A', userId: 'one' }))
    await act(async () => { await a.result.current.ban('u', 'first'); await b.result.current.ban('v', 'second') })
    expect(a.result.current.auditLog.map(r => r.targetName)).toEqual(['first', 'second'])
    expect(b.result.current.auditLog).toEqual(a.result.current.auditLog)
    act(() => b.result.current.clearAuditLog())
    expect(a.result.current.auditLog).toEqual([])
  })

  it('almacenamiento bloqueado mantiene UX en memoria mientras está montado', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked') })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw Error('blocked') })
    const { result } = renderHook(() => useModeration({ broadcasterId: 'A', userId: 'one' }))
    await act(async () => { await result.current.ban('u', 'first'); await result.current.ban('v', 'second') })
    act(() => result.current.reloadAuditLog())
    expect(result.current.auditLog).toHaveLength(2)
    act(() => result.current.clearAuditLog())
    expect(result.current.auditLog).toEqual([])
  })
})


it('consumidor real: ningún commit muestra filas ajenas y el botón conserva nombre y acción accesibles', async () => {
  localStorage.clear()
  clearRateLimitState()
  banUserMock.mockResolvedValue({ success: true })
  const commits = []
  const inspect = vi.fn()
  let current
  function Consumer(props) {
    current = useModeration(props)
    const root = useRef(null)
    useLayoutEffect(() => { commits.push(root.current.textContent) })
    return createElement('div', { ref: root }, createElement(ModActionFeed, { auditLog: current.auditLog, onInspectUser: inspect }))
  }
  const { rerender } = render(createElement(Consumer, { broadcasterId: 'A', userId: 'one' }))
  await act(async () => { await current.ban('u', 'original') })
  fireEvent.click(screen.getByRole('button', { name: '@original' }))
  expect(inspect).toHaveBeenCalledWith({ username: 'original', userId: 'u' })
  for (const props of [
    { broadcasterId: 'B', userId: 'one' },
    { broadcasterId: 'A', userId: 'two' },
    { broadcasterId: 'A', userId: null },
  ]) {
    commits.length = 0
    rerender(createElement(Consumer, props))
    expect(commits.length).toBeGreaterThan(0)
    expect(commits.every(text => !text.includes('@original'))).toBe(true)
    expect(screen.queryByRole('button', { name: '@original' })).toBeNull()
    rerender(createElement(Consumer, { broadcasterId: 'A', userId: 'one' }))
  }
})

it('lectura sana y escritura bloqueada conserva acciones repetidas, clear/reload y recuperación', async () => {
  localStorage.clear()
  clearRateLimitState()
  banUserMock.mockResolvedValue({ success: true })
  const key = 'bs.modAudit.v2.one.A'
  localStorage.setItem(key, JSON.stringify([{ id: 'old', timestamp: 1, action: 'ban', targetName: 'old' }]))
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota') })
  const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw Error('blocked') })
  const a = renderHook(() => useModeration({ broadcasterId: 'A', userId: 'one' }))
  const b = renderHook(() => useModeration({ broadcasterId: 'A', userId: 'one' }))
  await act(async () => { await a.result.current.ban('u', 'first'); await b.result.current.ban('v', 'second') })
  act(() => a.result.current.reloadAuditLog())
  expect(a.result.current.auditLog.map(r => r.targetName)).toEqual(['old', 'first', 'second'])
  expect(b.result.current.auditLog).toEqual(a.result.current.auditLog)
  write.mockRestore()
  await act(async () => { await b.result.current.ban('w', 'recovered') })
  expect(JSON.parse(localStorage.getItem(key)).map(r => r.targetName)).toEqual(['old', 'first', 'second', 'recovered'])
  act(() => a.result.current.clearAuditLog())
  act(() => b.result.current.reloadAuditLog())
  expect(b.result.current.auditLog).toEqual([])
  remove.mockRestore()
  await act(async () => { await b.result.current.ban('x', 'after-clear') })
  expect(JSON.parse(localStorage.getItem(key)).map(r => r.targetName)).toEqual(['after-clear'])
  a.unmount()
  b.unmount()
  const remounted = renderHook(() => useModeration({ broadcasterId: 'A', userId: 'one' }))
  expect(remounted.result.current.auditLog.map(r => r.targetName)).toEqual(['after-clear'])
})

it('los puntos en las identidades no comparten clave entre ámbitos', async () => {
  localStorage.clear()
  clearRateLimitState()
  banUserMock.mockResolvedValue({ success: true })
  const a = renderHook(() => useModeration({ broadcasterId: 'c', userId: 'a.b' }))
  const b = renderHook(() => useModeration({ broadcasterId: 'b.c', userId: 'a' }))
  await act(async () => { await a.result.current.ban('u', 'first'); await b.result.current.ban('v', 'second') })
  expect(a.result.current.auditLog.map(r => r.targetName)).toEqual(['first'])
  expect(b.result.current.auditLog.map(r => r.targetName)).toEqual(['second'])
  expect(JSON.parse(localStorage.getItem('bs.modAudit.v2.a%2Eb.c'))[0].targetName).toBe('first')
  expect(JSON.parse(localStorage.getItem('bs.modAudit.v2.a.b%2Ec'))[0].targetName).toBe('second')
})

it('sin mutación pendiente combina disco fresco y libera el fallback al desmontar', async () => {
  localStorage.clear()
  clearRateLimitState()
  banUserMock.mockResolvedValue({ success: true })
  const key = 'bs.modAudit.v2.one.A'
  const mounted = renderHook(() => useModeration({ broadcasterId: 'A', userId: 'one' }))
  await act(async () => { await mounted.result.current.ban('u', 'first') })
  const rows = JSON.parse(localStorage.getItem(key))
  localStorage.setItem(key, JSON.stringify([...rows, { id: 'external', timestamp: 1, action: 'ban', targetName: 'external' }]))
  await act(async () => { await mounted.result.current.ban('v', 'second') })
  expect(mounted.result.current.auditLog.map(r => r.targetName)).toEqual(['first', 'external', 'second'])
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota') })
  await act(async () => { await mounted.result.current.ban('w', 'memory-only') })
  mounted.unmount()
  write.mockRestore()
  const remounted = renderHook(() => useModeration({ broadcasterId: 'A', userId: 'one' }))
  expect(remounted.result.current.auditLog.map(r => r.targetName)).toEqual(['first', 'external', 'second'])
})
