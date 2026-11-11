import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTwitchDrops } from './useTwitchDrops'

export function useConnectedChannelPoints(account, channel) {
  const connection = useTwitchDrops(account)
  const scope = JSON.stringify([connection.session, connection.accountId, channel])
  const requestRef = useRef(0)
  const inFlight = useRef(null)
  const [state, setState] = useState({ scope: null, balance: null, loading: false, error: null })
  const refresh = useCallback(() => {
    if (!connection.session || !connection.accountId || !channel) return Promise.resolve()
    if (inFlight.current?.scope === scope) return inFlight.current.promise
    const version = ++requestRef.current
    setState({ scope, balance: null, loading: true, error: null })
    const pending = { scope, promise: null }
    pending.promise = (async () => {
      try {
        const data = await invoke('read_connected_channel_points', { session: connection.session, channel })
        if (version !== requestRef.current) return
        if (data?.accountId !== connection.accountId || data?.channel !== channel.toLowerCase()) throw new Error('account')
        const balance = data.balance === null ? null : Number.isSafeInteger(data.balance) && data.balance >= 0 ? data.balance : null
        setState({ scope, balance, pointsName: typeof data.pointsName === 'string' ? data.pointsName : '', loading: false, error: null })
      } catch (error) {
        if (version === requestRef.current) setState({ scope, balance: null, loading: false, error: String(error?.message || error) })
      } finally { if (inFlight.current === pending) inFlight.current = null }
    })()
    inFlight.current = pending
    return pending.promise
  }, [connection.session, connection.accountId, channel, scope])
  const cancel = useCallback(() => { requestRef.current++ }, [])
  useEffect(() => {
    const load = () => { if (document.visibilityState !== 'hidden') void refresh() }
    load()
    const timer = setInterval(load, 30000)
    return () => { cancel(); clearInterval(timer) }
  }, [refresh, cancel])
  const current = state.scope === scope ? state : { balance: null, loading: false, error: null }
  return { ...current, connected: Boolean(connection.session && connection.accountId), refresh }
}
