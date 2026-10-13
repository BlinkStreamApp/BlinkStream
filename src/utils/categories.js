import { getHeaders } from './twitch'

// Category discovery uses only public Helix read endpoints and existing auth.
async function readPage(path, params, signal) {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; cancel() }, 8000)
  let onAbort
  try {
    const interrupted = new Promise((_, reject) => {
      onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
      controller.signal.addEventListener('abort', onAbort, { once: true })
      if (controller.signal.aborted) onAbort()
    })
    const operation = async () => {
      const headers = await getHeaders()
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const response = await fetch(`https://api.twitch.tv/helix/${path}?${params}`, { headers, signal: controller.signal })
      if (!response.ok) {
        const error = new Error('Twitch category request failed')
        error.code = response.status === 401 ? 'auth' : response.status === 429 ? 'rate' : 'network'
        throw error
      }
      const page = await response.json()
      const field = path === 'streams' ? 'user_login' : 'name'
      if (!Array.isArray(page?.data) || page.data.some(item => !item || typeof item.id !== 'string' || typeof item[field] !== 'string' || !item[field])) {
        const error = new Error('Invalid Twitch category response')
        error.code = 'invalid'
        throw error
      }
      return { items: page.data, cursor: typeof page.pagination?.cursor === 'string' ? page.pagination.cursor : '' }
    }
    // Bound auth lookup and JSON reads as well as the network request.
    return await Promise.race([operation(), interrupted])
  } catch (error) {
    if (timedOut && !signal?.aborted) {
      const timeout = new Error('Twitch category request timed out')
      timeout.code = 'timeout'
      throw timeout
    }
    throw error
  } finally {
    clearTimeout(timer)
    controller.signal.removeEventListener('abort', onAbort)
    signal?.removeEventListener('abort', cancel)
  }
}

export function fetchCategories({ query = '', cursor = '', signal } = {}) {
  const search = query.trim()
  const params = new URLSearchParams({ first: '24' })
  if (search) params.set('query', search)
  if (cursor) params.set('after', cursor)
  return readPage(search ? 'search/categories' : 'games/top', params, signal)
}

export function fetchCategoryStreams({ categoryId, language = '', cursor = '', signal }) {
  const params = new URLSearchParams({ game_id: categoryId, first: '20' })
  if (language) params.set('language', language)
  if (cursor) params.set('after', cursor)
  return readPage('streams', params, signal)
}
