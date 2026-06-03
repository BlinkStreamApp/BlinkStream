import { useState } from 'react'
import { BlinkStreamLogo } from './BlinkStreamLogo'

const SLIDES = [
  {
    icon: (
      <div className="w-20 h-20 rounded-2xl bg-twitch/10 flex items-center justify-center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" className="text-twitch">
          <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.428l-3 3v-3H6.857V1.714h13.714z"/>
        </svg>
      </div>
    ),
    title: 'Bienvenido a BlinkStream',
    subtitle: 'Cliente de Twitch ultrarrápido, sin anuncios y de código abierto.',
    features: ['Streams sin interrupciones ni publicidad', 'Interfaz nativa y fluida', 'Totalmente gratuito y open source'],
  },
  {
    icon: (
      <div className="w-20 h-20 rounded-2xl bg-yellow-400/10 flex items-center justify-center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-yellow-400">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
        </svg>
      </div>
    ),
    title: 'Tus favoritos, en la nube',
    subtitle: 'Conecta tu cuenta de Twitch y sincroniza automáticamente todos tus canales favoritos y seguidos.',
    features: ['Sincronización instantánea en la nube', 'Importa automáticamente tus follows', 'Disponible en todos tus dispositivos'],
  },
  {
    icon: (
      <div className="w-20 h-20 rounded-2xl bg-green-400/10 flex items-center justify-center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-green-400">
          <path d="M20 14.5A2.5 2.5 0 0 1 17.5 17H7l-4 4V5.5A2.5 2.5 0 0 1 5.5 3h12A2.5 2.5 0 0 1 20 5.5z"/>
        </svg>
      </div>
    ),
    title: 'Chat con superpoderes',
    subtitle: 'Todos los emotes que conoces: 7TV, BTTV y FFZ. Búsqueda rápida y menú interactivo.',
    features: ['7TV + BetterTTV + FrankerFaceZ', 'Menú de emotes con buscador', 'Atajos de teclado para todo'],
  },
  {
    icon: (
      <div className="w-20 h-20 rounded-2xl bg-red-400/10 flex items-center justify-center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-red-400">
          <path d="M22 12A10 10 0 1 1 12 2"/><path d="M12 6v6l4 2"/>
        </svg>
      </div>
    ),
    title: 'Notificaciones en vivo',
    subtitle: 'Recibe alertas cuando tus streamers favoritos empiezan a transmitir. No te pierdas ni un directo.',
    features: ['Alertas en tiempo real', 'Click para abrir el stream al instante', 'Actualización cada 30 segundos'],
  },
]

export default function Onboarding({ onFinish }) {
  const [slide, setSlide] = useState(0)

  const next = () => {
    if (slide < SLIDES.length - 1) setSlide(s => s + 1)
    else onFinish()
  }

  return (
    <div className="fixed inset-0 z-[100] bg-bg-primary flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-twitch/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-yellow-400/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-green-400/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 w-full max-w-lg mx-6">
        <div className="flex items-center justify-center gap-3 mb-10">
          <BlinkStreamLogo size={40} />
          <span className="text-xl font-extrabold text-text-primary tracking-tight">BlinkStream</span>
        </div>

        <div className="flex justify-center gap-2 mb-10">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                i === slide ? 'w-8 bg-twitch' : 'w-2 bg-bg-tertiary hover:bg-text-muted/50'
              }`}
            />
          ))}
        </div>

        <div className="bg-bg-secondary/80 backdrop-blur-sm border border-bg-tertiary/60 rounded-3xl p-10 text-center shadow-2xl shadow-black/20" key={`card-${slide}`}>
          <div className="mb-6 flex justify-center animate-fade-in">
            {SLIDES[slide].icon}
          </div>
          <h2 className="text-white text-2xl font-extrabold mb-3 tracking-tight animate-slide-up">
            {SLIDES[slide].title}
          </h2>
          <p className="text-text-secondary text-[15px] leading-relaxed mb-8 animate-slide-up">
            {SLIDES[slide].subtitle}
          </p>
          <div className="space-y-3 mb-2">
            {SLIDES[slide].features.map((f, i) => (
              <div key={i} className="flex items-center justify-center gap-3 text-[14px] text-text-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-twitch/60 shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center items-center gap-4 mt-8">
          {slide < SLIDES.length - 1 ? (
            <>
              <button onClick={onFinish} className="px-5 py-2.5 text-[14px] text-text-muted hover:text-text-primary cursor-pointer transition-colors">
                Saltar
              </button>
              <button onClick={next} className="px-8 py-3 rounded-xl bg-twitch hover:bg-twitch-dark text-white text-[14px] font-semibold cursor-pointer transition-all btn-press shadow-lg shadow-twitch/20">
                Siguiente →
              </button>
            </>
          ) : (
            <button onClick={onFinish} className="px-10 py-3.5 rounded-xl bg-twitch hover:bg-twitch-dark text-white text-[15px] font-bold cursor-pointer transition-all btn-press shadow-xl shadow-twitch/30">
              🚀 Comenzar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
