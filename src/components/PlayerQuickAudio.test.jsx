import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import PlayerQuickAudio from './PlayerQuickAudio'
afterEach(cleanup)
it('controls the existing volume/night mode, handles Escape and restores focus', () => {
  const opener = document.createElement('button'); document.body.append(opener); opener.focus()
  const props = { volume: 50, onVolumeChange: vi.fn(), isNightMode: false, onToggleNightMode: vi.fn(), onClose: vi.fn() }
  const { unmount } = render(<PlayerQuickAudio {...props} />)
  const slider = screen.getByRole('slider', { name: 'Volumen' })
  expect(slider).toHaveFocus()
  fireEvent.change(slider, { target: { value: '35' } })
  expect(props.onVolumeChange).toHaveBeenCalledWith(35)
  fireEvent.click(screen.getByRole('switch'))
  expect(props.onToggleNightMode).toHaveBeenCalledOnce()
  fireEvent.keyDown(slider, { key: 'Escape' })
  expect(props.onClose).toHaveBeenCalledOnce()
  unmount(); expect(opener).toHaveFocus(); opener.remove()
})
