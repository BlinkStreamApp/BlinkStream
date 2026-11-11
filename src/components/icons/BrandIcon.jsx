import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import PhosphorIcon from './PhosphorIcon'
import { images, manifest } from './brandIconAssets'
const fallbackIcons = { account: 'User', audio: 'SpeakerHigh', collections: 'Folder', emotes: 'Smiley', search: 'MagnifyingGlass', window: 'ArrowSquareOut', overlay: 'PictureInPicture', chat: 'ChatCircle', bell: 'Bell', featured: 'Sparkle', drops: 'Gift', shield: 'Shield', grid: 'SquaresFour', community: 'Users', favorite: 'Heart', clips: 'FilmStrip', vods: 'VideoCamera', remote: 'DeviceMobile', settings: 'Gear', palette: 'Palette', language: 'GlobeHemisphereWest', sliders: 'SlidersHorizontal' }
import { BRAND_ICON_THEMES, getBrandIconTheme, subscribeToIconStyle } from '../../utils/hslTheme'

let stopActiveAnimation = null

export default function BrandIcon({ name, size = 24, className = '', theme }) {
  const selectedTheme = useSyncExternalStore(subscribeToIconStyle, getBrandIconTheme, () => 'classic')
  const style = BRAND_ICON_THEMES.find(item => item.id === (theme || selectedTheme)) || BRAND_ICON_THEMES[0]
  const imageKey = manifest[`${style.id}-${name}`] ? `${style.id}-${name}` : name
  const animationId = `${style.id}:${imageKey}`
  const containerRef = useRef(null)
  const finishRef = useRef(null)
  const loadedRef = useRef(null)
  const [animation, setAnimation] = useState(null)
  const asset = images[`/src/assets/brand-icons/${imageKey}.png`] && images[`/src/assets/brand-icons/${imageKey}.gif`] ? manifest[imageKey] : null
  const currentAnimation = animation?.key === animationId ? animation : null
  useEffect(() => {
    const container = containerRef.current
    if (!container || !asset) return undefined
    const host = container.closest('button, a, [role="button"]') || container
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let timer, active = false
    const stop = () => {
      clearTimeout(timer)
      active = false
      if (stopActiveAnimation === stop) stopActiveAnimation = null
      setAnimation(null)
    }
    const start = () => {
      if (active || motion.matches || document.visibilityState === 'hidden') return
      stopActiveAnimation?.()
      stopActiveAnimation = stop
      active = true
      setAnimation({ key: animationId, loaded: false })
      timer = setTimeout(stop, 3000)
    }
    const loaded = () => {
      if (!active) return
      clearTimeout(timer)
      setAnimation({ key: animationId, loaded: true })
      timer = setTimeout(stop, Math.min(asset.durationMs, 1600))
    }
    const visibility = () => { if (document.visibilityState === 'hidden') stop() }
    const preference = () => { if (motion.matches) stop() }
    finishRef.current = stop
    loadedRef.current = loaded
    host.addEventListener('pointerenter', start)
    host.addEventListener('pointerleave', stop)
    host.addEventListener('focusin', start)
    host.addEventListener('focusout', stop)
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', visibility)
    motion.addEventListener?.('change', preference)
    return () => {
      clearTimeout(timer)
      active = false
      if (stopActiveAnimation === stop) stopActiveAnimation = null
      finishRef.current = null
      loadedRef.current = null
      host.removeEventListener('pointerenter', start)
      host.removeEventListener('pointerleave', stop)
      host.removeEventListener('focusin', start)
      host.removeEventListener('focusout', stop)
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', visibility)
      motion.removeEventListener?.('change', preference)
    }
  }, [asset, animationId])
  if (!asset) return <PhosphorIcon name={fallbackIcons[name] || 'SquaresFour'} size={size} className={className} aria-hidden="true" />
  return <span ref={containerRef} aria-hidden="true" className={`relative inline-flex shrink-0 align-middle ${className}`} style={{ width: size, height: size, filter: imageKey === name ? style.filter : undefined }}>
    <img src={images[`/src/assets/brand-icons/${imageKey}.png`]} alt="" width={size} height={size} decoding="async" draggable={false} className={`h-full w-full object-contain ${currentAnimation?.loaded ? 'invisible' : ''}`} />
    {currentAnimation && <img src={images[`/src/assets/brand-icons/${imageKey}.gif`]} alt="" width={size} height={size} decoding="async" draggable={false} onLoad={() => loadedRef.current?.()} onError={() => finishRef.current?.()} className={`absolute inset-0 h-full w-full object-contain ${currentAnimation.loaded ? '' : 'invisible'}`} />}
  </span>
}
