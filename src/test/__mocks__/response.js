// Helper compartido para construir Response-like objects en los tests.
// measureFetch (de src/utils/perf.js) accede a res.headers.get('Ratelimit-Remaining'),
// asi que necesitamos un objeto con `.get()` que devuelva string o null.
// Tambien expone .ok, .status, .json(), .text(), .url como una Response real.
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
