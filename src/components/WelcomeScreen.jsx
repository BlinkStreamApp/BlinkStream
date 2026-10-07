import PhosphorIcon from './icons/PhosphorIcon'
import BlinkStreamLogo from './BlinkStreamLogo'

const features = [
  ['MonitorPlay', 'Reproducción nativa'],
  ['ChatCircleDots', 'Chat con emotes'],
  ['CloudCheck', 'Favoritos en la nube'],
  ['Lightning', 'Notificaciones live'],
]

export default function WelcomeScreen({ authing = false }) {
  return (
    <section className="relative isolate mx-auto flex min-h-[65vh] max-w-3xl flex-col items-center justify-center px-3 py-12 text-center sm:py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden">
        <div className="h-80 w-80 rounded-full bg-twitch/[0.08] blur-3xl" />
      </div>
      <div aria-hidden="true" className="relative mb-8">
        <div className="absolute -inset-3 rounded-[32px] border border-twitch/10" />
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-twitch/30 bg-gradient-to-br from-twitch/20 to-twitch/5 text-twitch shadow-xl shadow-twitch/10">
          <BlinkStreamLogo size={64} />
        </div>
      </div>
      <h1 aria-label="Descubre BlinkStream" className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
        Descubre <span className="text-text-primary">Blink</span><span className="bg-gradient-to-r from-twitch to-fuchsia-400 bg-clip-text text-transparent font-bold">Stream</span>
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-text-secondary sm:text-base">
        Inicia sesión con Twitch para ver tus canales favoritos, seguidos y descubrir nuevo contenido.
      </p>
      <div className="mt-8 flex max-w-xl flex-wrap justify-center gap-2.5 sm:gap-3">
        {features.map(([icon, label]) => (
          <div key={label} className="flex items-center gap-2 rounded-full border border-twitch/15 bg-bg-secondary/70 px-3.5 py-2.5 text-xs font-medium text-text-secondary shadow-sm">
            <PhosphorIcon name={icon} size={16} className="text-twitch" />{label}
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-9 h-px w-24 bg-gradient-to-r from-transparent via-twitch/40 to-transparent" />
      <p role={authing ? 'status' : undefined} className="mt-5 max-w-sm text-xs leading-relaxed text-text-secondary">
        {authing ? 'Completa la conexión en el navegador. Esta pantalla se actualizará al terminar.' : <>
          Usa el botón <strong className="font-semibold text-twitch">Twitch</strong> en la esquina superior derecha para conectarte.
        </>}
      </p>
    </section>
  )
}
