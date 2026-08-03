/* eslint-disable react-hooks/static-components */
// Wrapper sobre @phosphor-icons/react con defaults consistentes.
//
// Por que un wrapper y no imports directos:
//  1. Defaults centralizados (size, weight, color) - cambiarlos en un sitio
//     los cambia en toda la app.
//  2. IconContext solo se invoca una vez por icono (mas limpio que
//     envolver cada <Icon size={...} /> en el callsite).
//  3. Import dinamico via import.meta.glob con `eager: false` (lazy):
//     Vite descubre los modulos en build time y solo empaqueta los que
//     se usan. Cero transpile eager de los 9k+ modulos (problema
//     conocido de Phosphor con Vite).
//  4. Cache en runtime: tras la primera carga, el icono se sirve
//     sincronamente en renders posteriores sin re-render extra.
//
// Uso:
//   <PhosphorIcon name="Gear" size={20} weight="regular" />
//   <PhosphorIcon name="X" size={16} weight="bold" />
//   <PhosphorIcon name="Coins" size={12} weight="duotone" color="currentColor" />

import { useCallback, useSyncExternalStore } from 'react'
import { IconContext } from '@phosphor-icons/react'
import { subscribeToIconStyle, getIconWeight } from '../../utils/hslTheme'

// Pre-descubre los 3k+ modulos de iconos en build time. Vite los trata
// como chunks lazy: cada uno se carga bajo demanda y solo se incluye
// en el bundle si algun callsite lo referencia.
// Usamos path absoluto (desde el root del proyecto) en vez de alias de
// paquete porque `import.meta.glob` exige que el glob empiece por '/'
// o './' — los nombres de paquete no son validos directamente.
const iconLoaders = import.meta.glob('/node_modules/@phosphor-icons/react/dist/csr/*.es.js')

// Estado externo: cada nombre de icono mapea a su componente o a `null`
// mientras se esta cargando. Una vez cargado, queda cacheado para siempre.
const iconState = new Map()        // name -> Icon | null (loading) | undefined (missing)
const loadPromises = new Map()     // name -> Promise<Icon | null>
const subscribers = new Set()

function notify() {
  for (const cb of subscribers) cb()
}

function subscribe(cb) {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

// Snapshot inmutable para useSyncExternalStore. Importante: devolver un
// NUEVO objeto cuando algo cambia para que React detecte la actualizacion.
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
  // Marcamos como "loading" para que el snapshot cambie.
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

  // Suscripción reactiva al estilo de iconos seleccionado en el estudio
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
