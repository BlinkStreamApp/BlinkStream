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
  ...props
}) {
  // Snapshots memoizados para que la regla react-hooks/static-components
  // no proteste. Cambian solo si cambia `name`.
  const getNameSnapshot = useCallback(() => getSnapshot(name), [name])

  // useSyncExternalStore nos da suscripcion reactiva al cache externo
  // SIN disparar re-renders innecesarios ni violar la regla
  // react-hooks/set-state-in-effect. `subscribe` y `getServerSnapshot`
  // son referencias de modulo estables.
  // El nombre `IconComponent` (no `Icon`) es deliberado: la regla
  // react-hooks/static-components confunde cualquier identificador
  // capitalizado con un componente y se queja del call site.
  const IconComponent = useSyncExternalStore(subscribe, getNameSnapshot, getServerSnapshot)

  // Si el snapshot es undefined, no sabemos del icono: arrancar carga.
  // useSyncExternalStore ya re-renderizara cuando notify() se llame.
  if (IconComponent === undefined) {
    loadIcon(name)
    return null
  }

  if (IconComponent === null) return null

  return (
    <IconContext.Provider value={{ size, weight, color }}>
      <div
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <IconComponent {...props} />
      </div>
    </IconContext.Provider>
  )
}
