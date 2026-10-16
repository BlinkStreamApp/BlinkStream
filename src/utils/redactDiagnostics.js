export function redactText(value) {
  return String(value).replace(/https?:\/\/[^\s"'<>]+/g, raw => {
    try {
      const url = new URL(raw)
      return `${url.origin}${url.pathname}${url.search ? '?[redacted]' : ''}`
    } catch { return '[redacted-url]' }
  }).replace(/\b(?:Bearer|OAuth|oauth:)\s*[^\s,;]+/gi, '[redacted-credential]')
}

export function redactDiagnostics(value, depth = 0) {
  if (typeof value === 'string') return redactText(value)
  if (!value || typeof value !== 'object') return value
  if (depth > 5) return '[truncated]'
  if (Array.isArray(value)) return value.slice(0, 50).map(item => redactDiagnostics(item, depth + 1))
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) =>
    [key, /token|secret|password|authorization|cookie|credential/i.test(key) ? '[redacted]' : redactDiagnostics(item, depth + 1)]))
}
