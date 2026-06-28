// ============================================================
// useRecordingContext.js — Hook consumer del RecordingContext
// ============================================================
// FIX P1-4: separado del archivo del Provider para cumplir la regla
// `react-refresh/only-export-components`. El Provider vive en
// RecordingContext.jsx (solo exporta un componente) y el hook vive
// aqui (solo exporta un hook). Fast refresh de Vite necesita esa
// separación para poder hot-reloadear cada pieza por separado.
// ============================================================

import { useContext } from 'react'
import { RecordingContext } from './recordingContextValue'

/**
 * Hook para acceder al state de grabacion global desde cualquier
 * componente dentro del RecordingProvider. Lanza un error claro si se
 * usa fuera del provider (asi no fallamos silenciosamente en prod).
 */
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
