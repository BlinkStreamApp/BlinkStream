// Tests de regresion para la auditoria P1 de Hank (WT-20260628-26).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import DebugPanel from '../components/DebugPanel'
import { logEvent, clearEventLog, getEventLog } from '../utils/eventLog'
import { secureRandomInt } from '../utils/twitch'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const readSrc = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// ============================================================
// FIX 1 (Hank / P1): tests de regresion para secureRandomInt.
// CWE-330: Use of Insufficiently Random Values.
// ============================================================
describe('FIX 1: secureRandomInt', () => {
  it('devuelve un entero en [0, max)', () => {
    for (let i = 0; i < 100; i++) {
      const n = secureRandomInt(1e7)
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1e7)
    }
  })

  it('lanza RangeError si max no es positivo finito', () => {
    expect(() => secureRandomInt(0)).toThrow(RangeError)
    expect(() => secureRandomInt(-1)).toThrow(RangeError)
    expect(() => secureRandomInt(NaN)).toThrow(RangeError)
    expect(() => secureRandomInt(Infinity)).toThrow(RangeError)
    expect(() => secureRandomInt('not a number')).toThrow(RangeError)
  })

  it('produce valores distintos en llamadas consecutivas', () => {
    const values = new Set()
    for (let i = 0; i < 100; i++) values.add(secureRandomInt(1e9))
    expect(values.size).toBeGreaterThan(95)
  })

  it('el helper esta exportado y usa crypto.getRandomValues', () => {
    const src = readSrc('../utils/twitch.js')
    expect(src).toContain('export function secureRandomInt')
    expect(src).toContain('crypto.getRandomValues')
  })

  it('getDirectStreamUrl ya no usa Math.random para cache-busting', () => {
    const src = readSrc('../utils/twitch.js')
    expect(src).toContain('p: String(secureRandomInt(1e7))')
    expect(src).not.toContain("p: String(Math.floor(Math.random() * 1e7))")
  })
})

