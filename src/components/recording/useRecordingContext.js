

import { useContext } from 'react'
import { RecordingContext } from './recordingContextValue'

export function useRecordingContext() {
  const ctx = useContext(RecordingContext)
  if (ctx === null) {
    throw new Error(
      'useRecordingContext debe usarse dentro de <RecordingProvider>. ' +
      'Verifica que App.jsx envuelve la seccion de UI correspondiente.'
    )
  }
  return ctx
}
