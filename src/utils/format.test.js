

import { describe, it, expect } from 'vitest'
import { formatViewers, formatDuration, formatDurationHMS, adjustColorContrast } from './format'

describe('formatViewers', () => {
  it('formatea miles con un decimal + sufijo k', () => {
    expect(formatViewers(1234)).toBe('1.2k')
  })

  it('devuelve el string "0" para cero viewers', () => {
    expect(formatViewers(0)).toBe('0')
  })

  it('formatea millones con sufijo M (deuda tecnica resuelven en v1.0.4)', () => {
    expect(formatViewers(1500000)).toBe('1.5M')
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

  it('formatea 3661s como 1:01:01 (segmento de horas con padding)', () => {
    expect(formatDuration(3661)).toBe('1:01:01')
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

describe('adjustColorContrast', () => {
  it('deja intacto un color claro o con suficiente luminiscencia', () => {
    expect(adjustColorContrast('#a78bfa')).toBe('#a78bfa')
  })

  it('aclara un color excesivamente oscuro (#000033) para garantizar legibilidad WCAG AAA', () => {
    const res = adjustColorContrast('#000033')
    expect(res).not.toBe('#000033')
    expect(res).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('devuelve el color de fallback para valores nulos o vacíos', () => {
    expect(adjustColorContrast(null)).toBe('#adadb8')
    expect(adjustColorContrast('')).toBe('#adadb8')
    expect(adjustColorContrast('red')).toBe('red')
  })
})
