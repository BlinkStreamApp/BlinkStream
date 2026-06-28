// Tests del hook useRecording (G1 / WT-20260628-16).
// Mockeamos measureInvoke (perf.js) y el dialogo save de Tauri.
// Validamos: estado inicial, start con dialogo cancelado, start OK,
// start con error, stop OK, stop con "no hay grabacion activa"
// (idempotente), cleanup al desmontar.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Mock del modulo de performance para capturar measureInvoke
const measureInvokeMock = vi.fn()
vi.mock('../utils/perf', () => ({
  measureInvoke: (...args) => measureInvokeMock(...args),
}))

// Mock del dialog save de Tauri (plugin-dialog)
const saveMock = vi.fn()
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: (...args) => saveMock(...args),
}))

const { useRecording } = await import('./useRecording')

describe('useRecording', () => {
  beforeEach(() => {
    localStorage.clear()
    measureInvokeMock.mockReset()
    saveMock.mockReset()
    // Default: backend OK para start_recording/stop_recording.
    // Tests que quieran fallar usan mockRejectedValueOnce.
    measureInvokeMock.mockResolvedValue('OK')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('estado inicial: isRecording=false, outputPath=null, error=null', () => {
    const { result } = renderHook(() => useRecording())
    expect(result.current.isRecording).toBe(false)
    expect(result.current.outputPath).toBe(null)
    expect(result.current.error).toBe(null)
  })

  it('startRecording sin channel: setea error y no llama al backend', async () => {
    const { result } = renderHook(() => useRecording())
    await act(async () => {
      await result.current.startRecording('')
    })
    expect(result.current.isRecording).toBe(false)
    expect(result.current.error).toMatch(/canal/i)
    expect(measureInvokeMock).not.toHaveBeenCalled()
  })

  it('startRecording: usuario cancela dialogo → no llama al backend', async () => {
    saveMock.mockResolvedValue(null) // cancel
    const { result } = renderHook(() => useRecording())
    await act(async () => {
      await result.current.startRecording('ninja')
    })
    expect(result.current.isRecording).toBe(false)
    expect(result.current.error).toBe(null)
    expect(saveMock).toHaveBeenCalled()
    expect(measureInvokeMock).not.toHaveBeenCalled()
  })

  it('startRecording happy path: dialog OK + backend OK → isRecording=true', async () => {
    saveMock.mockResolvedValue('/tmp/test.ts')
    measureInvokeMock.mockResolvedValue('Grabando (PID: 123)')
    const { result } = renderHook(() => useRecording())
    await act(async () => {
      await result.current.startRecording('ninja')
    })
    expect(result.current.isRecording).toBe(true)
    expect(result.current.outputPath).toBe('/tmp/test.ts')
    expect(result.current.error).toBe(null)
    expect(measureInvokeMock).toHaveBeenCalledWith('start_recording', {
      channel: 'ninja',
      outputPath: '/tmp/test.ts',
    })
  })

  it('startRecording con suggestedPath: NO abre dialogo, va directo al backend', async () => {
    measureInvokeMock.mockResolvedValue('Grabando (PID: 1)')
    const { result } = renderHook(() => useRecording())
    await act(async () => {
      await result.current.startRecording('shroud', '/Users/x/rec.ts')
    })
    expect(saveMock).not.toHaveBeenCalled()
    expect(measureInvokeMock).toHaveBeenCalledWith('start_recording', {
      channel: 'shroud',
      outputPath: '/Users/x/rec.ts',
    })
    expect(result.current.isRecording).toBe(true)
  })

  it('startRecording backend falla: isRecording=false, error seteado', async () => {
    measureInvokeMock.mockRejectedValue(new Error('streamlink not found'))
    const { result } = renderHook(() => useRecording())
    await act(async () => {
      await result.current.startRecording('ninja', '/tmp/x.ts')
    })
    expect(result.current.isRecording).toBe(false)
    expect(result.current.error).toBeTruthy()
  })

  it('startRecording duplicado (ya grabando): rechaza con error, no llama backend 2 veces', async () => {
    measureInvokeMock.mockResolvedValue('Grabando (PID: 1)')
    const { result } = renderHook(() => useRecording())
    await act(async () => {
      await result.current.startRecording('ninja', '/tmp/a.ts')
    })
    expect(result.current.isRecording).toBe(true)
    // Limpiamos el mock para poder verificar "no se llamo" abajo.
    // Re-establecemos un default para que el cleanup del unmount
    // (que SI va a llamar measureInvoke) reciba una Promise valida.
    measureInvokeMock.mockClear()
    measureInvokeMock.mockResolvedValue('OK')
    await act(async () => {
      await result.current.startRecording('shroud', '/tmp/b.ts')
    })
    expect(measureInvokeMock).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/ya hay/i)
  })

  it('stopRecording happy path: isRecording=false, outputPath=null', async () => {
    measureInvokeMock
      .mockResolvedValueOnce('Grabando (PID: 1)')
      .mockResolvedValueOnce('Grabación detenida')
    const { result } = renderHook(() => useRecording())
    await act(async () => {
      await result.current.startRecording('ninja', '/tmp/a.ts')
    })
    expect(result.current.isRecording).toBe(true)
    await act(async () => {
      await result.current.stopRecording()
    })
    expect(result.current.isRecording).toBe(false)
    expect(result.current.outputPath).toBe(null)
    expect(measureInvokeMock).toHaveBeenCalledWith('stop_recording')
  })

  it('stopRecording idempotente: si no esta grabando, no hace nada', async () => {
    const { result } = renderHook(() => useRecording())
    await act(async () => {
      await result.current.stopRecording()
    })
    expect(measureInvokeMock).not.toHaveBeenCalled()
    expect(result.current.isRecording).toBe(false)
  })

  it('stopRecording backend dice "no hay grabacion activa": no setea error (es OK)', async () => {
    measureInvokeMock
      .mockResolvedValueOnce('Grabando (PID: 1)')
      .mockRejectedValueOnce(new Error('No hay grabación activa'))
    const { result } = renderHook(() => useRecording())
    await act(async () => {
      await result.current.startRecording('ninja', '/tmp/a.ts')
    })
    await act(async () => {
      await result.current.stopRecording()
    })
    expect(result.current.isRecording).toBe(false)
    expect(result.current.error).toBe(null)
  })

  it('cleanup en unmount: si esta grabando, llama stop_recording fire-and-forget', async () => {
    measureInvokeMock
      .mockResolvedValueOnce('Grabando (PID: 1)')
      .mockResolvedValueOnce('Grabación detenida')
    const { result, unmount } = renderHook(() => useRecording())
    await act(async () => {
      await result.current.startRecording('ninja', '/tmp/a.ts')
    })
    measureInvokeMock.mockClear()
    unmount()
    // Esperar un tick para que el cleanup se ejecute
    await waitFor(() => {
      expect(measureInvokeMock).toHaveBeenCalledWith('stop_recording')
    })
  })

  it('cleanup en unmount: si NO esta grabando, no llama stop_recording', async () => {
    const { unmount } = renderHook(() => useRecording())
    measureInvokeMock.mockClear()
    unmount()
    // Esperamos un tick y comprobamos que no se llamo
    await new Promise(r => setTimeout(r, 10))
    expect(measureInvokeMock).not.toHaveBeenCalled()
  })
})
