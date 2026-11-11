import { act, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { UserInspectorCard } from './UserInspectorCard'
import { getUserByLogin } from '../../utils/twitch'
vi.mock('../../utils/twitch', () => ({ getUserByLogin: vi.fn() }))
beforeEach(() => vi.clearAllMocks())
it('enriches the selected user with a real profile and ignores a previous profile response', async () => {
  let resolve
  getUserByLogin.mockReturnValueOnce(new Promise(r => { resolve = r }))
    .mockResolvedValueOnce({ success: true, value: { id: '3', display_name: 'Bob', profile_image_url: 'https://example.com/bob.png', description: 'Current biography', broadcaster_type: 'partner', created_at: '2020-01-02T00:00:00Z' } })
  const view = render(<UserInspectorCard targetUser={{ userId: '2', username: 'alice' }} />)
  view.rerender(<UserInspectorCard targetUser={{ userId: '3', username: 'bob' }} />)
  expect(await screen.findByText('Current biography')).toBeInTheDocument()
  expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/bob.png')
  expect(screen.getByText('Partner')).toBeInTheDocument()
  await act(async () => resolve({ success: true, value: { description: 'Old biography', profile_image_url: 'https://example.com/alice.png' } }))
  expect(screen.queryByText('Old biography')).not.toBeInTheDocument()
  expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/bob.png')
})
