import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import ChannelSearch from './components/ChannelSearch'
import StreamInfo from './components/StreamInfo'
import ConfirmDialog from './components/ConfirmDialog'
import PhosphorIcon from './components/icons/PhosphorIcon'
import DiskSpaceIndicator from './components/recording/DiskSpaceIndicator'

import { RecordingProvider } from './components/recording/RecordingContext'
import { BlinkStreamLogo } from './components/BlinkStreamLogo'
import { getUserIdByLogin, validateToken, clearStoredToken, getHeaders, getHelixClientId } from './utils/twitch'
import { applyStoredHslTheme, applyStoredCustomFont, applyStoredCustomIconStyle } from './utils/hslTheme'

const VideoPlayer = lazy(() => import('./components/VideoPlayer'))
const Chat = lazy(() => import('./components/Chat'))
const MultiStreamGrid = lazy(() => import('./components/multistream/MultiStreamGrid'))
const CompanionModal = lazy(() => import('./components/CompanionModal'))
const HomeScreen = lazy(() => import('./components/HomeScreen'))
const Settings = lazy(() => import('./components/Settings'))
const AboutDialog = lazy(() => import('./components/AboutDialog'))
const Onboarding = lazy(() => import('./components/Onboarding'))
const CPPanel = lazy(() => import('./components/channelpoints/CPPanel'))
const ModPanel = lazy(() => import('./components/moderation/ModPanel'))
const ModView = lazy(() => import('./components/modview/ModView'))
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

const DebugPanel = import.meta.env.DEV
  ? lazy(() => import('./components/DebugPanel'))
  : null

import { useAuth } from './hooks/useAuth'
import { useChannelRole } from './hooks/useChannelRole'
import { mergeFavorites, addCloudFavorite, removeCloudFavorite, fetchFollowedChannels } from './utils/favoritesSync'
import { useLiveAlerts } from './hooks/useLiveAlerts'
import { Toast } from './hooks/useLiveAlerts.Toast'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { logError } from './utils/errors'
import { isTauri } from './utils/tauriEnv'
import { useT } from './utils/i18n'

import { ModerationProvider } from './components/moderation/ModerationContext'

function PlayerFallback() {
  return (
    <div className="flex-1 flex items-center justify-center bg-bg-primary">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-twitch border-t-transparent rounded-full animate-spin" />
        <span className="text-[13px] text-text-muted">Cargando reproductor...</span>
      </div>
    </div>
  )
}

