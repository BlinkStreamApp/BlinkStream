import { useState, useEffect } from 'react'
import { BlinkStreamLogo } from './BlinkStreamLogo'
import { 
  RocketLaunch, 
  DeviceMobile, 
  Sparkle, 
  VideoCamera, 
  CloudCheck, 
  CheckCircle, 
  ArrowRight, 
  ArrowLeft,
  Smiley, 
  Broadcast,
  ShieldCheck,
  Lightning,
  MonitorPlay
} from '@phosphor-icons/react'

const SLIDES = [
  {
    badge: '✨ v1.3.1-a EDICIÓN DEFINITIVA',
    badgeClass: 'from-fuchsia-500/20 to-purple-500/20 text-fuchsia-300 border-fuchsia-500/30',
    glowClass: 'from-fuchsia-600/20 via-purple-600/20 to-transparent',
    accentColor: 'text-fuchsia-400',
    buttonGradient: 'from-purple-600 via-fuchsia-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-fuchsia-500/30',
    icon: (
      <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-tr from-purple-600/30 via-fuchsia-600/20 to-pink-500/30 border border-fuchsia-500/40 flex items-center justify-center shadow-2xl shadow-fuchsia-500/20 transform hover:scale-105 transition-transform">
        <RocketLaunch size={44} weight="duotone" className="text-fuchsia-400 drop-shadow-[0_2px_10px_rgba(232,79,240,0.5)] animate-bounce-short" />
        <span className="absolute -top-1 -right-1 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fuchsia-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-fuchsia-500"></span>
        </span>
      </div>
    ),
    title: 'Bienvenido a la Nueva Era',
    subtitle: 'BlinkStream v1.3.1-a redefine tu forma de vivir los directos de Twitch con un rendimiento nativo fulminante y sin publicidad.',
    features: [
      'Reproducción en Alta Definición (1080p60 / 2K) fluida y sin anuncios ni cortes',
      'Motor nativo en Rust & React optimizado para mínimo consumo de RAM',
      '100% gratuito, privado, sin rastreadores y de código abierto',
    ],
  },
  {
    badge: '📱 NOVEDAD V1.3.1-a: CONTROL LAN & FX',
    badgeClass: 'from-cyan-500/20 to-teal-500/20 text-cyan-300 border-cyan-500/30',
    glowClass: 'from-cyan-500/20 via-teal-500/20 to-transparent',
    accentColor: 'text-cyan-400',
    buttonGradient: 'from-cyan-500 via-teal-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 shadow-cyan-500/30 text-black font-black',
    icon: (
      <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-tr from-cyan-600/30 via-teal-500/20 to-emerald-500/30 border border-cyan-500/40 flex items-center justify-center shadow-2xl shadow-cyan-500/20 transform hover:scale-105 transition-transform">
        <DeviceMobile size={44} weight="duotone" className="text-cyan-400 drop-shadow-[0_2px_10px_rgba(6,182,212,0.5)] animate-pulse" />
      </div>
    ),
    title: 'Mando a Distancia Wi-Fi Móvil',
    subtitle: 'Controla tu stream desde la palma de tu mano conectando tu teléfono o tablet a tu red local sin instalar ninguna app externa.',
    features: [
      'Escanea el código QR desde tu móvil en la misma red Wi-Fi LAN',
      'Ajusta volumen, pausa, cambia canales y escribe en el chat del PC',
      'Servidor local cifrado, privado y protegido mediante código PIN',
    ],
  },
  {
    badge: '🔥 CHAT PRO & EMOTES 3ª PARTE',
    badgeClass: 'from-amber-500/20 to-rose-500/20 text-amber-300 border-amber-500/30',
    glowClass: 'from-amber-500/20 via-orange-500/20 to-transparent',
    accentColor: 'text-amber-400',
    buttonGradient: 'from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 shadow-amber-500/30 text-black font-black',
    icon: (
      <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-tr from-amber-600/30 via-orange-500/20 to-rose-500/30 border border-amber-500/40 flex items-center justify-center shadow-2xl shadow-amber-500/20 transform hover:scale-105 transition-transform">
        <Sparkle size={44} weight="duotone" className="text-amber-400 drop-shadow-[0_2px_10px_rgba(245,158,11,0.5)]" />
      </div>
    ),
    title: 'Lluvia de Emotes & Combos',
    subtitle: 'El chat cobra vida en pantalla con animaciones fluidas de lluvia y un medidor ardiente de combos para las mejores reacciones.',
    features: [
      'Soporte completo y universal para 7TV, BetterTTV (BTTV) y FrankerFaceZ',
      'Lluvia de emotes flotantes en pantalla y medidor ardiente de Combos',
      'Buscador instantáneo de emotes y atajos para moderación en un clic',
    ],
  },
  {
    badge: '🎬 POTENCIA AUDIOVISUAL',
    badgeClass: 'from-rose-500/20 to-red-500/20 text-rose-300 border-rose-500/30',
    glowClass: 'from-rose-600/20 via-red-600/20 to-transparent',
    accentColor: 'text-rose-400',
    buttonGradient: 'from-rose-600 via-red-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 shadow-rose-500/30',
    icon: (
      <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-tr from-rose-600/30 via-red-500/20 to-amber-500/30 border border-rose-500/40 flex items-center justify-center shadow-2xl shadow-rose-500/20 transform hover:scale-105 transition-transform">
        <VideoCamera size={44} weight="duotone" className="text-rose-400 drop-shadow-[0_2px_10px_rgba(244,63,94,0.5)]" />
      </div>
    ),
    title: 'Grabación HD & Multi-Stream',
    subtitle: 'No te conformes con ver una sola pantalla y guarda en tu disco duro los momentos más memorables con solo pulsar el botón REC.',
    features: [
      'Graba clips en directo en alta definición sin compresión ni pérdida',
      'Grid Multi-Stream para ver hasta 4 canales en simultáneo sin lag',
      'Modos Solo Audio y Compacto para escuchar de fondo mientras juegas',
    ],
  },
  {
    badge: '☁️ CONECTIVIDAD RESILIENTE',
    badgeClass: 'from-indigo-500/20 to-violet-500/20 text-indigo-300 border-indigo-500/30',
    glowClass: 'from-indigo-600/20 via-violet-600/20 to-transparent',
    accentColor: 'text-indigo-400',
    buttonGradient: 'from-indigo-600 via-purple-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 shadow-indigo-500/30',
    icon: (
      <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-tr from-indigo-600/30 via-violet-500/20 to-fuchsia-500/30 border border-indigo-500/40 flex items-center justify-center shadow-2xl shadow-indigo-500/20 transform hover:scale-105 transition-transform">
        <CloudCheck size={44} weight="duotone" className="text-indigo-400 drop-shadow-[0_2px_10px_rgba(129,140,248,0.5)]" />
      </div>
    ),
    title: 'Sincronización en la Nube',
    subtitle: 'Conecta tu cuenta de Twitch para sincronizar tus favoritos al instante, con protección de respaldo si fallan los servidores.',
    features: [
      'Sincroniza en la nube y en tiempo real tus canales seguidos y favoritos',
      'Modo Offline inteligente que garantiza tu acceso ante caídas de red',
      'Alertas de inicio de stream directas a tu escritorio cada 30 segundos',
    ],
  },
]

