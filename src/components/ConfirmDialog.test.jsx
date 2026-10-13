import { useRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ConfirmDialog from './ConfirmDialog'
import { useDialogFocus } from '../hooks/useDialogFocus'

describe('confirmation dialog safety', () => {
  it('focuses cancel, traps focus and Escape never confirms', () => {
    const confirm = vi.fn(), cancel = vi.fn()
    const { unmount } = render(<ConfirmDialog title="Cerrar sesión" message="Se cerrará tu sesión" onConfirm={confirm} onCancel={cancel} />)
    expect(screen.getByRole('alertdialog', { name: 'Cerrar sesión' })).toHaveAccessibleDescription('Se cerrará tu sesión')
    const cancelButton = screen.getByRole('button', { name: 'Cancelar' })
    expect(cancelButton).toHaveFocus()
    fireEvent.keyDown(cancelButton, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Aceptar' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement, { key: 'Tab' })
    expect(cancelButton).toHaveFocus()
    fireEvent.keyDown(cancelButton, { key: 'Escape' })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(confirm).not.toHaveBeenCalled()
    unmount()
  })
  it('nested confirmation closes only itself and returns focus to its parent', () => {
    const closeParent = vi.fn()
    function Parent() {
      const [open, setOpen] = useState(false)
      const ref = useRef(null), initial = useRef(null)
      useDialogFocus(ref, initial, closeParent)
      return <div ref={ref} role="dialog" aria-modal="true" aria-label="Parent">
        <button ref={initial} onClick={() => setOpen(true)}>Abrir confirmación</button>
        {open && <ConfirmDialog title="Confirmar" message="Prueba" onCancel={() => setOpen(false)} onConfirm={vi.fn()} />}
      </div>
    }
    render(<Parent />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir confirmación' }))
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(closeParent).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Abrir confirmación' })).toHaveFocus()
  })
})
