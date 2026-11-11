import { useEffect, useState } from 'react'
import { acquireModerationSession, initialModerationState } from '../utils/moderationSession'

export function useModerationSession({ broadcasterId, userId, token }) {
  const [result, setResult] = useState(null)
  const scope = `${userId || ''}:${broadcasterId || ''}`
  useEffect(() => {
    if (!broadcasterId || !userId) return
    const session = acquireModerationSession({ broadcasterId, userId, token })
    const update = () => setResult({ scope, token, state: session.snapshot(), removeHeld: session.removeHeld })
    const stop = session.subscribe(update)
    update()
    return () => { stop(); session.release() }
  }, [broadcasterId, userId, token, scope])
  return result?.scope === scope && result.token === token ? result : { state: initialModerationState(), removeHeld: () => {} }
}
