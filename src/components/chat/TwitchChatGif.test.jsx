import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import TwitchChatGif from './TwitchChatGif'
import { setLanguage } from '../../utils/i18n'

afterEach(() => { cleanup(); setLanguage('es') })
it('renders the original GIF URL lazily with a readable description', () => {
  const url = 'https://media4.giphy.com/media/test/giphy.gif?cid=x&ct=g'
  render(<TwitchChatGif url={url} text="[Happy GIF]" />)
  const image = screen.getByRole('img', { name: '[Happy GIF]' })
  expect(image).toHaveAttribute('src', url)
  expect(image).toHaveAttribute('loading', 'lazy')
  expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
})
it('keeps the original description on load failure and permits an explicit retry', () => {
  render(<TwitchChatGif url="https://media.giphy.com/test.gif" text="[Happy GIF]" />)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByText('[Happy GIF]')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('No se pudo cargar el GIF')
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(screen.getByRole('img', { name: '[Happy GIF]' })).toBeInTheDocument()
})