function ChatFallback() {
  return (
    <div className="w-96 min-w-[320px] max-w-[440px] border-l border-bg-tertiary/30 flex items-center justify-center bg-bg-primary">
      <div className="w-8 h-8 border-2 border-twitch border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function TitleBar() {

  const win = isTauri() ? getCurrentWindow() : null

  const handleMinimize = () => { try { win?.minimize() } catch { try { getCurrentWindow().minimize() } catch {  } } }
  const handleMaximize = () => { try { win?.toggleMaximize() } catch { try { getCurrentWindow().toggleMaximize() } catch {  } } }
  const handleClose = () => { try { win?.close() } catch { try { getCurrentWindow().close() } catch {  } } }

  return (
    <div data-tauri-drag-region className="flex items-center h-8 bg-bg-primary border-b border-bg-tertiary/20 select-none shrink-0 relative z-[100000]">
      <div className="flex-1" data-tauri-drag-region />
      <div className="flex h-full">
        <button onClick={handleMinimize} className="w-10 h-full flex items-center justify-center text-text-muted/40 hover:text-text-secondary hover:bg-hover transition-colors cursor-pointer" data-tauri-drag-region="false">
          <svg width="10" height="10" viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1" fill="currentColor"/></svg>
        </button>
        <button onClick={handleMaximize} className="w-10 h-full flex items-center justify-center text-text-muted/40 hover:text-text-secondary hover:bg-hover transition-colors cursor-pointer" data-tauri-drag-region="false">
          <svg width="10" height="10" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>
        </button>
        <button onClick={handleClose} className="w-10 h-full flex items-center justify-center text-text-muted/40 hover:text-white hover:bg-red-500 transition-colors cursor-pointer" data-tauri-drag-region="false">
          <svg width="10" height="10" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.3"/></svg>
        </button>
      </div>
    </div>
  )
}
function ChatIcon() { return <PhosphorIcon name="ChatCircle" size={20} weight="regular" /> }
function ChatOffIcon() { return <PhosphorIcon name="ChatCircleSlash" size={20} weight="regular" /> }
function SettingsIcon() { return <PhosphorIcon name="Gear" size={20} weight="regular" /> }

const CHAT_BREAKPOINT = 600
const MAX_RECENT = 8

function loadFrom(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function saveTo(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {  }
}

function loadFavorites() { return loadFrom('blinkstream_favorites', []).filter(f => typeof f === 'string') }
function loadRecent() { return loadFrom('blinkstream_recent', []).filter(f => typeof f === 'string') }
function loadVolume() { const v = Number(localStorage.getItem('blinkstream_volume')); return isNaN(v) ? 100 : v }
function loadTheatre() { return localStorage.getItem('blinkstream_theatre') === 'true' }

function MainApp() {
  const t = useT()
  useEffect(() => {
    applyStoredHslTheme()
    applyStoredCustomFont()
    applyStoredCustomIconStyle()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('popout')) {
      try { window.close() } catch {  }
    }
  }, [])

  const [viewMode, setViewMode] = useState('normal')
  const [channel, setChannel] = useState('')
  const [quality, setQuality] = useState('best')
  const [favorites, setFavorites] = useState(loadFavorites)
  const [recentChannels, setRecentChannels] = useState(loadRecent)
  const [volume, setVolume] = useState(loadVolume)
  const [theatreMode, setTheatreMode] = useState(loadTheatre)
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const [showChat, setShowChat] = useState(window.innerWidth >= CHAT_BREAKPOINT)
  const [compact, setCompact] = useState(() => localStorage.getItem('blinkstream_compact') === 'true')
  const [chatOnRight, setChatOnRight] = useState(() => {
    try { return localStorage.getItem('blinkstream_chat_side') !== 'left' }
    catch { return true }
  })
  const [showSettings, setShowSettings] = useState(false)
  const [showCompanionModal, setShowCompanionModal] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('blinkstream_onboarded')
  })

  const [showCPPanel, setShowCPPanel] = useState(() => {
    try { return localStorage.getItem('bs.cpPanel.open') === '1' } catch { return false }
  })

  const [showModPanel, setShowModPanel] = useState(() => {
    try { return localStorage.getItem('bs.modPanel.open') === '1' } catch { return false }
  })

  const [modToast, setModToast] = useState(null)
  const showModToast = useCallback((toast) => {
    if (!toast) return
    setModToast(toast)

    setTimeout(() => { setModToast(curr => (curr === toast ? null : curr)) }, 3000)
  }, [])
  const [broadcasterId, setBroadcasterId] = useState(null)
  const [viewerUserId, setViewerUserId] = useState(() => {
    try { return localStorage.getItem('bs.twitch.viewer_userid') || null } catch { return null }
  })

  const finishOnboarding = () => {
    localStorage.setItem('blinkstream_onboarded', '1')
    setShowOnboarding(false)
  }

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyK' || e.code === 'KeyP')) {
        e.preventDefault()
        if (!theatreMode) {
          const input = document.querySelector('header input[type="text"]')
          if (input) input.focus()
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyM') {
        e.preventDefault()
        setViewMode(p => p === 'modview' ? 'normal' : 'modview')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [theatreMode])

  const { isLoggedIn, user, avatar, loading: authLoading, login, logout, getTwitchToken, loginWithToken } = useAuth()

  useEffect(() => {
    let cancelled = false
    let timer
    const check = async () => {
      const token = getTwitchToken()
      if (!token) return
      const valid = await validateToken(token)
      if (!cancelled && !valid) {
        await clearStoredToken()
        logout()
      }
      if (!cancelled) timer = setTimeout(check, 10 * 60 * 1000)
    }
    check()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [isLoggedIn, getTwitchToken, logout])

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const checkUpdate = async () => {
      try {
        const update = await check()
        if (!cancelled && update) {
          const proceed = window.confirm(
            `Nueva versión ${update.version} disponible.\n${update.body || ''}\n\n¿Descargar e instalar ahora?`
          )
          if (proceed) {
            await update.downloadAndInstall()
            await relaunch()
          }
        }
      } catch (e) {
        logError(e, { component: 'App', action: 'checkUpdate' })
      }
    }
    const timer = setTimeout(checkUpdate, 3000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [])

  const { alerts, dismissAlert, liveFavorites } = useLiveAlerts(favorites)

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {

    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (windowWidth < CHAT_BREAKPOINT) setShowChat(false)
  }, [windowWidth])

  useEffect(() => { saveTo('blinkstream_favorites', favorites) }, [favorites])
  useEffect(() => { saveTo('blinkstream_recent', recentChannels) }, [recentChannels])
  useEffect(() => { localStorage.setItem('blinkstream_quality', quality) }, [quality])
  useEffect(() => { localStorage.setItem('blinkstream_volume', String(volume)) }, [volume])
  useEffect(() => { localStorage.setItem('blinkstream_theatre', String(theatreMode)) }, [theatreMode])

  useEffect(() => {
    try { localStorage.setItem('bs.cpPanel.open', showCPPanel ? '1' : '0') } catch {  }
  }, [showCPPanel])

  useEffect(() => {
    try { localStorage.setItem('bs.modPanel.open', showModPanel ? '1' : '0') } catch {  }
  }, [showModPanel])

  const roleState = useChannelRole({ broadcasterId, userId: viewerUserId, channel })

  useEffect(() => {
    let cancelled = false

    if (!channel) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBroadcasterId(null); return
    }

    setBroadcasterId(null) 
    getUserIdByLogin(channel).then(id => {
      if (!cancelled) setBroadcasterId(id)
    })
    return () => { cancelled = true }
  }, [channel])

  useEffect(() => {
    if (!isLoggedIn || viewerUserId) return
    const token = getTwitchToken()
    if (!token) return
    let cancelled = false
    fetch('https://api.twitch.tv/helix/users', {
      headers: { 'Client-ID': getHelixClientId(), Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const id = data?.data?.[0]?.id
        if (!cancelled && id) {
          setViewerUserId(id)
          try { localStorage.setItem('bs.twitch.viewer_userid', id) } catch {  }
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isLoggedIn, viewerUserId, getTwitchToken])

  const username = user?.username || user?.identities?.[0]?.identity_data?.login || null

  const favoritesRef = useRef(favorites)
  useEffect(() => { favoritesRef.current = favorites }, [favorites])

  useEffect(() => {
    let cancelled = false
    const runSync = () => {
      if (cancelled) return
      const u = username || localStorage.getItem('blinkstream_twitch_username')
      if (!u) return
      const token = getTwitchToken()
      if (!token) return
      const localFavs = favoritesRef.current

      Promise.all([
        mergeFavorites(localFavs, u),
        fetchFollowedChannels(token),
      ]).then(([merged, follows]) => {
        if (cancelled) return
        const allChannels = [...new Set([...merged, ...follows])]
        if (JSON.stringify(allChannels) !== JSON.stringify(favoritesRef.current)) {
          setFavorites(allChannels)
        }
      }).catch(() => {
        if (import.meta.env.DEV) {
          console.warn('[App] Sincronización con la nube no disponible. Usando favoritos en modo local.')
        }
      })
    }

    runSync()
    window.addEventListener('blinkstream_auth_updated', runSync)
    return () => {
      cancelled = true
      window.removeEventListener('blinkstream_auth_updated', runSync)
    }
  }, [username, getTwitchToken])

  const selectChannel = useCallback((name) => {
    setViewMode('normal')
    setChannel(name)
    setRecentChannels(prev => {
      const filtered = prev.filter(c => c !== name)
      return [name, ...filtered].slice(0, MAX_RECENT)
    })
  }, [])

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten = null;
    let isCancelled = false;
    listen('companion_command', (e) => {
      const { action, value, channel: targetChannel } = e.payload || {};
      if (action === 'set_volume' && typeof value === 'number') {
        setVolume(Math.max(0, Math.min(100, value)));
      } else if (action === 'toggle_mute') {
        window.dispatchEvent(new CustomEvent('companion_toggle_mute'));
        setVolume(prev => prev > 0 ? 0 : 80);
      } else if (action === 'toggle_theatre') {
        setTheatreMode(prev => !prev);
      } else if (action === 'toggle_multistream') {
        setViewMode(prev => prev === 'multistream' ? 'normal' : 'multistream');
      } else if (action === 'change_channel' && targetChannel) {
        selectChannel(targetChannel);
      } else if (action === 'toggle_pause') {
        window.dispatchEvent(new CustomEvent('companion_toggle_pause'));
      } else if (action === 'take_snapshot') {
        window.dispatchEvent(new CustomEvent('companion_take_snapshot'));
      }
    }).then(fn => {
      if (isCancelled) fn();
      else unlisten = fn;
    }).catch(() => {});
    return () => {
      isCancelled = true;
      if (unlisten) unlisten();
    };
  }, [selectChannel]);

  const [fetchedCompanionAvatar, setFetchedCompanionAvatar] = useState({ channel: '', url: '' });
  const favoriteCompanionAvatar = channel
    ? (liveFavorites || []).find(f => typeof f === 'object' && f.name?.toLowerCase() === channel.toLowerCase())?.avatar || ''
    : '';
  const companionAvatar = favoriteCompanionAvatar
    || (fetchedCompanionAvatar.channel === channel ? fetchedCompanionAvatar.url : '');

  useEffect(() => {
    if (!channel || favoriteCompanionAvatar) return;
    const controller = new AbortController();
    getHeaders().then(async (headers) => {
      try {
        const res = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`, {
          headers,
          signal: controller.signal,
        });
        if (!res.ok || controller.signal.aborted) return;
        const data = await res.json();
        if (data?.data?.[0]?.profile_image_url && !controller.signal.aborted) {
          setFetchedCompanionAvatar({ channel, url: data.data[0].profile_image_url });
        }
      } catch {  }
    });
    return () => { controller.abort(); };
  }, [channel, favoriteCompanionAvatar]);

  useEffect(() => {
    if (!isTauri()) return;
    try {
      const favsToSend = (liveFavorites && liveFavorites.length > 0)
        ? liveFavorites.slice(0, 15)
        : favorites.slice(0, 15).map(name => (typeof name === 'object' ? name : { name, live: false, avatar: '' }));
      invoke('update_companion_state', {
        channel: channel || '',
        title: channel ? `🔴 ${channel}` : 'Sin emisión activa',
        volume: volume,
        isMuted: volume === 0,
        isLive: !!channel,
        viewMode: viewMode,
        favoritesLive: favsToSend,
        avatar: companionAvatar,
      }).catch(() => {});
    } catch {  }
  }, [channel, volume, viewMode, liveFavorites, favorites, companionAvatar]);

  const toggleFavorite = useCallback((name) => {
    setFavorites(prev => {
      const isRemoving = prev.includes(name)
      if (username) {
        if (isRemoving) { removeCloudFavorite(username, name) }
        else { addCloudFavorite(username, name) }
      }
      return isRemoving ? prev.filter(f => f !== name) : [...prev, name]
    })
  }, [username])

  const removeRecent = useCallback((name) => {
    setRecentChannels(prev => prev.filter(c => c !== name))
  }, [])

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false)
    setCompact(localStorage.getItem('blinkstream_compact') === 'true')
    setChatOnRight(localStorage.getItem('blinkstream_chat_side') !== 'left')
  }, [])

  return (

    <RecordingProvider>
    <ModerationProvider
      broadcasterId={broadcasterId}
      userId={viewerUserId}
      onToast={showModToast}
    >
    <div
      onContextMenu={(e) => e.preventDefault()}
      className={`h-screen w-screen flex flex-col bg-bg-primary text-text-primary ${theatreMode ? 'theatre-mode' : ''} ${compact ? 'compact-mode' : ''}`}>
      {showOnboarding && <Suspense fallback={null}><Onboarding onFinish={finishOnboarding} /></Suspense>}

      <TitleBar />

        <header className={`flex items-center gap-3 px-4 py-2 bg-bg-secondary/50 backdrop-blur-xl border-b border-white/[0.04] shrink-0 select-none relative z-[1000] ${showOnboarding ? 'hidden pointer-events-none' : ''} ${theatreMode ? 'opacity-0 max-h-0 overflow-hidden pointer-events-none' : ''} transition-all duration-300`}>
          <div className="flex items-center gap-3 mr-1.5 cursor-pointer" onClick={() => { setViewMode('normal'); if (channel) setChannel('') }} title={channel || viewMode === 'multistream' ? t('nav.home', 'Volver al inicio') : 'BlinkStream'}>
            <BlinkStreamLogo size={30} />
            <span className="text-base font-extrabold tracking-tight hidden sm:inline">
              <span className="text-text-primary">Blink</span>
              <span className="bg-gradient-to-r from-twitch to-fuchsia-400 bg-clip-text text-transparent font-bold">Stream</span>
            </span>
          </div>
          <div className="w-px h-6 bg-bg-tertiary mx-1.5" />
          <ChannelSearch onSelect={selectChannel} currentChannel={channel} />

          <button
            onClick={() => setViewMode(prev => prev === 'multistream' ? 'normal' : 'multistream')}
            title={t('grid.title', 'Modo Multivistas Simultáneo')}
            className={`flex items-center gap-2 px-3 py-1.5 ml-3 rounded-xl border transition-all cursor-pointer text-[12px] font-bold ${
              viewMode === 'multistream'
                ? 'bg-gradient-to-r from-twitch to-fuchsia-600 text-white border-twitch shadow-md shadow-twitch/30 scale-105'
                : 'bg-bg-tertiary/80 text-text-secondary border-white/10 hover:text-text-primary hover:border-white/20'
            }`}
          >
            <PhosphorIcon name="SquaresFour" size={17} weight={viewMode === 'multistream' ? 'fill' : 'duotone'} />
            <span className="hidden md:inline">{t('nav.multistream', 'Grid Multi-Stream')}</span>
          </button>

          <button
            onClick={() => setShowCompanionModal(true)}
            title="Mando a Distancia Wi-Fi para Móvil y Tablet (Fase 4)"
            className="flex items-center gap-2 px-3 py-1.5 ml-2 rounded-xl border bg-gradient-to-r from-cyan-500/15 to-fuchsia-500/15 hover:from-cyan-500/25 hover:to-fuchsia-500/25 text-cyan-300 border-cyan-500/40 hover:border-cyan-400 shadow-sm hover:shadow-cyan-500/20 hover:scale-[1.02] transition-all cursor-pointer text-[12px] font-extrabold shrink-0"
          >
            <PhosphorIcon name="DeviceMobile" size={18} weight="fill" className="text-cyan-400 animate-bounce-short" />
            <span className="hidden sm:inline">Mando Wi-Fi</span>
          </button>

          {}
          <div className="flex-1" />

          {}
          <div className="flex items-center gap-1">
            {/* Pro Mod View button */}
            {channel && (roleState.isModerator || roleState.isBroadcaster) && !roleState.loading && (
              <button
                onClick={() => setViewMode(p => p === 'modview' ? 'normal' : 'modview')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all text-xs font-bold border btn-press ${
                  viewMode === 'modview'
                    ? 'text-white bg-twitch border-twitch shadow-md shadow-twitch/30'
                    : 'text-twitch-glow bg-twitch/10 hover:bg-twitch/20 border-twitch/30'
                }`}
                title="Pro Mod View (Ctrl+M)"
                aria-label="Abrir Pro Mod View"
                aria-pressed={viewMode === 'modview'}
              >
                <PhosphorIcon name="ShieldCheck" size={16} weight="fill" />
                <span className="hidden sm:inline">Mod View</span>
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer transition-colors btn-press"
              title="Configuración"
              aria-label="Abrir configuración"
            >
              <SettingsIcon />
            </button>
            <button
              onClick={() => setShowChat(p => !p)}
              className={`p-2 rounded-lg cursor-pointer transition-colors btn-press ${
                showChat ? 'text-text-primary bg-hover' : 'text-text-muted hover:text-text-primary hover:bg-hover'
              }`}
              title={showChat ? 'Ocultar chat' : 'Mostrar chat'}
              aria-label={showChat ? 'Ocultar chat' : 'Mostrar chat'}
            >
              {showChat ? <ChatIcon /> : <ChatOffIcon />}
            </button>
          </div>

          {}
          {isLoggedIn ? (
            <div className="relative z-[9998] flex items-center gap-2 pl-3 ml-2 border-l border-bg-tertiary/50">
              <button
                onClick={() => setShowUserMenu(p => !p)}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-twitch to-purple-600 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-twitch/50 hover:scale-105 transition-all shrink-0 overflow-hidden border-2 border-white/10 shadow-lg shadow-twitch/20"
                title={username || 'Usuario'}
                aria-label="Menú de usuario"
              >
                {avatar ? (
                    <img src={avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-[13px] font-bold select-none">
                      {(username || 'U').charAt(0).toUpperCase()}
                    </span>
                  )}
              </button>
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-bg-secondary border border-bg-tertiary/60 rounded-xl shadow-2xl z-[9999] overflow-hidden animate-slide-up" onClick={e => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-bg-tertiary/40">
                    <p className="text-[12px] font-medium text-text-primary truncate">{username}</p>
                    <p className="text-[10px] text-text-muted">{t('nav.connected', 'Conectado')}</p>
                  </div>
                  <button
                    onClick={() => { setShowUserMenu(false); setShowLogoutConfirm(true) }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-[12px] text-text-secondary hover:bg-hover hover:text-red-400 cursor-pointer transition-colors"
                  >
                    <PhosphorIcon name="SignOut" size={16} weight="regular" />
                    {t('nav.logout', 'Cerrar sesión')}
                  </button>
                </div>
              )}
              {showUserMenu && (
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              )}
            </div>
          ) : (
            <div className="pl-3 ml-2 border-l border-bg-tertiary/50">
              <button
                onClick={login}
                disabled={authLoading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-white bg-twitch hover:bg-twitch-dark disabled:opacity-50 cursor-pointer transition-colors btn-press"
                title="Iniciar sesión con Twitch"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.428l-3 3v-3H6.857V1.714h13.714z"/></svg>
                <span className="hidden sm:inline">{authLoading ? '...' : 'Twitch'}</span>
              </button>
            </div>
          )}
        </header>

      {viewMode === 'modview' ? (
        <Suspense fallback={<PlayerFallback />}>
          <ModView
            channel={channel}
            broadcasterId={broadcasterId}
            userId={viewerUserId}
            isLoggedIn={isLoggedIn}
            twitchToken={getTwitchToken()}
            twitchUsername={username || localStorage.getItem('blinkstream_twitch_username')}
            volume={volume}
            onVolumeChange={setVolume}
            quality={quality}
            onQualityChange={setQuality}
            onExit={() => setViewMode('normal')}
            onLoginWithToken={loginWithToken}
          />
        </Suspense>
      ) : viewMode === 'multistream' ? (
        <Suspense fallback={<PlayerFallback />}>
          <MultiStreamGrid
            initialChannel={channel}
            isLoggedIn={isLoggedIn}
            twitchToken={getTwitchToken()}
            twitchUsername={username || localStorage.getItem('blinkstream_twitch_username')}
            chatOnRight={chatOnRight}
            onSelectChannel={selectChannel}
            onExit={() => setViewMode('normal')}
          />
        </Suspense>
      ) : (
        <div className={`flex flex-1 min-h-0 min-w-0 overflow-hidden ${!chatOnRight ? 'flex-row-reverse' : ''}`}>
          <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden animate-fade-in">
            {channel ? (
              <>
                {!theatreMode && <StreamInfo channel={channel} isFavorite={favorites.includes(channel)} onToggleFavorite={() => toggleFavorite(channel)} />}
                <div className={`flex-1 min-h-0 flex items-center justify-center ${theatreMode ? '' : 'p-3'}`}>
                <Suspense fallback={<PlayerFallback />}>
                  <VideoPlayer
                    channel={channel}
                    quality={quality}
                    onQualityChange={setQuality}
                    volume={volume}
                    onVolumeChange={setVolume}
                    theatreMode={theatreMode}
                    onToggleTheatre={() => setTheatreMode(p => !p)}
                    compact={compact}
                    onToggleCompact={() => setCompact(p => { const next = !p; localStorage.setItem('blinkstream_compact', String(next)); return next; })}
                    onOpenAppSettings={() => setShowSettings(true)}
                    isLoggedIn={isLoggedIn}
                    twitchToken={getTwitchToken()}
                    twitchUsername={username || localStorage.getItem('blinkstream_twitch_username')}
                    broadcasterId={broadcasterId}
                    onOpenCPPanel={() => setShowCPPanel(p => !p)}
                    isModerator={roleState.isModerator}
                    isBroadcaster={roleState.isBroadcaster}
                    viewerLogin={username}
                    onLoginWithToken={loginWithToken}
                  />
                </Suspense>
                </div>
              </>
            ) : (
              <Suspense fallback={<PlayerFallback />}>
                <HomeScreen
                  isLoggedIn={isLoggedIn}
                  onSelect={selectChannel}
                  onToggleFavorite={toggleFavorite}
                  favorites={favorites}
                  recentChannels={recentChannels}
                  onRemoveRecent={removeRecent}
                  onShowAbout={() => setShowAbout(true)}
                />
              </Suspense>
            )}
          </div>

          {showChat && channel && (
            <div className={`w-96 min-w-[320px] max-w-[440px] ${chatOnRight ? 'border-l' : 'border-r'} border-bg-tertiary/30 transition-all duration-300`}>
              <Suspense fallback={<ChatFallback />}>
                <Chat
                  channel={channel}
                  isLoggedIn={isLoggedIn}
                  twitchToken={getTwitchToken()}
                  twitchUsername={username || localStorage.getItem('blinkstream_twitch_username')}
                  broadcasterId={broadcasterId}
                  onOpenCPPanel={() => setShowCPPanel(p => !p)}
                  isModerator={roleState.isModerator}
                  isBroadcaster={roleState.isBroadcaster}
                  viewerLogin={username}
                  onLoginWithToken={loginWithToken}
                />
              </Suspense>
            </div>
          )}
        </div>
      )}

      {showSettings && <Suspense fallback={null}><Settings onClose={handleCloseSettings} /></Suspense>}
      {showCompanionModal && <Suspense fallback={null}><CompanionModal onClose={() => setShowCompanionModal(false)} /></Suspense>}
      {showAbout && <Suspense fallback={null}><AboutDialog onClose={() => setShowAbout(false)} /></Suspense>}
      {}
      {channel && broadcasterId && (
        <Suspense fallback={null}><CPPanel
          open={showCPPanel}
          onClose={() => setShowCPPanel(false)}
          channel={channel}
          broadcasterId={broadcasterId}
          userId={viewerUserId}
          userToken={getTwitchToken()}
          isBroadcaster={!!viewerUserId && viewerUserId === broadcasterId}
        /></Suspense>
      )}
      {}
      {channel && (
        <Suspense fallback={null}><ModPanel
          open={showModPanel && roleState.isModerator}
          onClose={() => setShowModPanel(false)}
          broadcasterId={broadcasterId}
          userId={viewerUserId}
          channel={channel}
        /></Suspense>
      )}
      {showLogoutConfirm && (
        <ConfirmDialog
          title={t('nav.logout', 'Cerrar sesión')}
          message={t('nav.logoutConfirmDesc', '¿Estás seguro de que quieres cerrar sesión? Tus favoritos en la nube se conservarán.')}
          confirmText={t('nav.logout', 'Cerrar sesión')}
          onConfirm={() => { setShowLogoutConfirm(false); logout() }}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}

      {alerts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {alerts.map(a => (
            <Toast
              key={a.id}
              channel={a.channel}
              message={a.message}
              logo={a.logo}
              onClick={() => selectChannel(a.channel)}
              onDismiss={() => dismissAlert(a.channel)}
            />
          ))}
        </div>
      )}

      {}
      {DebugPanel && (
        <Suspense fallback={null}>
          <DebugPanel />
        </Suspense>
      )}

      {}
      <DiskSpaceIndicator />

      {}
      {modToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-20 right-4 z-[10001] px-3 py-2 rounded-xl shadow-2xl backdrop-blur-md text-[12px] font-medium border animate-slide-up ${
            modToast.type === 'success' ? 'bg-green-500/15 border-green-500/30 text-green-300'
              : modToast.type === 'error' ? 'bg-red-500/15 border-red-500/30 text-red-300'
              : 'bg-bg-secondary/95 border-bg-tertiary/60 text-text-primary'
          }`}
        >
          {modToast.message}
        </div>
      )}
    </div>
    </ModerationProvider>
    </RecordingProvider>
  )
}

function RuntimeDependencyGate({ children }) {
  const [status, setStatus] = useState(() => isTauri() ? 'checking' : 'ready')
  const [error, setError] = useState('')

  const checkDependencies = useCallback(() => {
    if (!isTauri()) {
      setStatus('ready')
      return
    }

    setStatus('checking')
    setError('')
    invoke('ensure_stream_dependencies')
      .then(() => {
        console.info('[runtime] Streamlink y FFmpeg preparados')
        setStatus('ready')
      })
      .catch(reason => {
        const message = typeof reason === 'string' ? reason : reason?.message || String(reason)
        console.error('[runtime] Dependencias de streaming no disponibles:', message)
        setError(message)
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) checkDependencies() })
    return () => { cancelled = true }
  }, [checkDependencies])

  if (status === 'ready') return children

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-bg-primary text-text-primary p-8">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-bg-secondary/90 p-7 shadow-2xl">
        {status === 'checking' ? (
          <>
            <div className="w-9 h-9 mb-4 border-2 border-twitch border-t-transparent rounded-full animate-spin" />
            <h1 className="text-lg font-bold mb-2">Preparando reproducción</h1>
            <p className="text-sm text-text-muted">Instalando y validando Streamlink y FFmpeg. Este proceso solo se realiza cuando faltan.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-red-300 mb-2">No se pudieron preparar las dependencias</h1>
            <p className="text-sm text-text-muted mb-4">BlinkStream necesita Streamlink y FFmpeg para reproducir streams.</p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs text-red-200 mb-5">{error}</pre>
            <button onClick={checkDependencies} className="rounded-lg bg-twitch px-4 py-2 text-sm font-semibold text-white hover:bg-twitch/80 cursor-pointer">
              Reintentar instalación
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function App() {
  return <RuntimeDependencyGate><MainApp /></RuntimeDependencyGate>
}

export default App
