import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { checkDropsSession, failDropsAuthorization, getDropsSnapshot } from '../utils/dropsSession'

const pending = phase => ['preparing', 'authorizing', 'checking'].includes(phase)

export function useDropsAuthorization(containerRef, session, authorizing) {
  useEffect(() => {
    if (!session || !authorizing) return undefined
    let disposed = false
    let mounted = false
    let timer
    const bounds = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error('window')
      return { session, x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    }
    const fail = error => { if (!disposed) failDropsAuthorization(session, error?.message || error) }
    const poll = async () => {
      await checkDropsSession()
      if (!disposed && pending(getDropsSnapshot().phase)) timer = setTimeout(poll, 1000)
    }
    const sync = () => {
      if (disposed || !mounted || !containerRef.current || containerRef.current.hidden) return
      try { void invoke('update_experimental_drops_bounds', bounds()).catch(fail) } catch (error) { fail(error) }
    }
    const mounting = (async () => {
      try {
        await invoke('mount_experimental_drops_auth', bounds())
        if (disposed) return
        mounted = true
        sync()
        await poll()
      } catch (error) { fail(error) }
    })()
    const observer = new ResizeObserver(sync)
    if (containerRef.current) observer.observe(containerRef.current)
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    return () => {
      disposed = true
      clearTimeout(timer)
      observer.disconnect()
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
      const closePending = () => {
        const state = getDropsSnapshot()
        if (state.session !== session || pending(state.phase)) {
          if (state.session === session && pending(state.phase)) failDropsAuthorization(session, 'cancelled')
          return invoke('disconnect_experimental_drops', { session }).catch(() => {})
        }
        return undefined
      }
      void closePending()
      void mounting.finally(closePending)
    }
  }, [containerRef, session, authorizing])
}
