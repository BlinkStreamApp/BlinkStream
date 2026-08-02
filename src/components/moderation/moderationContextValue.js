/**
 * @file Objeto React Context para el sistema de moderacion.
 * Separado del Provider para satisfacer la regla ESLint
 * `react-refresh/only-export-components` (FIX P1-4b en la linea
 * del RecordingContext del proyecto).
 *
 * WT-20260628-56: cualquier consumidor que quiera `openAction` /
 * `closeAction` / `executeAction` usa `useModerationDialog` o
 * `useModerationDialogSafe`. El Provider vive en
 * `ModerationContext.jsx` para mantener el JSX aislado.
 *
 * Si no se provee Provider, `useModerationDialog` lanza error
 * (fail-fast) y `useModerationDialogSafe` devuelve null
 * (tolerante, util en tests).
 */
import { createContext, useContext } from 'react'

export const ModerationContext = createContext(null)

/**
 * Hook estricto: lanza si se usa fuera del Provider.
 */
export function useModerationDialog() {
  const ctx = useContext(ModerationContext)
  if (!ctx) {
    throw new Error('useModerationDialog debe usarse dentro de <ModerationProvider>')
  }
  return ctx
}

/**
 * Hook tolerante: devuelve null si no hay Provider. Pensado para
 * componentes que PUEDEN vivir fuera del Provider (p.ej. Chat
 * lazy en tests aislados) y que aun asi quieren mostrar el menu
 * contextual sin acciones de mod.
 */
export function useModerationDialogSafe() {
  return useContext(ModerationContext)
}

export default ModerationContext
