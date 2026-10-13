import { createPortal } from 'react-dom'
import { useId, useRef } from 'react'
import { useDialogFocus } from '../hooks/useDialogFocus'

export default function ConfirmDialog({ title, message, confirmText = 'Aceptar', cancelText = 'Cancelar', onConfirm, onCancel }) {
  const prefix = useId()
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  useDialogFocus(dialogRef, cancelRef, onCancel)
  return createPortal(
    <div data-modal="true" className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[99999] flex items-center justify-center animate-fade-in" onClick={onCancel}>
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={`${prefix}-title`} aria-describedby={`${prefix}-message`} tabIndex={-1} className="bg-bg-secondary/85 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-[0_12px_40px_rgba(0,0,0,0.6)] transition-all transform animate-scale-up" onClick={e => e.stopPropagation()}>
        <h3 id={`${prefix}-title`} className="text-text-primary font-bold text-base mb-2">{title}</h3>
        <p id={`${prefix}-message`} className="text-text-secondary text-sm mb-5 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="min-h-11 px-4 py-2 rounded-xl text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-hover cursor-pointer transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="min-h-11 px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 cursor-pointer transition-colors btn-press"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body ?? document.getElementById('root') ?? document.documentElement
  )
}
