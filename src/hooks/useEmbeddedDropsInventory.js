import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../utils/tauriEnv'
import { isDomElementVisible } from '../utils/keyboard'

export function useEmbeddedDropsInventory() {
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState(null)
  const containerRef = useRef(null)
  const requestRef = useRef(null)

  const close = useCallback(() => {
    const request = requestRef.current
    requestRef.current = null
    request?.reject(new Error('El inventario integrado se ha cerrado'))
    setIsOpen(false)
  }, [])

  const open = useCallback(() => {
    if (!isTauri()) return Promise.reject(new Error('El inventario integrado requiere la app de escritorio'))
    if (requestRef.current) return requestRef.current.promise
    const request = { session: crypto.randomUUID().replaceAll('-', '') }
    request.promise = new Promise((resolve, reject) => { request.resolve = resolve; request.reject = reject })
    requestRef.current = request
    setError(null)
    setIsOpen(true)
    return request.promise
  }, [])

  const reload = useCallback(async () => {
    if (!requestRef.current) return
    try {
      await invoke('reset_embedded_twitch_drops', { session: requestRef.current.session })
      setError(null)
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }, [])

  useEffect(() => {
    if (!isOpen || !requestRef.current) return undefined
    const request = requestRef.current
    let disposed = false
    let mounted = false
    let frame = null
    let mounting
    const bounds = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error('El panel de inventario no tiene espacio visible')
      return { session: request.session, x: Math.round(rect.left), y: Math.round(rect.top),
        width: Math.round(rect.width), height: Math.round(rect.height) }
    }
    const fail = err => {
      if (disposed) return
      request.reject(err)
      setError(err instanceof Error ? err.message : String(err))
    }
    const timeout = setTimeout(() => fail(new Error('El inventario integrado no respondió a tiempo')), 10000)
    mounting = (async () => {
      try {
        await invoke('mount_embedded_twitch_drops', bounds())
        if (disposed) return
        mounted = true
        // Modal/resize changes while mounting cannot be applied until the child exists.
        sync()
        request.resolve(request.session)
      } catch (err) { fail(err) } finally { clearTimeout(timeout) }
    })()
    const sync = () => {
      if (disposed || !mounted || frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        if (disposed) return
        const owner = containerRef.current?.closest?.('[role="dialog"]')
        const covered = [...document.querySelectorAll('[role="dialog"],[data-modal="true"]')]
          .some(modal => modal !== owner && !modal.contains(owner) && isDomElementVisible(modal) && modal.getBoundingClientRect().width > 0)
        try { invoke('update_embedded_twitch_drops_bounds', { ...bounds(), visible: !covered }).catch(fail) } catch (err) { fail(err) }
      })
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync)
    if (containerRef.current) observer?.observe(containerRef.current)
    const modals = new MutationObserver(sync)
    modals.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['hidden', 'inert', 'aria-hidden', 'class', 'style', 'role', 'data-modal'] })
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    return () => {
      disposed = true
      clearTimeout(timeout)
      observer?.disconnect()
      modals.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
      // Wait for the outstanding mount; its session cannot close a newer panel.
      void mounting.finally(() => invoke('unmount_embedded_twitch_drops', { session: request.session }).catch(() => {}))
    }
  }, [isOpen])

  useEffect(() => () => {
    requestRef.current?.reject(new Error('El panel de Drops se ha cerrado'))
    requestRef.current = null
  }, [])

  return { isOpen, open, close, reload, error, containerRef }
}
