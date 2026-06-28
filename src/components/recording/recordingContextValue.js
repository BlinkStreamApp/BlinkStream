// ============================================================
// recordingContextValue.js — El Context object (createContext)
// ============================================================
// FIX P1-4c: separado para que el Provider (`RecordingContext.jsx`)
// pueda exportar SOLO un componente y cumplir la regla de Vite
// `react-refresh/only-export-components`. El hook consumer vive en
// `useRecordingContext.js`.
// ============================================================

import { createContext } from 'react'

/**
 * Context de grabacion global. Valor inicial `null` — el Provider lo
 * rellena con el retorno de useGlobalRecording(). El hook
 * useRecordingContext valida que no sea null y lanza error claro
 * fuera del Provider.
 */
export const RecordingContext = createContext(null)
