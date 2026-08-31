import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './tauriEnv'

export async function startDropsWatcher(channel) {
  if (!channel || !isTauri()) return
  try {
    const clean = String(channel).trim().toLowerCase()
    await invoke('start_drops_watcher', { channel: clean })
  } catch (err) {
    console.warn('[DropsWatcher] start_drops_watcher failed:', err)
  }
}

export async function stopDropsWatcher() {
  if (!isTauri()) return
  try {
    await invoke('stop_drops_watcher')
  } catch (err) {
    console.warn('[DropsWatcher] stop_drops_watcher failed:', err)
  }
}
