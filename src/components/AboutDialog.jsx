

import { useEffect, useState } from 'react'
import { BlinkStreamLogo } from './BlinkStreamLogo'
import { getVersion } from '@tauri-apps/api/app'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { validateProps } from '../utils/validateProps'
import { logError } from '../utils/errors'
import { isTauri, safeOpenUrl } from '../utils/tauriEnv'
import PhosphorIcon from './icons/PhosphorIcon'
import { useT } from '../utils/i18n'
import { APP_VERSION } from '../utils/appVersion'
import { IS_STORE_BUILD } from '../utils/distribution'
import storeRuntimeNotices from '../../src-tauri/msix/THIRD_PARTY.txt?raw'

function CloseIcon() { return <PhosphorIcon name="X" size={18} weight="bold" /> }

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
    if (!isTauri() || IS_STORE_BUILD) return
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
    if (IS_STORE_BUILD || !updateStatus.updateObj) return
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

            {isTauri() && !IS_STORE_BUILD && (
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
            href="https://ko-fi.com/apxstudio"
            target="_blank"
            rel="noopener noreferrer"
            onClick={event => { event.preventDefault(); safeOpenUrl(event.currentTarget.href) }}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#ff5e5b]/10 px-4 py-2 text-[13px] font-medium text-[#ff5e5b] transition-all hover:bg-[#ff5e5b]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5e5b]"
          >
            <span aria-hidden="true"><PhosphorIcon name="Heart" size={16} weight="fill" /></span>
            {t('aboutCoffee', 'Invitar a un café')}
          </a>

          <div className="mt-4 flex w-full flex-wrap justify-center gap-2">
            {[
              { href: 'https://apxstudio.es/', icon: 'GlobeHemisphereWest', label: t('about.website', 'Web oficial') },
              { href: 'mailto:contacto.apxstudio@gmail.com', icon: 'ChatCircleDots', label: t('about.support', 'Soporte') },
            ].map(({ href, icon, label }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={event => { event.preventDefault(); safeOpenUrl(href) }}
                className="inline-flex min-h-10 max-w-full items-center justify-center gap-2 rounded-xl border border-twitch/20 bg-twitch/5 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-twitch/50 hover:bg-twitch/10 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-twitch"
              >
                <span aria-hidden="true" className="shrink-0 text-twitch-light"><PhosphorIcon name={icon} size={16} /></span>
                <span className="min-w-0 break-words">{label}</span>
              </a>
            ))}
          </div>

          <div className="mt-6 w-full border-t border-bg-tertiary/50 pt-4 text-[12px] text-text-muted/60">
            <p>&copy; 2026 APX Studio</p>
          </div>

          <div className="mt-3 flex gap-3 text-[12px]">
            <span className="text-twitch/70">{t('aboutMadeWith', 'Hecho con ♥ para la comunidad')}</span>
          </div>

          {IS_STORE_BUILD && (
            <details className="mt-4 w-full rounded-xl border border-white/10 p-3 text-left text-xs text-text-secondary">
              <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-twitch">Streamlink · Python · FFmpeg</summary>
              <pre className="mt-3 max-h-52 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed">{storeRuntimeNotices}</pre>
              <a href="https://github.com/BlinkStreamApp/BlinkStream/releases/download/v1.5.0/BlinkStream-1.5.0-runtime-sources.zip" onClick={event => { event.preventDefault(); safeOpenUrl(event.currentTarget.href) }} className="mt-3 inline-block rounded text-twitch-light underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-twitch">{t('about.runtimeSources', 'Código fuente del runtime (2,12 GB)')}</a>
            </details>
          )}
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
