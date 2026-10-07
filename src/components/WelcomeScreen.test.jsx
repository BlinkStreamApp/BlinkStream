import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import WelcomeScreen from './WelcomeScreen'

describe('WelcomeScreen: composición original', () => {
  it('conserva bienvenida, cuatro etiquetas y acceso superior sin paneles nuevos', () => {
    render(<WelcomeScreen />)
    expect(screen.getByRole('heading', { name: 'Descubre BlinkStream' })).toBeInTheDocument()
    for (const label of ['Reproducción nativa', 'Chat con emotes', 'Favoritos en la nube', 'Notificaciones live']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText(/esquina superior derecha/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText('EXPLORA BLINKSTREAM')).not.toBeInTheDocument()
    expect(screen.getByAltText('BlinkStream', { hidden: true })).toHaveAttribute('width', '64')
  })
  it('mantiene el estado de conexión sin otro flujo de login', () => {
    render(<WelcomeScreen authing />)
    expect(screen.getByRole('status')).toHaveTextContent('Completa la conexión')
  })
  it('respeta el orden y la paleta del nombre de la cabecera', () => {
    render(<WelcomeScreen />)
    const heading = screen.getByRole('heading', { name: 'Descubre BlinkStream' })
    const [blink, stream] = heading.querySelectorAll('span')
    expect(blink).toHaveTextContent(/^Blink$/)
    expect(blink).toHaveClass('text-text-primary')
    expect(stream).toHaveTextContent(/^Stream$/)
    expect(stream).toHaveClass('bg-gradient-to-r', 'from-twitch', 'to-fuchsia-400', 'bg-clip-text', 'text-transparent')
  })
})
