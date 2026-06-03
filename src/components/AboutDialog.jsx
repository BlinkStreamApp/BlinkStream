import { useEffect } from 'react'
import { BlinkStreamLogo } from './BlinkStreamLogo'

function CloseIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg> }

export default function AboutDialog({ onClose }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.code === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-bg-secondary/80 backdrop-blur-md border border-bg-tertiary/50 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-bg-tertiary/50">
          <h2 className="text-sm font-bold text-text-primary">Acerca de BlinkStream</h2>
          <button onClick={onClose} className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer transition-colors">
            <CloseIcon />
          </button>
        </div>

        <div className="px-5 py-6 flex flex-col items-center text-center">
          <div className="flex flex-col items-center gap-2 mb-4">
            <BlinkStreamLogo size={48} />
            <span className="text-lg font-extrabold tracking-tight">
              <span className="text-text-primary">Blink</span>
              <span className="bg-gradient-to-r from-twitch to-fuchsia-400 bg-clip-text text-transparent font-bold">Stream</span>
            </span>
          </div>

          <p className="text-sm text-text-secondary leading-relaxed max-w-xs">
            Cliente ligero de Twitch sin anuncios.
            Transmisiones limpias, rápidas y sin interrupciones.
          </p>

          <div className="mt-6 w-full border-t border-bg-tertiary/50 pt-4 text-[12px] text-text-muted/60">
            <p>&copy; 2026 BlinkStream Team</p>
          </div>

          <div className="mt-4 flex gap-3 text-[12px]">
            <span className="text-twitch/70">Hecho con ♥ para la comunidad</span>
          </div>
        </div>
      </div>
    </div>
  )
}
