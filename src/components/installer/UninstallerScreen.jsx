import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { BlinkStreamLogo } from '../BlinkStreamLogo'
import PhosphorIcon from '../icons/PhosphorIcon'
import { useT } from '../../utils/i18n'
import { isTauri } from '../../utils/tauriEnv'

export default function UninstallerScreen() {
  const t = useT()
  const [reasons, setReasons] = useState({
    web: false,
    features: false,
    bugs: false,
    reinstall: false
  })
  const [cleanData, setCleanData] = useState(false)
  const [status, setStatus] = useState('idle') // 'idle' | 'uninstalling' | 'success'
  const [progress, setProgress] = useState(0)

  const win = isTauri() ? getCurrentWindow() : null
  const handleClose = () => { try { win?.close() } catch { window.close() } }
  const handleMinimize = () => { try { win?.minimize() } catch { /* ignore */ } }

  const toggleReason = (key) => {
    setReasons(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const startUninstall = async () => {
    setStatus('uninstalling')
    setProgress(10)

    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 85) return 85
        return p + 20
      })
    }, 200)

    try {
      if (isTauri()) {
        await invoke('uninstall_blinkstream_custom', {
          removeData: cleanData
        })
      } else {
        await new Promise(r => setTimeout(r, 1200))
      }
      clearInterval(interval)
      setProgress(100)
      setTimeout(() => setStatus('success'), 300)
    } catch (err) {
      console.error(err)
      clearInterval(interval)
      // Aun en error intentamos mostrar mensaje al usuario
      setStatus('success')
    }
  }

  return (
    <div className="h-screen w-screen bg-bg-primary text-text-primary select-none overflow-hidden flex flex-col font-sans relative">
      {/* Fondo decorativo rojizo/púrpura difuminado */}
      <div className="absolute top-[-80px] right-[-80px] w-[350px] h-[350px] bg-red-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-80px] left-[-80px] w-[300px] h-[300px] bg-purple-600/10 rounded-full blur-[90px] pointer-events-none" />

      {/* Barra superior (arrastrable) */}
      <header data-tauri-drag-region className="flex items-center justify-between px-5 h-11 bg-bg-secondary/70 backdrop-blur-md border-b border-white/[0.05] shrink-0 relative z-50">
        <div className="flex items-center gap-2.5 pointer-events-none">
          <BlinkStreamLogo size={22} />
          <span className="text-xs font-extrabold tracking-wider uppercase text-text-primary/90">
            {t('uninst.title')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleMinimize} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer" data-tauri-drag-region="false" aria-label="Minimizar">
            <svg width="10" height="10" viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1" fill="currentColor"/></svg>
          </button>
          <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-white hover:bg-red-500/80 transition-colors cursor-pointer" data-tauri-drag-region="false" aria-label="Cerrar desinstalador">
            <svg width="10" height="10" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.3"/></svg>
          </button>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 flex flex-col items-center justify-between p-7 relative z-10 min-h-0">
        <div className="text-center w-full max-w-lg mb-2 animate-fade-in">
          <h1 className="text-xl font-extrabold tracking-tight text-white mb-1">
            {t('uninst.subtitle')} 💔
          </h1>
          <p className="text-xs text-text-muted">{t('uninst.question')}</p>
        </div>

        {status === 'success' ? (
          /* Pantalla de confirmación tras desinstalar */
          <div className="flex-1 w-full max-w-lg flex flex-col items-center justify-center text-center animate-scale-up py-4">
            <div className="w-16 h-16 rounded-2xl bg-twitch/10 border border-twitch/30 flex items-center justify-center mb-4 text-twitch">
              <PhosphorIcon name="HeartBreak" size={36} weight="duotone" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">{t('uninst.success.title')}</h2>
            <p className="text-xs text-text-muted/90 leading-relaxed max-w-md mb-6">
              {t('uninst.success.desc')}
            </p>
            <button
              onClick={handleClose}
              className="px-8 py-2.5 rounded-xl font-bold text-xs text-text-secondary bg-bg-secondary hover:bg-hover border border-white/10 cursor-pointer transition-colors"
            >
              {t('rec.drawer.close')}
            </button>
          </div>
        ) : (
          /* Vista con la pequeña encuesta y botón de desinstalación */
          <div className="w-full max-w-lg flex flex-col justify-between flex-1 gap-4 py-2">
            {/* Encuesta interactiva de despedida */}
            <div className="bg-bg-secondary/50 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 shadow-lg flex flex-col gap-2.5">
              <label onClick={() => toggleReason('web')} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.03] cursor-pointer transition-colors text-xs text-text-secondary">
                <input type="checkbox" checked={reasons.web} readOnly className="w-4 h-4 rounded text-red-500 focus:ring-0 bg-bg-primary border-bg-tertiary/60 pointer-events-none" />
                <span>{t('uninst.reason.web')}</span>
              </label>
              <label onClick={() => toggleReason('features')} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.03] cursor-pointer transition-colors text-xs text-text-secondary">
                <input type="checkbox" checked={reasons.features} readOnly className="w-4 h-4 rounded text-red-500 focus:ring-0 bg-bg-primary border-bg-tertiary/60 pointer-events-none" />
                <span>{t('uninst.reason.features')}</span>
              </label>
              <label onClick={() => toggleReason('bugs')} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.03] cursor-pointer transition-colors text-xs text-text-secondary">
                <input type="checkbox" checked={reasons.bugs} readOnly className="w-4 h-4 rounded text-red-500 focus:ring-0 bg-bg-primary border-bg-tertiary/60 pointer-events-none" />
                <span>{t('uninst.reason.bugs')}</span>
              </label>
              <label onClick={() => toggleReason('reinstall')} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.03] cursor-pointer transition-colors text-xs text-text-secondary">
                <input type="checkbox" checked={reasons.reinstall} readOnly className="w-4 h-4 rounded text-red-500 focus:ring-0 bg-bg-primary border-bg-tertiary/60 pointer-events-none" />
                <span>{t('uninst.reason.reinstall')}</span>
              </label>
            </div>

            <div className="flex flex-col gap-3 mt-auto">
              {status === 'idle' && (
                <label className="flex items-center gap-3 text-xs text-red-300/80 hover:text-red-300 cursor-pointer select-none px-2 transition-colors">
                  <input
                    type="checkbox"
                    checked={cleanData}
                    onChange={e => setCleanData(e.target.checked)}
                    className="w-4 h-4 rounded text-red-500 focus:ring-0 bg-bg-secondary border-red-500/40 cursor-pointer"
                  />
                  <span>{t('uninst.opt.clean_data')}</span>
                </label>
              )}

              {status === 'uninstalling' ? (
                <div className="w-full flex flex-col gap-2 py-2 animate-fade-in">
                  <div className="flex items-center justify-between text-xs text-text-secondary px-1">
                    <span className="flex items-center gap-2 font-medium">
                      <PhosphorIcon name="SpinnerGap" size={16} className="animate-spin text-red-400" />
                      {t('uninst.btn.uninstalling')}
                    </span>
                    <span className="font-mono font-bold text-red-400">{progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden p-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-red-600 to-rose-500 rounded-full transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={startUninstall}
                  className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-red-600/80 hover:bg-red-600 shadow-[0_5px_20px_rgba(220,38,38,0.3)] cursor-pointer transition-all hover:scale-[1.01] active:scale-98 flex items-center justify-center gap-2"
                >
                  <PhosphorIcon name="Trash" size={18} weight="bold" />
                  {t('uninst.btn.uninstall')}
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