// ============================================================
// FIX 2 (Hank / P1): abrir URLs externas con noopener,noreferrer
// ============================================================
// WT-20260628-134: refactor. Antes se validaba que useAuth.js tuviera
// `window.open(url, '_blank', 'noopener,noreferrer')`. Ahora la politica
// es MAS estricta: NINGUN archivo debe llamar `window.open(` directo
// (pre-build hook lo bloquea, CWE-1022 anti-tabnabbing). Toda apertura
// externa pasa por el helper `safeOpenUrl` en utils/tauriEnv, que
// garantiza noopener,noreferrer en el path web y usa plugin-opener en
// Tauri. El test verifica ambas cosas:
//   1) safeOpenUrl esta exportado desde utils/tauriEnv
//   2) useAuth.js usa safeOpenUrl en vez de window.open
//   3) El helper incluye la flag 'noopener,noreferrer'
// ============================================================
describe('FIX 2: abrir URLs externas con noopener,noreferrer', () => {
  it('utils/tauriEnv exporta el helper safeOpenUrl', () => {
    const src = readSrc('../utils/tauriEnv.js')
    expect(src).toContain('export function safeOpenUrl')
    expect(src).toContain("'noopener,noreferrer'")
  })

  it('useAuth.js NO usa window.open directo (debe usar safeOpenUrl)', () => {
    const src = readSrc('../hooks/useAuth.js')
    expect(src).not.toMatch(/window\.open\(/)
    expect(src).toContain('safeOpenUrl')
  })

  it('useAuth.js importa safeOpenUrl desde tauriEnv', () => {
    const src = readSrc('../hooks/useAuth.js')
    expect(src).toMatch(/safeOpenUrl.*tauriEnv|tauriEnv.*safeOpenUrl/)
  })
})

// ============================================================
// FIX 3 (Hank / P1): console.log de PII gateado a DEV
// ============================================================
describe('FIX 3: console.log de PII gateado a DEV', () => {
  it('Chat.jsx declara un guard DEV para el log de Client-ID', () => {
    const src = readSrc('../components/Chat.jsx')
    // El comentario FIX 3 y el log de Client-ID estan bajo el mismo guard
    const idx1 = src.indexOf("'[Auth] Solicitando device code con Client-ID:'")
    expect(idx1).toBeGreaterThan(-1)
    // Miramos 600 chars hacia atras para encontrar el guard
    const ctx = src.substring(Math.max(0, idx1 - 600), idx1)
    expect(ctx).toContain('import.meta.env.DEV')
  })

  it('Chat.jsx declara un guard DEV para el log de user_code', () => {
    const src = readSrc('../components/Chat.jsx')
    const idx = src.indexOf("'[Auth] Device code obtenido.")
    expect(idx).toBeGreaterThan(-1)
    const ctx = src.substring(Math.max(0, idx - 600), idx)
    expect(ctx).toContain('import.meta.env.DEV')
  })
})

// ============================================================
// FIX 4 (Hank / P1): App Access Token en memoria, no localStorage
// ============================================================
describe('FIX 4: App Access Token en memoria, no localStorage', () => {
  it('twitch.js no contiene la key "bs_app_token_cache"', () => {
    const src = readSrc('../utils/twitch.js')
    expect(src).not.toContain('bs_app_token_cache')
    expect(src).not.toContain('APP_TOKEN_CACHE_KEY')
  })

  it('twitch.js usa variable de modulo _appTokenCache', () => {
    const src = readSrc('../utils/twitch.js')
    expect(src).toContain('let _appTokenCache = null')
    expect(src).toContain('_appTokenCache = { token, expiresAt }')
  })

  it('_readAppTokenCache retorna la variable de modulo', () => {
    const src = readSrc('../utils/twitch.js')
    expect(src).toContain('function _readAppTokenCache()')
    expect(src).toContain('return _appTokenCache')
  })
})

// ============================================================
// FIX 5 (Hank / P1): eventLog console.log gateado a DEV/error
// ============================================================
describe('FIX 5: eventLog console.log gateado a DEV/error', () => {
  beforeEach(() => {
    localStorage.clear()
    clearEventLog()
    vi.restoreAllMocks()
  })

  it('loguea en DEV por defecto (test env)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logEvent('auth', 'login.attempt', { username: 'tester' })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('el ring buffer sigue funcionando con el gating', () => {
    clearEventLog()
    const before = getEventLog().length
    logEvent('auth', 'event.a')
    logEvent('chat', 'event.b')
    logEvent('error', 'event.c')
    const after = getEventLog()
    expect(after.length).toBe(before + 3)
    expect(after.map(e => e.message)).toEqual(['event.a', 'event.b', 'event.c'])
  })

  it('eventLog.js declara guard DEV o whitelist de categoria error', () => {
    const src = readSrc('../utils/eventLog.js')
    expect(src).toContain('import.meta.env.DEV')
    expect(src).toContain("category === 'error'")
  })
})

// ============================================================
// FIX 6 (Hank / P1): DebugPanel tree-shakeable via DEV guard
// ============================================================
describe('FIX 6: DebugPanel tree-shakeable via DEV guard', () => {
  it('el modulo declara wrapper con guard DEV', () => {
    const src = readSrc('../components/DebugPanel.jsx')
    expect(src).toContain('DebugPanelImpl')
    expect(src).toContain('import.meta.env.DEV')
    expect(src).toContain('return null')
    expect(src).toContain('return DebugPanelImpl()')
  })

  it('el wrapper retorna null cuando no estamos en DEV', () => {
    // En Vitest import.meta.env.DEV es true por defecto. Para simular
    // produccion sin tocar el global (readonly en algunos bundlers),
    // testeamos via fs que el wrapper existe y tiene la rama null.
    const src = readSrc('../components/DebugPanel.jsx')
    // El wrapper debe tener la forma: if (!import.meta.env.DEV) return null
    expect(src).toMatch(/if \(!import\.meta\.env\.DEV\)[\s\S]*?return null/)
  })
})