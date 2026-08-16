

import { useEffect, useState } from 'react'
import { BlinkStreamLogo } from './BlinkStreamLogo'
import { getVersion } from '@tauri-apps/api/app'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { validateProps } from '../utils/validateProps'
import { logError } from '../utils/errors'
import { isTauri } from '../utils/tauriEnv'
import PhosphorIcon from './icons/PhosphorIcon'
import { useT } from '../utils/i18n'
import { APP_VERSION } from '../utils/appVersion'

function CloseIcon() { return <PhosphorIcon name="X" size={18} weight="bold" /> }

function PayPalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z"/>
    </svg>
  )
}

export default function AboutDialog({ onClose }) {

  validateProps(
    { onClose },
    { onClose: { name: 'function', check: (v) => typeof v === 'function' } },
    'AboutDialog props',
  )

  const t = useT()
  const [appVersion, setAppVersion] = useState('...')
  const [updateStatus, setUpdateStatus] = useState({
    checking: false,
    installing: false,
    msg: '',
    isNew: false,
    error: false,
    updateObj: null,
  })

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch((err) => {
        logError(err, { component: 'AboutDialog', action: 'getVersion' })
        setAppVersion(APP_VERSION)
      })
  }, [])

  const handleCheckUpdate = async () => {
    if (!isTauri()) return
    setUpdateStatus({ checking: true, installing: false, msg: '', isNew: false, error: false, updateObj: null })
    try {
      const update = await check()
      if (update) {
        setUpdateStatus({
          checking: false,
          installing: false,
          msg: `¡Nueva versión v${update.version} disponible!`,
          isNew: true,
          error: false,
          updateObj: update,
        })
      } else {
        setUpdateStatus({
          checking: false,
          installing: false,
          msg: 'Tienes la versión más reciente ✓',
          isNew: false,
          error: false,
          updateObj: null,
        })
      }
    } catch (err) {
      logError(err, { component: 'AboutDialog', action: 'checkUpdate' })
      setUpdateStatus({
        checking: false,
        installing: false,
        msg: 'No se pudo comprobar la actualización',
        isNew: false,
        error: true,
        updateObj: null,
      })
    }
  }

  const handleInstallUpdate = async () => {
    if (!updateStatus.updateObj) return
    setUpdateStatus(prev => ({ ...prev, installing: true, msg: 'Descargando e instalando...' }))
    try {
      await updateStatus.updateObj.downloadAndInstall()
      await relaunch()
    } catch (err) {
      logError(err, { component: 'AboutDialog', action: 'installUpdate' })
      setUpdateStatus({
        checking: false,
        installing: false,
        msg: 'Error al instalar la actualización',
        isNew: false,
        error: true,
        updateObj: null,
      })
    }
  }

  useEffect(() => {
    const handleKey = (e) => { if (e.code === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div className="bg-bg-secondary/85 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_15px_50px_rgba(0,0,0,0.7)] w-full max-w-sm max-h-[calc(100vh-2.5rem)] overflow-y-auto transform transition-all animate-scale-up shrink-0" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
          <h2 className="text-sm font-bold text-text-primary">{t('aboutTitle', 'Acerca de BlinkStream')}</h2>
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

          <div className="flex flex-col items-center gap-2 mb-3">
            <span className="px-2.5 py-0.5 rounded-full bg-twitch/15 text-twitch text-[11px] font-semibold tracking-wide">
              v{appVersion}
            </span>

            {isTauri() && (
              <div className="flex flex-col items-center gap-1.5 mt-1">
                <button
                  onClick={handleCheckUpdate}
                  disabled={updateStatus.checking || updateStatus.installing}
                  className="px-3 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-text-secondary hover:text-white text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <PhosphorIcon
                    name={updateStatus.checking ? 'SpinnerGap' : 'ArrowsClockwise'}
                    size={13}
                    className={updateStatus.checking ? 'animate-spin' : ''}
                  />
                  <span>
                    {updateStatus.checking
                      ? 'Buscando actualizaciones...'
                      : updateStatus.installing
                      ? 'Instalando actualización...'
                      : 'Buscar actualizaciones'}
                  </span>
                </button>

                {updateStatus.msg && (
                  <p className={`text-[11px] font-medium animate-fade-in ${updateStatus.isNew ? 'text-green-400' : updateStatus.error ? 'text-red-400' : 'text-text-muted'}`}>
                    {updateStatus.msg}
                  </p>
                )}

                {updateStatus.updateObj && !updateStatus.installing && (
                  <button
                    onClick={handleInstallUpdate}
                    className="px-3.5 py-1 rounded-xl bg-green-500 hover:bg-green-600 text-white text-[11px] font-bold shadow-lg shadow-green-500/25 transition-all cursor-pointer animate-bounce-short"
                  >
                    Instalar v{updateStatus.updateObj.version} y reiniciar
                  </button>
                )}
              </div>
            )}
          </div>

          <p className="text-sm text-text-secondary leading-relaxed max-w-xs">
            {t('aboutDesc', 'Cliente ligero de Twitch sin anuncios. Transmisiones limpias, rápidas y sin interrupciones.')}
          </p>

          <a
            href="https://paypal.me/AlbertPlayX"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0070ba]/10 text-[#0070ba] hover:bg-[#0070ba]/20 text-[13px] font-medium transition-all cursor-pointer"
          >
            <PayPalIcon />
            {t('aboutCoffee', 'Invitar a un café')}
          </a>

          <div className="mt-6 w-full border-t border-bg-tertiary/50 pt-4 text-[12px] text-text-muted/60">
            <p>&copy; 2026 BlinkStream Team</p>
          </div>

          <div className="mt-3 flex gap-3 text-[12px]">
            <span className="text-twitch/70">{t('aboutMadeWith', 'Hecho con ♥ para la comunidad')}</span>
          </div>

          {}
          <p className="text-text-muted/60 text-[10px] mt-4">
            Animated icons by{' '}
            <a
              href="https://lordicon.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-twitch"
            >
              Lordicon
            </a>
            {' '}(Free for commercial use)
          </p>
        </div>
      </div>
    </div>
  )
}
