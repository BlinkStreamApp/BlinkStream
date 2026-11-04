import { useEffect, useState } from 'react'
import { isTauri } from '../utils/tauriEnv'
import { getDropsProgress, parseDropsInventory } from '../utils/drops'

export function useDropsProgress(channel, account) {
  const [snapshot, setSnapshot] = useState(null)
  useEffect(() => {
    let disposed = false
    let unlisten
    let latest = 0
    if (!isTauri() || !channel || !account) return undefined
    const accept = payload => {
      if (disposed) return
      if (payload?.authRequired) { setSnapshot(null); return }
      if (payload?.channel !== channel || payload?.accountLogin?.toLowerCase() !== account.toLowerCase() || !Number.isFinite(payload.updatedAt) || payload.updatedAt < latest) return
      latest = payload.updatedAt
      setSnapshot({ channel, account, progress: getDropsProgress(parseDropsInventory(payload).campaigns, true) })
    }
    Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')]).then(async ([{ invoke }, { listen }]) => {
      unlisten = await listen('twitch_drops_update', event => accept(event.payload))
      if (disposed) { unlisten(); return }
      accept(await invoke('get_cached_drops_inventory'))
    }).catch(() => {})
    return () => { disposed = true; unlisten?.() }
  }, [channel, account])
  return snapshot?.channel === channel && snapshot?.account === account ? snapshot.progress : null
}
