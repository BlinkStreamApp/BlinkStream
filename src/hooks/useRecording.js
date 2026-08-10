

import { useState, useEffect, useRef, useCallback } from 'react'
import { measureInvoke } from '../utils/perf'
import { logError, formatUserMessage, ErrorCode } from '../utils/errors'
import { logEvent } from '../utils/eventLog'

export function useRecording() {
  const [isRecording, setIsRecording] = useState(false)
  const [outputPath, setOutputPath] = useState(null)
  const [error, setError] = useState(null)

  const isRecordingRef = useRef(false)
  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])

  useEffect(() => {
    return () => {

    }
  }, [])

  useEffect(() => {
    return () => {
      if (isRecordingRef.current) {
        logEvent('recording', 'cleanup.on_unmount', null)

        const maybePromise = measureInvoke('stop_recording')
        if (maybePromise && typeof maybePromise.catch === 'function') {
          maybePromise.catch((err) => {
            const msg = typeof err === 'string' ? err : err?.message || String(err)

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

    let path = suggestedPath
    if (!path) {
      try {
        const recFormat = (() => { try { return localStorage.getItem('blinkstream_rec_format') || 'mp4' } catch { return 'mp4' } })()
        const recPath = (() => { try { return localStorage.getItem('blinkstream_rec_path') || '' } catch { return '' } })()
        const fileName = `${channel}_${new Date().toISOString().replace(/[:.]/g, '-')}.${recFormat}`
        const fullDefault = recPath ? `${recPath}\\${fileName}` : fileName

        const { save } = await import('@tauri-apps/plugin-dialog')
        path = await save({
          defaultPath: fullDefault,
          filters: [{ name: 'Video', extensions: [recFormat, 'mp4', 'ts'].filter((v, i, a) => a.indexOf(v) === i) }],
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

      return
    }

    isRecordingRef.current = false
    setIsRecording(false)
    setOutputPath(null)
    setError(null)

    try {
      await measureInvoke('stop_recording')
      logEvent('recording', 'recording.stopped', null)
    } catch (err) {
      const msg = typeof err === 'string' ? err : err?.message || String(err)

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
