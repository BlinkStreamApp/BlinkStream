/* eslint-disable react-hooks/static-components */

import { useCallback, useSyncExternalStore } from 'react'
import { IconContext } from '@phosphor-icons/react/dist/lib/context'
import { subscribeToIconStyle, getIconWeight } from '../../utils/hslTheme'

const iconLoaders = import.meta.glob('/node_modules/@phosphor-icons/react/dist/csr/{ArrowsClockwise,ArrowsInSimple,ArrowLeft,ArrowRight,ArrowSquareOut,Camera,CaretDoubleLeft,CaretDoubleRight,CaretDown,CaretLeft,CaretRight,Cat,ChartBar,ChatCircle,ChatCircleDots,ChatCircleSlash,Chats,ChatsCircle,ChatSlash,CheckCircle,ClockCounterClockwise,CloudCheck,Coins,CornersOut,DeviceMobile,DownloadSimple,FilmStrip,Folder,FolderOpen,GameController,Gear,Gift,Headphones,Heart,HeartBreak,Info,Lightning,MagicWand,MagnifyingGlass,MonitorPlay,Palette,Pause,PictureInPicture,Play,PlayCircle,Plus,Power,Record,RocketLaunch,Shield,ShieldCheck,SignOut,Sliders,SlidersHorizontal,Smiley,Sparkle,SpeakerHigh,SpeakerSlash,SpinnerGap,SquaresFour,Television,TextAa,Trash,VideoCamera,WarningCircle,WifiHigh,X}.es.js')

const iconState = new Map()        
const loadPromises = new Map()     
const subscribers = new Set()

function notify() {
  for (const cb of subscribers) cb()
}

function subscribe(cb) {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

function getSnapshot(name) {
  return iconState.has(name) ? iconState.get(name) : undefined
}

function getServerSnapshot() {
  return undefined
}

function loadIcon(name) {
  if (loadPromises.has(name)) return loadPromises.get(name)
  const key = `/node_modules/@phosphor-icons/react/dist/csr/${name}.es.js`
  const loader = iconLoaders[key]
  if (!loader) {
    console.warn(`[PhosphorIcon] Icono desconocido: "${name}". Revisa la grafia.`)
    iconState.set(name, null)
    loadPromises.set(name, Promise.resolve(null))
    notify()
    return loadPromises.get(name)
  }

  iconState.set(name, null)
  const promise = loader()
    .then((mod) => {
      const Icon = mod[name] || null
      iconState.set(name, Icon)
      notify()
      return Icon
    })
    .catch((err) => {
      console.error(`[PhosphorIcon] Error cargando "${name}":`, err)
      iconState.set(name, null)
      notify()
      return null
    })
  loadPromises.set(name, promise)
  return promise
}

export default function PhosphorIcon({
  name,
  size = 20,
  weight = 'regular',
  color = 'currentColor',
  className = '',
  fixedWeight = false,
  ...props
}) {
  const getNameSnapshot = useCallback(() => getSnapshot(name), [name])
  const IconComponent = useSyncExternalStore(subscribe, getNameSnapshot, getServerSnapshot)

  const themeIconWeight = useSyncExternalStore(subscribeToIconStyle, getIconWeight, getIconWeight)
  const resolvedWeight = fixedWeight ? weight : (weight === 'fill' ? 'fill' : themeIconWeight)

  if (IconComponent === undefined) {
    loadIcon(name)
    return null
  }

  if (IconComponent === null) return null

  return (
    <IconContext.Provider value={{ size, weight: resolvedWeight, color }}>
      <div
        className={`phosphor-icon-container transition-all duration-200 ${className}`}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <IconComponent weight={resolvedWeight} size={size} color={color} {...props} />
      </div>
    </IconContext.Provider>
  )
}
