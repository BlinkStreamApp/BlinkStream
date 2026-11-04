export const PLAYER_CONTROLS_KEY = 'bs.playerControls.v1'
export const PLAYER_CONTROL_IDS = ['clips', 'vods', 'drops', 'record', 'snapshot', 'audio', 'theatre', 'browser', 'pip']

export function parsePlayerControls(raw) {
  let saved
  try { saved = JSON.parse(raw || '{}') } catch { saved = {} }
  return Object.fromEntries(PLAYER_CONTROL_IDS.map(id => [id, typeof saved?.[id] === 'boolean' ? saved[id] : true]))
}

export function setPlayerControl(id, enabled) {
  if (!PLAYER_CONTROL_IDS.includes(id) || typeof enabled !== 'boolean') return
  const controls = parsePlayerControls(getItem(PLAYER_CONTROLS_KEY, '{}'))
  controls[id] = enabled
  if (!setItem(PLAYER_CONTROLS_KEY, JSON.stringify(controls))) return false
  window.dispatchEvent(new Event('bs:player-controls'))
  return true
}
import { getItem, setItem } from './storage'
