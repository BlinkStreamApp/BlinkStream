import { useEffect, useRef } from 'react'
import { isDomElementVisible } from '../utils/keyboard'

const activeDialogs = []
const controlsIn = dialog => [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]')]
  .filter(control => !control.disabled && control.tabIndex >= 0 && isDomElementVisible(control))

// React dialogs only: native Twitch webviews retain their own keyboard lifecycle.
export function useDialogFocus(dialogRef, initialFocusRef, onClose) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const opener = document.activeElement
    activeDialogs.push(dialog)
    const focusInitial = () => (initialFocusRef?.current || controlsIn(dialog)[0] || dialog).focus({ preventScroll: true })
    focusInitial()
    const isTop = () => activeDialogs.at(-1) === dialog
    const handleKey = event => {
      if (!isTop() || event.defaultPrevented) return
      const owner = document.activeElement?.closest('[role="dialog"], [role="alertdialog"]')
      if (owner && owner !== dialog) return
      if (event.key === 'Escape' || event.code === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current?.()
      } else if (event.key === 'Tab') {
        const controls = controlsIn(dialog)
        const first = controls[0] || dialog
        const last = controls.at(-1) || dialog
        const focused = document.activeElement
        if (!dialog.contains(focused) || !controls.length || (event.shiftKey && focused === first) || (!event.shiftKey && focused === last)) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus({ preventScroll: true })
        }
      }
    }
    const handleFocus = event => {
      if (!isTop() || dialog.contains(event.target)) return
      if (event.target.closest?.('[role="dialog"], [role="alertdialog"]')) return
      focusInitial()
    }
    document.addEventListener('keydown', handleKey, true)
    document.addEventListener('focusin', handleFocus)
    return () => {
      const wasTop = isTop()
      const index = activeDialogs.indexOf(dialog)
      if (index >= 0) activeDialogs.splice(index, 1)
      document.removeEventListener('keydown', handleKey, true)
      document.removeEventListener('focusin', handleFocus)
      if (wasTop && opener?.isConnected && isDomElementVisible(opener)) opener.focus({ preventScroll: true })
    }
  }, [dialogRef, initialFocusRef])
}
