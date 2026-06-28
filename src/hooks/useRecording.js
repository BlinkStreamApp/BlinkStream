// ============================================================
// useRecording.js — Hook para gestionar grabacion single-channel (G1 / WT-20260628-16)
// ============================================================
// Extrae la logica de grabacion que vivia inline en VideoPlayer.jsx
// (estado, cleanup, manejo de errores). El hook es el "single source
// of truth" del estado de grabacion; el componente solo lo consume.
//
// API:
//   - isRecording:    boolean
//   - outputPath:     string | null  (donde se escribe el .ts/.mp4)
//   - error:          string | null  (ultimo error user-friendly)
//   - startRecording(channel, suggestedPath?): Promise<void>
//       Abre dialogo de save (si no se pasa path) y llama al backend.
//   - stopRecording(): Promise<void>
//       Mata el proceso streamlink en el backend.
//   - Cleanup automatico en unmount: si isRecording, fire-and-forget stop.
//
// Limites del MVP (G1): single recording a la vez. Si el usuario
// intenta iniciar otra mientras hay una activa, devuelve error.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { measureInvoke } from '../utils/perf'
import { logError, formatUserMessage, ErrorCode } from '../utils/errors'
import { logEvent } from '../utils/eventLog'

/**
 * Hook de grabacion. Maneja el ciclo start/stop, errores y cleanup.
 *
 * @returns {{
 *   isRecording: boolean,
 *   outputPath: string|null,
 *   error: string|null,
 *   startRecording: (channel: string, suggestedPath?: string) => Promise<void>,
 *   stopRecording: () => Promise<void>,
 * }}
 */
export function useRecording() {
  const [isRecording, setIsRecording] = useState(false)
  const [outputPath, setOutputPath] = useState(null)
  const [error, setError] = useState(null)
  // Ref espejo del flag de grabacion para que el cleanup (que se ejecuta
  // cuando React desmonta el componente) lea el valor actual sin
  // re-suscribirse al state. Patron: ref de respaldo para cleanup
  // paths (B-1 / B-4 del VideoPlayer original).
  const isRecordingRef = useRef(false)
  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])

  // Reset state al desmontar (el cleanup del backend va aparte abajo).
  useEffect(() => {
    return () => {
      // No tocamos isRecording/outputPath aqui: eso seria liar
      // desmontaje con estado. El cleanup real es el de abajo.
    }
  }, [])

  // Cleanup en unmount: si esta grabando, fire-and-forget stop_recording
  // para no dejar el proceso streamlink huerfano (B-4 del VideoPlayer
  // original). Fire-and-forget para no bloquear el unmount de React.
  useEffect(() => {
    return () => {
      if (isRecordingRef.current) {
        logEvent('recording', 'cleanup.on_unmount', null)
        // No await: es cleanup, el usuario ya esta saliendo.
        // Si falla, el backend eventualmente matara el child
        // cuando el proceso principal muera.
        // Defensivo: si measureInvoke no devuelve una Promise (p.ej.
        // porque se mockeo con mockReturnValue(undefined) en tests),
        // no rompemos el cleanup.
        const maybePromise = measureInvoke('stop_recording')
        if (maybePromise && typeof maybePromise.catch === 'function') {
          maybePromise.catch((err) => {
            const msg = typeof err === 'string' ? err : err?.message || String(err)
            // "No hay grabacion activa" = ya estaba cerrada por otra via.
            // Lo tratamos como OK silencioso.
            if (!/no hay grabaci[oó]n activa/i.test(msg)) {
              logError(err, {
                component: 'useRecording',
                action: 'cleanup_stop',
                code: ErrorCode.RECORDING_FAILED,
              })
            }
          })
        }
      }
    }
  }, [])

  const startRecording = useCallback(async (channel, suggestedPath) => {
    if (!channel) {
      const msg = 'No hay canal para grabar'
      setError(msg)
      logEvent('recording', 'start.failed', { reason: 'no_channel' })
      return
    }
    if (isRecordingRef.current) {
      const msg = 'Ya hay una grabacion activa'
      setError(msg)
      logEvent('recording', 'start.failed', { reason: 'already_recording' })
      return
    }
    setError(null)

    // Si no nos pasan ruta sugerida, abrimos el dialogo de save.
    // Esto replica la UX del VideoPlayer original.
    let path = suggestedPath
    if (!path) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        path = await save({
          defaultPath: `${channel}_${Date.now()}.ts`,
          filters: [{ name: 'Video', extensions: ['ts', 'mp4'] }],
        })
      } catch (e) {
        const msg = typeof e === 'string' ? e : e?.message || String(e)
        logError(e, { component: 'useRecording', action: 'save_dialog' })
        setError(`No se pudo abrir el dialogo: ${msg}`)
        logEvent('recording', 'start.failed', { reason: 'dialog_error', err: msg })
        return
      }
    }

    if (!path) {
      // Usuario cancelo el dialogo. Silencioso.
      logEvent('recording', 'start.cancelled', { channel })
      return
    }

    try {
      await measureInvoke('start_recording', { channel, outputPath: path })
      setIsRecording(true)
      isRecordingRef.current = true
      setOutputPath(path)
      logEvent('recording', 'recording.started', { channel, path })
    } catch (err) {
      logError(err, {
        component: 'useRecording',
        action: 'start_recording',
        code: ErrorCode.RECORDING_FAILED,
      })
      const userMsg = formatUserMessage(err) || 'No se pudo iniciar la grabacion.'
      setError(userMsg)
      logEvent('recording', 'recording.start.failed', { channel, err: err?.message || String(err) })
    }
  }, [])

  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) {
      // Ya estaba parada. No es error: idempotente.
      return
    }
    // Bajamos el ref ANTES del await para que un re-entrant (poco
    // probable pero posible si React dispara cleanup dos veces en
    // dev) no intente detener dos veces el mismo proceso.
    isRecordingRef.current = false
    setIsRecording(false)
    setOutputPath(null)
    setError(null)

    try {
      await measureInvoke('stop_recording')
      logEvent('recording', 'recording.stopped', null)
    } catch (err) {
      const msg = typeof err === 'string' ? err : err?.message || String(err)
      // "No hay grabacion activa" = ya estaba cerrada por otra via.
      // Lo tratamos como OK silencioso.
      if (/no hay grabaci[oó]n activa/i.test(msg)) {
        return
      }
      logError(err, {
        component: 'useRecording',
        action: 'stop_recording',
        code: ErrorCode.RECORDING_FAILED,
      })
      const userMsg = formatUserMessage(err) || 'No se pudo detener la grabacion.'
      setError(userMsg)
      logEvent('recording', 'recording.stop.failed', { err: msg })
    }
  }, [])

  return {
    isRecording,
    outputPath,
    error,
    startRecording,
    stopRecording,
  }
}
