import { useEffect, useEffectEvent, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

function validSlot(value) {
  if (!value || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(value[key]))) return null
  const { x, y, width, height } = value
  return x >= 0 && y >= 0 && width >= 0.15 && height >= 0.15 && x + width <= 1.00001 && y + height <= 1.00001
    ? { x, y, width, height } : null
}

export function useOfficialVideoSlot(enabled, sessionRef, scope, onUnavailable) {
  const [result, setResult] = useState(null)
  const unavailable = useEffectEvent(() => onUnavailable?.())
  useEffect(() => {
    if (!enabled || !sessionRef.current) return
    const session = sessionRef.current
    let cancelled = false, timer
    const publish = slot => setResult(previous => previous?.scope === scope && (
      previous.slot === slot || previous.slot && slot && ['x', 'y', 'width', 'height'].every(key => previous.slot[key] === slot[key])
    ) ? previous : { scope, slot })
    const measure = async () => {
      if (cancelled) return
      if (!document.hidden && !document.fullscreenElement) {
        try {
          const value = await invoke('get_official_modview_video_bounds', { session })
          if (!cancelled && sessionRef.current === session) {
            const slot = validSlot(value)
            publish(slot)
            if (!slot) unavailable()
          }
        } catch {
          if (!cancelled && sessionRef.current === session) { publish(null); unavailable() }
        }
      }
      if (!cancelled) timer = setTimeout(measure, 1000)
    }
    void measure()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [enabled, sessionRef, scope])
  return enabled && result?.scope === scope ? result.slot : null
}
