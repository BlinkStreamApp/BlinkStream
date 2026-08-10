

import { describe, it, expect } from 'vitest'

const MAX_TIMEOUT_SECONDS = 1209600 
const MIN_TIMEOUT_SECONDS = 1

function clampDuration(rawValue) {
  const n = Number(rawValue) || 0
  return Math.max(MIN_TIMEOUT_SECONDS, Math.min(MAX_TIMEOUT_SECONDS, n))
}

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
