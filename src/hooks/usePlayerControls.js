import { useMemo, useSyncExternalStore } from 'react'
import { parsePlayerControls, PLAYER_CONTROLS_KEY } from '../utils/playerControls'

function subscribe(listener) {
  const onStorage = event => { if (!event.key || event.key === PLAYER_CONTROLS_KEY) listener() }
  window.addEventListener('storage', onStorage)
  window.addEventListener('bs:player-controls', listener)
  return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('bs:player-controls', listener) }
}
function snapshot() { try { return localStorage.getItem(PLAYER_CONTROLS_KEY) || '{}' } catch { return '{}' } }

export function usePlayerControls() {
  const raw = useSyncExternalStore(subscribe, snapshot)
  return useMemo(() => parsePlayerControls(raw), [raw])
}
