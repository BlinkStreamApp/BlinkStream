
import { createContext, useContext } from 'react'

export const ModerationContext = createContext(null)

export function useModerationDialog() {
  const ctx = useContext(ModerationContext)
  if (!ctx) {
    throw new Error('useModerationDialog debe usarse dentro de <ModerationProvider>')
  }
  return ctx
}

export function useModerationDialogSafe() {
  return useContext(ModerationContext)
}

export default ModerationContext
