import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import QRCodeSvg from './QRCodeSvg'

describe('local access QR', () => {
  it('encodes locally without sending the access credential to a remote image service', () => {
    const value = 'http://192.168.1.2:9876/#pin=test-not-a-secret'
    const { container } = render(<QRCodeSvg value={value} />)
    expect(screen.getByRole('img', { name: 'Código QR de acceso local' })).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg path').getAttribute('d').length).toBeGreaterThan(100)
    expect(screen.getByRole('link')).toHaveAttribute('href', value)
    expect(container.textContent).not.toContain('test-not-a-secret')
  })
  it('does not turn non-HTTP QR contents into executable links', () => {
    render(<QRCodeSvg value="javascript:alert(1)" />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
