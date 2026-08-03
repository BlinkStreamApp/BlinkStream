import { useState, useEffect, useRef } from 'react'

let particleId = 0

export default function EmoteRainOverlay({ active = true }) {
  const [particles, setParticles] = useState([])
  const [activeCombo, setActiveCombo] = useState(null)
  
  const comboTrackerRef = useRef({})
  const comboTimerRef = useRef(null)

  useEffect(() => {
    if (!active) {
      setParticles([])
      setActiveCombo(null)
      return
    }

    const handleEmote = (e) => {
      const { url, name } = e.detail || {}
      if (!url) return

      const now = Date.now()

      // 1. Añadir partícula a la lluvia (máx 20 para cero lag en juegos)
      setParticles(prev => {
        const next = [...prev]
        if (next.length >= 20) {
          next.shift() // eliminar el más antiguo
        }
        const newParticle = {
          id: ++particleId,
          url,
          name: name || 'emote',
          x: Math.floor(Math.random() * 80) + 10, // entre 10% y 90%
          size: Math.floor(Math.random() * 16) + 36, // 36px a 52px
          duration: Math.random() * 1.2 + 2.5, // 2.5s a 3.7s de ascenso
        }
        return [...next, newParticle]
      })

      // Eliminar partícula del DOM automáticamente al completar animación
      setTimeout(() => {
        setParticles(prev => prev.filter(p => p.id !== particleId))
      }, 3600)

      // 2. Medidor de Combos (en ventana de 5 segundos)
      const tracker = comboTrackerRef.current
      if (!tracker[url] || (now - tracker[url].lastSeen > 5000)) {
        tracker[url] = { count: 1, lastSeen: now, name: name || 'Emote' }
      } else {
        tracker[url].count += 1
        tracker[url].lastSeen = now
      }

      const current = tracker[url]
      if (current.count >= 3) {
        setActiveCombo({
          url,
          name: current.name,
          count: current.count,
          updatedAt: now,
        })

        if (comboTimerRef.current) clearTimeout(comboTimerRef.current)
        comboTimerRef.current = setTimeout(() => {
          setActiveCombo(null)
        }, 4500)
      }
    }

    window.addEventListener('blinkstream:emote', handleEmote)
    return () => {
      window.removeEventListener('blinkstream:emote', handleEmote)
      if (comboTimerRef.current) clearTimeout(comboTimerRef.current)
    }
  }, [active])

  if (!active) return null

  const getComboStyle = (count) => {
    if (count >= 15) {
      return {
        bg: 'from-purple-950/95 via-fuchsia-900/90 to-indigo-950/95 border-fuchsia-400/80 shadow-[0_0_40px_rgba(217,70,239,0.7)] text-fuchsia-200 animate-bounce',
        title: 'GODLIKE COMBO! ⚡💀',
        badgeColor: 'bg-fuchsia-500 text-black shadow-fuchsia-300',
      }
    }
    if (count >= 6) {
      return {
        bg: 'from-amber-950/90 via-orange-900/80 to-red-950/90 border-amber-400/80 shadow-[0_0_30px_rgba(245,158,11,0.6)] text-amber-200 animate-pulse',
        title: 'SUPER COMBO! 🔥',
        badgeColor: 'bg-amber-400 text-black shadow-amber-200',
      }
    }
    return {
      bg: 'from-emerald-950/90 via-teal-900/75 to-cyan-950/90 border-emerald-400/70 shadow-[0_0_25px_rgba(16,185,129,0.5)] text-emerald-200',
      title: 'HYPERS COMBO!',
      badgeColor: 'bg-emerald-400 text-black shadow-emerald-200',
    }
  }

  return (
    <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden select-none font-sans">
      {/* 1. Lluvia Flotante de Emotes */}
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute bottom-6 transform -translate-x-1/2 transition-opacity duration-300 pointer-events-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)] animate-fade-in"
          style={{
            left: `${p.x}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animation: `floatUp ${p.duration}s ease-out forwards`,
          }}
        >
          <img
            src={p.url}
            alt={p.name}
            className="w-full h-full object-contain pointer-events-none"
            loading="lazy"
          />
        </div>
      ))}

      {/* 2. Medidor de Combos de Fuego (Esquina Inferior Derecha) */}
      {activeCombo && (
        <div
          className={`absolute bottom-20 right-6 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-gradient-to-r backdrop-blur-xl border-2 transform transition-transform duration-150 scale-100 animate-fade-in ${
            getComboStyle(activeCombo.count).bg
          }`}
        >
          <div className="relative shrink-0 flex items-center justify-center">
            <img
              src={activeCombo.url}
              alt={activeCombo.name}
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)] transform hover:scale-110 transition-transform"
            />
          </div>
          <div className="flex flex-col pr-1">
            <span className="text-[11px] uppercase tracking-widest font-black opacity-90 text-white text-shadow-sm">
              {getComboStyle(activeCombo.count).title}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-sm font-black px-2 py-0.5 rounded-lg shadow-md uppercase tracking-tight ${getComboStyle(activeCombo.count).badgeColor}`}>
                x{activeCombo.count}
              </span>
              <span className="text-xs font-bold text-white/90 truncate max-w-[140px]">
                {activeCombo.name}
              </span>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes floatUp {
          0% {
            transform: translate(-50%, 0) scale(0.6);
            opacity: 0;
          }
          15% {
            transform: translate(-50%, -40px) scale(1.15);
            opacity: 1;
          }
          80% {
            transform: translate(-50%, -240px) scale(1);
            opacity: 0.85;
          }
          100% {
            transform: translate(-50%, -320px) scale(0.8);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
