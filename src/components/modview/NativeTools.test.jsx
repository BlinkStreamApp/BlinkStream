import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { NativeHistory, NativeUserActions } from './NativeTools'
import { moderationOperation } from '../../utils/moderationApi'
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../../utils/moderationApi', () => ({ moderationOperation: vi.fn() }))
beforeEach(() => vi.clearAllMocks())
const props = { enabled: true, account: '1', channelId: '2', targetId: '3', onOpenOfficial: vi.fn() }
it('never reads the web session before the user enables it', () => {
  render(<NativeHistory {...props} enabled={false} />)
  expect(invoke).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Abrir Twitch oficial' })).toBeInTheDocument()
})
it('ignores late history from a previous user and preserves partial denials', async () => {
  let resolve
  invoke.mockReturnValueOnce(new Promise(r => { resolve = r })).mockResolvedValueOnce({ actions: { available: true, items: [{ id: 'new', label: 'Current user action' }] }, messages: { available: false }, comments: { available: true, items: [] } })
  const view = render(<NativeHistory {...props} />)
  view.rerender(<NativeHistory {...props} targetId="4" />)
  expect(await screen.findByText('Current user action')).toBeInTheDocument()
  await act(async () => resolve({ actions: { available: true, items: [{ id: 'old', label: 'Wrong identity' }] } }))
  expect(screen.queryByText('Wrong identity')).not.toBeInTheDocument()
  expect(screen.getByText('Mensajes anteriores (—)')).toBeInTheDocument()
})
it('disables warnings without the scope and sends only a deliberate scoped action', async () => {
  moderationOperation.mockResolvedValue({ success: true })
  const view = render(<NativeUserActions channelId="2" userId="1" targetId="3" scopes={[]} token="primary" />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Test reason' } })
  expect(screen.getByRole('button', { name: 'Advertir usuario' })).toBeDisabled()
  view.rerender(<NativeUserActions channelId="2" userId="1" targetId="3" scopes={['moderator:manage:warnings']} token="primary" />)
  fireEvent.click(screen.getByRole('button', { name: 'Advertir usuario' }))
  expect(await screen.findByText('Twitch ha aceptado la operación.')).toBeInTheDocument()
  expect(moderationOperation).toHaveBeenCalledWith('warn', { channel: '2', moderator: '1', target: '3', text: 'Test reason' }, 'primary')
})
