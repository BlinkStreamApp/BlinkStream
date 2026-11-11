import { useEffect, useState } from 'react'
import { acquireChannelActivity, EMPTY_CHANNEL_ACTIVITY } from '../utils/channelActivity'
import { isTauri } from '../utils/tauriEnv'
import { IS_STORE_BUILD } from '../utils/distribution'

export function useChannelActivity({ accountId, channel, channelId, enabled = true }) {
  const [result, setResult] = useState(null)
  const scope = `${accountId || 'guest'}:${channelId}:${channel}`
  useEffect(() => {
    const connection = acquireChannelActivity({ accountId, channel, channelId }, enabled && !IS_STORE_BUILD && isTauri())
    const update = () => setResult({ scope, state: connection.snapshot() })
    const unsubscribe = connection.subscribe(update)
    update()
    return () => { unsubscribe(); connection.release() }
  }, [accountId, channel, channelId, enabled, scope])
  return result?.scope === scope ? result.state : EMPTY_CHANNEL_ACTIVITY
}
