import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { BlinkStreamLogo } from '../BlinkStreamLogo'
import PhosphorIcon from '../icons/PhosphorIcon'
import { useT } from '../../utils/i18n'
import { isTauri } from '../../utils/tauriEnv'

export default function InstallerScreen() {
  const t = useT()
  const [activeSlide, setActiveSlide] = useState(0)
  const [desktopShortcut, setDesktopShortcut] = useState(true)
  const [startMenuShortcut, setStartMenuShortcut] = useState(true)
  const [autoLaunch, setAutoLaunch] = useState(true)
  const [status, setStatus] = useState('idle') // 'idle' | 'installing' | 'success' | 'error'
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [installDir, setInstallDir] = useState('C:\\Users\\Usuario\\AppData\\Local\\Programs\\BlinkStream')

  useEffect(() => {
    if (isTauri()) {
      invoke('get_default_install_dir')
        .then(res => res && setInstallDir(res))
        .catch(console.error)
    }
  }, [])

  const handleBrowse = async () => {
    if (!isTauri()) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Seleccionar carpeta de instalación',
        defaultPath: installDir
      })
      if (selected && typeof selected === 'string') {
        let path = selected
        if (!path.toLowerCase().endsWith('blinkstream')) {
          const separator = path.includes('/') && !path.includes('\\') ? '/' : '\\'
          path = path.endsWith(separator) ? `${path}BlinkStream` : `${path}${separator}BlinkStream`
        }
        setInstallDir(path)
      }
    } catch (err) {
      console.error('Error seleccionando carpeta:', err)
    }
  }

  const win = isTauri() ? getCurrentWindow() : null
  const handleClose = () => { try { win?.close() } catch { window.close() } }
  const handleMinimize = () => { try { win?.minimize() } catch { /* ignore */ } }

  const slides = [
    {
      icon: 'Lightning',
      color: 'from-amber-400 to-orange-500',
      title: t('inst.feat1.title'),
      desc: t('inst.feat1.desc')
    },
    {
      icon: 'Record',
      color: 'from-red-400 to-rose-600',
      title: t('inst.feat2.title'),
      desc: t('inst.feat2.desc')
    },
    {
      icon: 'Coins',
      color: 'from-fuchsia-400 to-twitch',
      title: t('inst.feat3.title'),
      desc: t('inst.feat3.desc')
    }
  ]

  useEffect(() => {
    if (status !== 'idle') return
    const timer = setInterval(() => {
      setActiveSlide(s => (s + 1) % slides.length)
    }, 4500)
    return () => clearInterval(timer)
  }, [status, slides.length])

  const startInstall = async () => {
    setStatus('installing')
    setProgress(5)

    // Simulamos avance fluido visual para una experiencia de usuario premium
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 90) return 90
        return p + Math.floor(Math.random() * 15) + 5
      })
    }, 150)

    try {
      if (isTauri()) {
        await invoke('install_blinkstream_custom', {
          desktopShortcut,
          startMenuShortcut,
          targetDir: installDir,
          target_dir: installDir
        })
      } else {
        // En navegador de test/dev esperamos 1.5s
        await new Promise(r => setTimeout(r, 1500))
      }
      clearInterval(interval)
      setProgress(100)
      setTimeout(() => setStatus('success'), 300)
    } catch (err) {
      clearInterval(interval)
      setStatus('error')
      setErrorMessage(typeof err === 'string' ? err : err?.message || 'Error desconocido durante la instalación')
    }
  }

  const handleLaunch = async () => {
    if (isTauri()) {
      try {
        await invoke('launch_installed_app_and_exit', {
          targetDir: installDir,
          target_dir: installDir
        })
      } catch (err) {
        console.error(err)
        handleClose()
      }
    } else {
      handleClose()
    }
  }

  return (
    <div className="h-screen w-screen bg-bg-primary text-text-primary select-none overflow-hidden flex flex-col font-sans relative">
      {/* Fondo decorativo con neón púrpura difumindo */}
      <div className="absolute top-[-100px] left-[-100px] w-[380px] h-[380px] bg-twitch/20 rounded-full blur-[110px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[-100px] right-[-100px] w-[350px] h-[350px] bg-purple-600/15 rounded-full blur-[100px] pointer-events-none" />

      {/* Barra superior personalizada (arrastrable) */}
      <header data-tauri-drag-region className="flex items-center justify-between px-5 h-11 bg-bg-secondary/70 backdrop-blur-md border-b border-white/[0.05] shrink-0 relative z-50">
        <div className="flex items-center gap-2.5 pointer-events-none">
          <BlinkStreamLogo size={22} />
          <span className="text-xs font-extrabold tracking-wider uppercase text-text-primary/90">
            {t('inst.title')} <span className="text-[10px] text-twitch font-mono ml-1 px-1.5 py-0.5 bg-twitch/10 rounded border border-twitch/20">v1.2.0</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleMinimize} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer" data-tauri-drag-region="false" aria-label="Minimizar">
            <svg width="10" height="10" viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1" fill="currentColor"/></svg>
          </button>
          <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-white hover:bg-red-500/80 transition-colors cursor-pointer" data-tauri-drag-region="false" aria-label="Cerrar instalador">
            <svg width="10" height="10" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.3"/></svg>
          </button>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 flex flex-col items-center justify-between p-7 relative z-10 min-h-0">
        {/* Cabecera de bienvenida */}
        <div className="text-center w-full max-w-lg mb-2 animate-fade-in">
          <h1 className="text-2xl font-extrabold tracking-tight mb-1.5">
            <span className="text-white">Blink</span>
            <span className="bg-gradient-to-r from-twitch via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">Stream</span>
          </h1>
          <p className="text-xs text-text-muted">{t('inst.subtitle')}</p>
        </div>

        {status === 'success' ? (
          /* Pantalla de celebración por instalación exitosa */
          <div className="flex-1 w-full max-w-lg flex flex-col items-center justify-center text-center animate-scale-up py-4">
            <div className="w-20 h-20 rounded-2xl bg-green-500/10 border border-green-500/30 flex items-center justify-center mb-4 text-green-400 shadow-[0_0_40px_rgba(34,197,94,0.25)] animate-bounce">
              <PhosphorIcon name="CheckCircle" size={48} weight="duotone" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">{t('inst.success.title')}</h2>
            <p className="text-xs text-text-muted/90 leading-relaxed max-w-md mb-8">
              {t('inst.success.desc')}
            </p>
            <button
              onClick={handleLaunch}
              className="w-full sm:w-80 py-3.5 px-6 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-twitch via-purple-600 to-fuchsia-600 hover:brightness-110 shadow-[0_5px_25px_rgba(145,70,255,0.4)] cursor-pointer transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
            >
              {t('inst.btn.launch')}
            </button>
          </div>
        ) : (
          /* Vista normal de carrusel y opciones de instalación */
          <>
            {/* Carrusel de ventajas interactivo */}
            <div className="w-full max-w-lg bg-bg-secondary/60 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-5 shadow-2xl flex flex-col justify-between transition-all">
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${slides[activeSlide].color} p-0.5 shadow-lg flex shrink-0 items-center justify-center`}>
                  <div className="w-full h-full bg-bg-primary/90 rounded-[10px] flex items-center justify-center text-white">
                    <PhosphorIcon name={slides[activeSlide].icon} size={26} weight="duotone" />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white transition-opacity duration-300">{slides[activeSlide].title}</h3>
                  <p className="text-[11px] text-text-muted leading-relaxed mt-0.5">{slides[activeSlide].desc}</p>
                </div>
              </div>

              {/* Indicadores de diapositiva */}
              <div className="flex items-center justify-center gap-2 mt-2">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveSlide(idx)}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${idx === activeSlide ? 'w-6 bg-twitch shadow-[0_0_8px_rgba(145,70,255,0.6)]' : 'w-1.5 bg-white/20 hover:bg-white/40'}`}
                    aria-label={`Ver ventaja ${idx + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* Opciones de instalación y progreso */}
            <div className="w-full max-w-lg flex flex-col gap-3 mt-2">
              {status === 'idle' && (
                <div className="flex flex-col gap-2.5 px-2">
                  <div className="flex flex-col gap-1 mb-0.5">
                    <label className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider select-none">
                      {t('inst.path.label')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={installDir}
                        onChange={e => setInstallDir(e.target.value)}
                        placeholder="Ruta de instalación..."
                        className="flex-1 px-3 py-1.5 bg-bg-secondary/90 border border-white/10 rounded-lg text-xs font-mono text-text-primary focus:outline-none focus:border-twitch/60 transition-colors truncate shadow-inner"
                      />
                      <button
                        type="button"
                        onClick={handleBrowse}
                        className="px-3 py-1.5 bg-bg-secondary hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-xs font-medium text-text-secondary hover:text-white flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-sm"
                      >
                        <PhosphorIcon name="Folder" size={15} weight="duotone" className="text-twitch" />
                        <span>{t('inst.path.browse')}</span>
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-3 text-xs text-text-secondary hover:text-white cursor-pointer select-none transition-colors">
                    <input
                      type="checkbox"
                      checked={desktopShortcut}
                      onChange={e => setDesktopShortcut(e.target.checked)}
                      className="w-4 h-4 rounded text-twitch focus:ring-0 bg-bg-secondary border-bg-tertiary/60 cursor-pointer"
                    />
                    <span>{t('inst.opt.desktop')}</span>
                  </label>
                  <label className="flex items-center gap-3 text-xs text-text-secondary hover:text-white cursor-pointer select-none transition-colors">
                    <input
                      type="checkbox"
                      checked={startMenuShortcut}
                      onChange={e => setStartMenuShortcut(e.target.checked)}
                      className="w-4 h-4 rounded text-twitch focus:ring-0 bg-bg-secondary border-bg-tertiary/60 cursor-pointer"
                    />
                    <span>{t('inst.opt.start')}</span>
                  </label>
                </div>
              )}

              {status === 'installing' && (
                <div className="w-full flex flex-col gap-2 py-2 animate-fade-in">
                  <div className="flex items-center justify-between text-xs text-text-secondary px-1">
                    <span className="flex items-center gap-2 font-medium">
                      <PhosphorIcon name="SpinnerGap" size={16} className="animate-spin text-twitch" />
                      {t('inst.btn.installing')}
                    </span>
                    <span className="font-mono font-bold text-twitch">{progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden p-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-twitch to-fuchsia-500 rounded-full transition-all duration-200 shadow-[0_0_12px_rgba(145,70,255,0.8)]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {status === 'error' && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-center gap-2.5 animate-shake">
                  <PhosphorIcon name="WarningCircle" size={20} className="shrink-0 text-red-400" />
                  <span className="flex-1 truncate">{errorMessage || 'Ocurrió un error al instalar.'}</span>
                  <button onClick={() => setStatus('idle')} className="text-white font-bold underline cursor-pointer px-2">{t('retry')}</button>
                </div>
              )}

              {status === 'idle' && (
                <button
                  onClick={startInstall}
                  className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-twitch to-purple-600 hover:from-twitch-dark hover:to-purple-700 shadow-[0_5px_25px_rgba(145,70,255,0.35)] cursor-pointer transition-all hover:scale-[1.01] active:scale-98 flex items-center justify-center gap-2"
                >
                  <PhosphorIcon name="DownloadSimple" size={18} weight="bold" />
                  {t('inst.btn.install')}
                </button>
              )}
            </div>
          </>
        )}
      </main>

      {/* Pie con nota de licencia */}
      <footer className="py-2.5 px-6 text-center border-t border-white/[0.04] text-[10px] text-text-muted/60 bg-bg-secondary/40 shrink-0">
        &copy; 2026 BlinkStream Team. Todos los derechos reservados. No afiliado directamente a Twitch Interactive, Inc.
      </footer>
    </div>
  )
}
