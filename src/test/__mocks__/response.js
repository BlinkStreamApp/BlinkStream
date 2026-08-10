

export function mockResponse({
  ok = true,
  status = 200,
  json,
  text,
  url,
  headers = {},
} = {}) {
  return {
    ok,
    status,
    url: url ?? 'https://test/redirected',
    json: json ?? (async () => ({})),
    text: text ?? (async () => ''),
    headers: {
      get: (k) => headers[k] ?? null,
    },
  }
}
