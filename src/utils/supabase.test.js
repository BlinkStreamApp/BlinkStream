// Tests para los helpers de token de Supabase (F-1 fix).
// - getBlinkstreamToken: lectura sync con expiracion.
// - clearBlinkstreamToken: limpia los 4 keys de localStorage + dispara
//   el clear async del keychain (fire-and-forget).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getBlinkstreamToken,
  clearBlinkstreamToken,
  LS_BLINKSTREAM_JWT,
  LS_BLINKSTREAM_REFRESH,
  LS_BLINKSTREAM_EXPIRES,
  LS_BLINKSTREAM_USER_ID,
} from './supabase'

// Mock de Tauri: invoke devuelve null (keychain vacio) por defecto.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null),
}))

describe('getBlinkstreamToken', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('devuelve null si no hay token guardado', () => {
    expect(getBlinkstreamToken()).toBeNull()
  })

  it('devuelve el JWT si esta vigente (expira en +1h)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.fake.jwt'
    const futureMs = Date.now() + 60 * 60 * 1000 // +1 hora
    localStorage.setItem(LS_BLINKSTREAM_JWT, jwt)
    localStorage.setItem(LS_BLINKSTREAM_EXPIRES, String(futureMs))
    expect(getBlinkstreamToken()).toBe(jwt)
  })

  it('devuelve null si el token ya expiro (mas alla del margen de 60s)', () => {
    localStorage.setItem(LS_BLINKSTREAM_JWT, 'expired.jwt')
    // expiro hace 5 minutos: claramente fuera del margen
    localStorage.setItem(LS_BLINKSTREAM_EXPIRES, String(Date.now() - 5 * 60 * 1000))
    expect(getBlinkstreamToken()).toBeNull()
  })

  it('devuelve null si el token expira en < 60s (margen de seguridad)', () => {
    // expira en 30s: dentro del margen, lo damos por vencido para evitar
    // carreras con el servidor (F-1).
    localStorage.setItem(LS_BLINKSTREAM_JWT, 'about_to_expire.jwt')
    localStorage.setItem(LS_BLINKSTREAM_EXPIRES, String(Date.now() + 30 * 1000))
    expect(getBlinkstreamToken()).toBeNull()
  })
})

describe('clearBlinkstreamToken', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('limpia los 4 keys de localStorage', () => {
    localStorage.setItem(LS_BLINKSTREAM_JWT, 'j')
    localStorage.setItem(LS_BLINKSTREAM_REFRESH, 'r')
    localStorage.setItem(LS_BLINKSTREAM_EXPIRES, '0')
    localStorage.setItem(LS_BLINKSTREAM_USER_ID, 'u')

    clearBlinkstreamToken()

    expect(localStorage.getItem(LS_BLINKSTREAM_JWT)).toBeNull()
    expect(localStorage.getItem(LS_BLINKSTREAM_REFRESH)).toBeNull()
    expect(localStorage.getItem(LS_BLINKSTREAM_EXPIRES)).toBeNull()
    expect(localStorage.getItem(LS_BLINKSTREAM_USER_ID)).toBeNull()
  })

  it('dispara clear async del keychain (no espera, no rompe)', async () => {
    // El invoke mock devuelve null sin lanzar. Solo verificamos que
    // clearBlinkstreamToken no lanza y devuelve undefined.
    expect(() => clearBlinkstreamToken()).not.toThrow()
    // Damos un microtask para que el .catch() interno se asiente.
    await new Promise(r => setTimeout(r, 0))
  })
})
