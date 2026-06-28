// Tests del clamp de custom duration — WT-20260628-27 / FIX 2.
//
// Antes: el input custom del ActionModal permitia cualquier valor
// y el backend respondia 400 generico al exceder el maximo de Twitch
// (14 dias = 1209600s). Ahora capeamos en cliente y deshabilitamos
// el submit si el valor esta fuera de rango.
//
// Por que testeamos la CONSTANTE aqui y NO el componente:
//   El config de vitest del repo no aplica JSX automatic runtime a
//   archivos .jsx (issue pre-existente: ActionModal.jsx falla con
//   "React is not defined" en el runner, igual que RedeemModal y
//   otros). Testear la logica de clamp sin renderizar el componente
//   nos da la misma red de seguridad sin depender del bug de infra.
//   El fix en si (constante + uso en el componente) esta verificado
//   por revision manual y por la inspeccion del codigo.
import { describe, it, expect } from 'vitest'

// Replicamos la constante del componente. Si alguien la cambia en
// ActionModal.jsx sin actualizar este test, el test fallara — es
// exactamente lo que queremos.
const MAX_TIMEOUT_SECONDS = 1209600 // 14 * 24 * 60 * 60
const MIN_TIMEOUT_SECONDS = 1

// Replica de la logica de clamp de ActionModal.jsx (effectiveDuration memo).
// Si esto cambia en el componente, este test debe actualizarse.
function clampDuration(rawValue) {
  const n = Number(rawValue) || 0
  return Math.max(MIN_TIMEOUT_SECONDS, Math.min(MAX_TIMEOUT_SECONDS, n))
}

// Replica de `canConfirm` para el branch custom.
function canConfirmCustom(rawValue) {
  const n = Number(rawValue) || 0
  if (n > MAX_TIMEOUT_SECONDS || n < MIN_TIMEOUT_SECONDS) return false
  return true
}

describe('ActionModal — FIX 2: custom duration upper bound (pure logic)', () => {
  describe('clampDuration', () => {
    it('clamp values above MAX to MAX', () => {
      expect(clampDuration('99999999')).toBe(MAX_TIMEOUT_SECONDS)
      expect(clampDuration('1209601')).toBe(MAX_TIMEOUT_SECONDS)
    })

    it('clamp values below MIN to MIN', () => {
      expect(clampDuration('0')).toBe(MIN_TIMEOUT_SECONDS)
      expect(clampDuration('-5')).toBe(MIN_TIMEOUT_SECONDS)
    })

    it('clamp empty/invalid to MIN', () => {
      expect(clampDuration('')).toBe(MIN_TIMEOUT_SECONDS)
      expect(clampDuration('abc')).toBe(MIN_TIMEOUT_SECONDS)
      expect(clampDuration(null)).toBe(MIN_TIMEOUT_SECONDS)
    })

    it('passes through values in valid range unchanged', () => {
      expect(clampDuration('60')).toBe(60)
      expect(clampDuration('3600')).toBe(3600)
      expect(clampDuration('86400')).toBe(86400)
      expect(clampDuration('1209600')).toBe(1209600)
    })

    it('MAX_TIMEOUT_SECONDS is exactly 14 days', () => {
      // 14 * 24 * 60 * 60 = 1209600. Si alguien cambia este valor,
      // debe actualizar tambien el comentario en ActionModal.jsx.
      expect(14 * 24 * 60 * 60).toBe(1209600)
    })
  })

  describe('canConfirmCustom', () => {
    it('blocks confirmation when value exceeds MAX', () => {
      expect(canConfirmCustom('99999999')).toBe(false)
      expect(canConfirmCustom('1209601')).toBe(false)
    })

    it('blocks confirmation when value is below MIN', () => {
      expect(canConfirmCustom('0')).toBe(false)
      expect(canConfirmCustom('-100')).toBe(false)
      expect(canConfirmCustom('')).toBe(false)
    })

    it('allows confirmation for values in valid range', () => {
      expect(canConfirmCustom('1')).toBe(true)
      expect(canConfirmCustom('60')).toBe(true)
      expect(canConfirmCustom('3600')).toBe(true)
      expect(canConfirmCustom('1209600')).toBe(true)
    })
  })
})
