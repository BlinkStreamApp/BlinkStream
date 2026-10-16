import { describe, it, expect } from 'vitest'
import { redactDiagnostics, redactText } from './redactDiagnostics'

describe('credential redaction', () => {
  it('removes query, fragments, URL credentials and structured secrets', () => {
    const output = redactDiagnostics({ url: 'https://user:pass@example.invalid/api?refresh=secret#token', nested: { access_token: 'secret', Authorization: 'Bearer secret', count: 1 } })
    expect(output.url).toBe('https://example.invalid/api?[redacted]')
    expect(output.nested.access_token).toBe('[redacted]')
    expect(output.nested.count).toBe(1)
    expect(JSON.stringify(output)).not.toContain('secret')
    expect(redactText('failed OAuth secret')).toBe('failed [redacted-credential]')
  })
})
