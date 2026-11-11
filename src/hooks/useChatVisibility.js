import { useCallback, useEffect, useState } from 'react'

export function useChatVisibility(breakpoint = 600) {
  const [wide, setWide] = useState(() => window.innerWidth >= breakpoint)
  const [preference, setPreference] = useState(null)
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === 'hidden' || window.innerWidth <= 0) return
      setWide(window.innerWidth >= breakpoint)
    }
    window.addEventListener('resize', sync)
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [breakpoint])
  const setVisible = useCallback(value => {
    setPreference(previous => typeof value === 'function' ? value(previous ?? wide) : value)
  }, [wide])
  return [preference ?? wide, setVisible]
}
