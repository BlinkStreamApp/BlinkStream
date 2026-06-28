// Tests de funciones puras de formato.
// Cobertura: formatViewers, formatDuration y formatDurationHMS
// (ver WT-20260628-01 / M-4 y WT-20260628-52 / FIX P1 deduplicacion).
import { describe, it, expect } from 'vitest'
import { formatViewers, formatDuration, formatDurationHMS } from './format'

describe('formatViewers', () => {
  it('formatea miles con un decimal + sufijo k', () => {
    expect(formatViewers(1234)).toBe('1.2k')
  })

  it('devuelve el string "0" para cero viewers', () => {
    expect(formatViewers(0)).toBe('0')
  })

  it('formatea millones con sufijo k (el codigo no tiene rama M, documentamos)', () => {
    // NOTA: formatViewers solo maneja miles (k). No tiene rama para millones.
    // Para 1.5M devuelve "1500.0k" — esto es una limitacion conocida del
    // formatter. La mejora (sufijo M) queda como deuda tecnica.
    expect(formatViewers(1500000)).toBe('1500.0k')
  })

  it('deja numeros pequenos sin sufijo', () => {
    expect(formatViewers(999)).toBe('999')
  })

  it('devuelve null si el input es null/undefined', () => {
    expect(formatViewers(null)).toBeNull()
    expect(formatViewers(undefined)).toBeNull()
  })
})

describe('formatDuration', () => {
  it('formatea 65s como 1:05 (m:ss con padding)', () => {
    expect(formatDuration(65)).toBe('1:05')
  })

  it('formatea 3661s como 61:01 (sin segmento de horas, ver codigo real)', () => {
    // NOTA: la implementacion actual de formatDuration NO maneja horas
    // (devuelve m:ss, no h:mm:ss). Documentamos el comportamiento real
    // y dejamos la mejora como deuda tecnica.
    expect(formatDuration(3661)).toBe('61:01')
  })

  it('formatea 0s como 0:00', () => {
    expect(formatDuration(0)).toBe('0:00')
  })

  it('formatea menos de 1 minuto con padding del segundo', () => {
    expect(formatDuration(9)).toBe('0:09')
  })

  it('devuelve 0:00 para null/undefined', () => {
    expect(formatDuration(null)).toBe('0:00')
    expect(formatDuration(undefined)).toBe('0:00')
  })
})

describe('formatDurationHMS', () => {
  it('formatea 0s como 00:00:00', () => {
    expect(formatDurationHMS(0)).toBe('00:00:00')
  })

  it('formatea 9s como 00:00:09 (padding del segundo)', () => {
    expect(formatDurationHMS(9)).toBe('00:00:09')
  })

  it('formatea 65s como 00:01:05 (padding del minuto)', () => {
    expect(formatDurationHMS(65)).toBe('00:01:05')
  })

  it('formatea 3661s como 01:01:01 (segmento de horas con padding)', () => {
    expect(formatDurationHMS(3661)).toBe('01:01:01')
  })

  it('formatea 36000s como 10:00:00 (decenas de horas)', () => {
    expect(formatDurationHMS(36000)).toBe('10:00:00')
  })

  it('clampa negativos a 00:00:00', () => {
    expect(formatDurationHMS(-5)).toBe('00:00:00')
  })

  it('trata null/undefined como 0', () => {
    expect(formatDurationHMS(null)).toBe('00:00:00')
    expect(formatDurationHMS(undefined)).toBe('00:00:00')
  })
})