export default function Onboarding({ onFinish }) {
  const [slide, setSlide] = useState(0)
  const current = SLIDES[slide]

  const next = () => {
    if (slide < SLIDES.length - 1) setSlide(s => s + 1)
    else onFinish()
  }

  const prev = () => {
    if (slide > 0) setSlide(s => s - 1)
  }

  // Soporte para navegación con teclado (Flechas, Enter, Escape)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prev()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onFinish()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [slide, onFinish])

  return (
    <div className="fixed inset-0 z-[99999] bg-[#090a0f]/95 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-6 animate-fade-in font-sans select-none overflow-y-auto">
      {/* Orbes de luz atmosféricos de fondo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-[120px] transition-all duration-700 opacity-25 bg-gradient-to-r ${current.glowClass}`} />
        <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-[120px] transition-all duration-700 opacity-20 bg-gradient-to-l ${current.glowClass}`} />
      </div>

      <div className="relative z-10 w-full max-w-2xl mx-auto my-auto flex flex-col items-center">
        
        {/* Cabecera superior: Logo & Nombre */}
        <div className="flex items-center justify-center gap-3 mb-6 sm:mb-8 animate-fade-in">
          <div className="p-2 rounded-2xl bg-gradient-to-tr from-purple-600 to-fuchsia-600 shadow-xl shadow-purple-500/20">
            <BlinkStreamLogo size={36} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent tracking-tight">
                BlinkStream
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30">
                v1.3.1-a
              </span>
            </div>
            <p className="text-xs font-semibold text-text-muted">Cliente Nativo Ultra Fluido & Open-Source</p>
          </div>
        </div>

        {/* Indicadores de Paso (Pills interactivas) */}
        <div className="flex items-center justify-center gap-2 mb-6 w-full max-w-xs">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                i === slide ? 'w-12 bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-purple-500 shadow-lg shadow-fuchsia-500/40' : 'w-2.5 bg-white/10 hover:bg-white/30'
              }`}
              title={`Paso ${i + 1} de ${SLIDES.length}`}
            />
          ))}
        </div>

        {/* Tarjeta Glassmorfica Principal */}
        <div className="w-full bg-gradient-to-b from-[#141622]/90 via-[#10121a]/95 to-[#0b0c12]/95 backdrop-blur-3xl border border-white/15 rounded-3xl p-6 sm:p-10 shadow-[0_20px_60px_rgba(0,0,0,0.8)] relative overflow-hidden transition-all duration-300">
          
          {/* Brillo superior en la tarjeta */}
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          
          {/* Contenido dinámico de la diapositiva */}
          <div key={`slide-content-${slide}`} className="flex flex-col items-center text-center animate-fade-in">
            
            {/* Insignia superior del slide */}
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold px-3.5 py-1 rounded-full border mb-6 uppercase tracking-wider shadow-inner ${current.badgeClass}`}>
              {current.badge}
            </span>

            {/* Icono central con efecto glow */}
            <div className="mb-6 flex justify-center">
              {current.icon}
            </div>

            {/* Título y Subtítulo */}
            <h2 className="text-white text-2xl sm:text-3xl font-black mb-3 tracking-tight">
              {current.title}
            </h2>
            <p className="text-white/70 text-sm sm:text-[15px] leading-relaxed max-w-lg mb-8 font-medium">
              {current.subtitle}
            </p>

            {/* Lista de características y ventajas de la versión */}
            <div className="w-full max-w-md space-y-3.5 bg-white/[0.03] border border-white/5 p-4 sm:p-5 rounded-2xl text-left shadow-inner mb-2">
              {current.features.map((f, i) => (
                <div key={i} className="flex items-center gap-3 text-xs sm:text-[14px] text-white/90 font-medium">
                  <div className={`p-1 rounded-full bg-white/10 shrink-0 ${current.accentColor}`}>
                    <CheckCircle size={16} weight="fill" />
                  </div>
                  <span className="leading-snug">{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Botones de Navegación y Acción al pie de la tarjeta */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 pt-6 border-t border-white/10">
            <div className="flex items-center gap-3 order-2 sm:order-1">
              <button 
                onClick={onFinish} 
                className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white/50 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
              >
                Saltar introducción
              </button>
              {slide > 0 && (
                <button
                  onClick={prev}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <ArrowLeft size={16} weight="bold" /> Anterior
                </button>
              )}
            </div>

            <button 
              onClick={next} 
              className={`w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r text-white text-sm sm:text-[15px] font-extrabold cursor-pointer transition-all hover:scale-105 shadow-xl flex items-center justify-center gap-2 order-1 sm:order-2 ${current.buttonGradient}`}
            >
              {slide < SLIDES.length - 1 ? (
                <>Siguiente <ArrowRight size={18} weight="bold" /></>
              ) : (
                <>🚀 Comenzar Experiencia</>
              )}
            </button>
          </div>

        </div>

        {/* Pie de página sutil con atajos de teclado */}
        <p className="mt-5 text-[11px] font-medium text-white/40 text-center flex items-center justify-center gap-2">
          <span>💡 <strong className="text-white/60">Atajos de teclado:</strong> Flechas para navegar | Enter para siguiente | Esc para salir</span>
        </p>

      </div>
    </div>
  )
}
