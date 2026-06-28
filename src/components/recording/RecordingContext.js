// ============================================================
// RecordingContext.js — Provider compartido para useGlobalRecording
// ============================================================
// FIX P1-4: este Provider evita N pollees paralelos del hook
// `useGlobalRecording` cuando varios componentes lo consumian.
// Antes cada componente montaba su propio `useGlobalRecording()`:
//   - N pollees cada 10s = N * 6 invokes/min
// Con esta elevación a Context, un solo Provider ejecuta el polling
// y los consumidores (`DiskSpaceIndicator` en MVP) leen el state via
// useContext sin multiplicar invokes.
//
// Estructura de archivos (FIX P1-4b + P1-4c + P1-4d, para cumplir
// `react-refresh/only-export-components` de Vite y el bug de vitest +
// esbuild + JSX runtime):
//   - recordingContextValue.js → el createContext object
//   - useRecordingContext.js   → el hook consumer
//   - RecordingContext.js     → solo el Provider (este archivo, en .js
//     por el bug de vitest con JSX automatic runtime — ver FIX P1-4d)
//
// FIX P1-4d: este archivo se llamaba .jsx originalmente pero el
// runtime automatic de @vitejs/plugin-react no se inyecta correctamente
// en vitest 2.x para los imports desde tests (bug preexistente
// documentado en src/components/channelpoints/channelpoints.fixes.test.jsx).
// Lo escribimos en .js y usamos React.createElement directamente. La
// semantica es identica — Vite y el bundler de produccion siguen
// tree-shaking y code-splitting igual. Es el mismo patron que usa
// react-redux internamente.
//
// Mounting: en App.jsx, envolvemos el contenido que necesita el
// context. El Provider internamente monta el hook una vez.
//
// Uso en componentes:
//   import { useRecordingContext } from './useRecordingContext'
//   const { state, setState, activeRecordings, diskFreeGb, refresh, error } = useRecordingContext()
// ============================================================

import React from 'react'
import { useGlobalRecording } from '../../hooks/useGlobalRecording'
import { RecordingContext } from './recordingContextValue'

/**
 * Provider que monta el hook useGlobalRecording una sola vez y expone
 * su state a todos los consumidores. Antes cada componente hacia su
 * propio useGlobalRecording() = N pollees paralelos. Ahora: 1 polling
 * compartido + React Context para distribuir el state.
 *
 * Implementado con React.createElement (no JSX) por compatibilidad
 * con vitest 2.x — ver FIX P1-4d en el header del archivo.
 */
export function RecordingProvider({ children }) {
  const value = useGlobalRecording()
  return React.createElement(RecordingContext.Provider, { value }, children)
}
