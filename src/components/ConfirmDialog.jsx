import { createPortal } from 'react-dom'

export default function ConfirmDialog({ title, message, confirmText = 'Aceptar', cancelText = 'Cancelar', onConfirm, onCancel }) {
  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center animate-fade-in" onClick={onCancel}>
      <div className="bg-bg-secondary border border-bg-tertiary/60 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-white font-bold text-sm mb-2">{title}</h3>
        <p className="text-text-secondary text-[13px] mb-5 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded-lg text-[12px] text-text-secondary hover:text-text-primary hover:bg-hover cursor-pointer transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-lg text-[12px] font-medium text-white bg-red-500 hover:bg-red-600 cursor-pointer transition-colors btn-press"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body ?? document.getElementById('root') ?? document.documentElement
  )
}
