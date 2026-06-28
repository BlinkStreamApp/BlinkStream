/**
 * @file AnimatedIcon (FASE 4 / WT-20260628-45).
 * Wrapper sobre lottie-react con lazy load del JSON y fallback a Phosphor
 * si la red/CDN falla. Patron inspirado en PhosphorIcon.jsx: el JSON se
 * descarga solo al montar, no en el bundle inicial.
 *
 * Por que lazy + Suspense y no require:
 *   - Vite es ESM puro; `require` rompe el bundle.
 *   - La regla ESLint `@stylistic/no-commonjs` (heredada de la config
 *     recomendada) marca `require` en *.jsx.
 *   - PhosphorIcon es ya un modulo lazy-friendly (registrado en el
 *     Vite glob), asi que cargarlo via lazy no anade peso al bundle
 *     inicial: el chunk del icono se sirve en cache desde el primer hit
 *     de Phosphor.
 *
 * Uso:
 *   <AnimatedIcon
 *     src="https://cdn.lordicon.com/lbjeurwh.json"
 *     fallback="Record"
 *     size={20}
 *     color="#ef4444"
 *   />
 */

import { lazy, Suspense, useEffect, useState } from 'react'
import Lottie from 'lottie-react'

// Fallback con dynamic import: Vite trata esto como un chunk async.
// Como solo se monta en el error path (red caida / CORS), el coste de
// cargar este chunk nunca impacta el render normal.
const PhosphorFallback = lazy(async () => {
  const mod = await import('./PhosphorIcon')
  return { default: mod.default }
})

function FallbackSkeleton({ size, className }) {
  // Mismo footprint que el icono final para evitar layout shift. Sin
  // color de fondo: el wrapper padre controla el fondo del boton.
  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={className}
    />
  )
}

export default function AnimatedIcon({
  src,
  fallback,
  size = 24,
  loop = true,
  autoplay = true,
  color = 'currentColor',
  className = '',
}) {
  const [animationData, setAnimationData] = useState(null)
  const [error, setError] = useState(false)

  // Fetch + reset. El `eslint-disable-next-line react-hooks/set-state-in-effect`
  // esta justificado: `animationData`/`error` son el resultado de un
  // side-effect externo (fetch a CDN) y no se pueden derivar de un calculo
  // puro de `src`. El reset al cambiar `src` es analogo al patron de
  // `useFetch` canonico de React 19: el body del effect re-sincroniza
  // estado React con un recurso externo, exactamente lo que la doc
  // oficial de la regla describe como caso valido.
  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnimationData(null)
    setError(false)
    fetch(src)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => { if (!cancelled) setAnimationData(data) })
      .catch((err) => {
        if (cancelled) return
        console.warn(`[AnimatedIcon] fetch failed para ${src}:`, err?.message || err)
        setError(true)
      })
    return () => { cancelled = true }
  }, [src])

  // Error path: cae a Phosphor. Suspense es defensivo por si el chunk
  // del fallback aun no esta en cache.
  if (error && fallback) {
    return (
      <Suspense fallback={<FallbackSkeleton size={size} className={className} />}>
        <PhosphorFallback name={fallback} size={size} className={className} color={color} />
      </Suspense>
    )
  }

  // Loading: skeleton inerte del mismo tamano.
  if (!animationData) {
    return <FallbackSkeleton size={size} className={className} />
  }

  return (
    <Lottie
      animationData={animationData}
      loop={loop}
      autoplay={autoplay}
      style={{ width: size, height: size, color }}
      className={className}
    />
  )
}
