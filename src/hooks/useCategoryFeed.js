import { useCallback, useEffect, useRef, useState } from 'react'

const empty = { items: [], cursor: '', error: null, loading: false, loadingMore: false }

// One cancellable scope per query/filter. Old completions never replace new results.
export function useCategoryFeed({ scope, request, enabled = true, delay = 0 }) {
  const [state, setState] = useState({ ...empty, scope: null })
  const sessionRef = useRef(null)
  useEffect(() => {
    if (!enabled) return
    const session = { cancelled: false, busy: false, cursor: '', failedCursor: null, items: [] }
    const controller = new AbortController()
    sessionRef.current = session
    session.load = async cursor => {
      if (session.cancelled || session.busy) return
      session.busy = true
      session.failedCursor = null
      setState({ scope, items: session.items, cursor: session.cursor, error: null, loading: !cursor, loadingMore: !!cursor })
      try {
        const page = await request({ cursor, signal: controller.signal })
        if (session.cancelled) return
        const seen = new Set(cursor ? session.items.map(item => item.id) : [])
        const additions = page.items.filter(item => {
          if (seen.has(item.id)) return false
          seen.add(item.id)
          return true
        })
        session.items = cursor ? [...session.items, ...additions] : additions
        // Live lists can shift while paging; don't offer an endlessly repeated cursor.
        session.cursor = page.cursor === cursor ? '' : page.cursor
        setState({ ...empty, scope, items: session.items, cursor: session.cursor })
      } catch (error) {
        if (session.cancelled) return
        session.failedCursor = cursor
        setState({ ...empty, scope, items: session.items, cursor: session.cursor, error: error.code || 'network' })
      } finally {
        session.busy = false
      }
    }
    const timer = setTimeout(() => { void session.load('') }, delay)
    return () => {
      session.cancelled = true
      controller.abort()
      clearTimeout(timer)
    }
  }, [scope, request, enabled, delay])

  const loadMore = useCallback(() => {
    const session = sessionRef.current
    if (session?.cursor) void session.load(session.cursor)
  }, [])
  const retry = useCallback(() => {
    const session = sessionRef.current
    if (session && session.failedCursor !== null) void session.load(session.failedCursor)
  }, [])
  const visible = !enabled ? empty : state.scope === scope ? state : { ...empty, loading: true }
  return { ...visible, loadMore, retry }
}
