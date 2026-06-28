import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import ChannelSearch from './components/ChannelSearch'
import StreamInfo from './components/StreamInfo'
import HomeScreen from './components/HomeScreen'
import Settings from './components/Settings'
import AboutDialog from './components/AboutDialog'
import ConfirmDialog from './components/ConfirmDialog'
import Onboarding from './components/Onboarding'
import CPPanel from './components/channelpoints/CPPanel'
import PhosphorIcon from './components/icons/PhosphorIcon'
import DiskSpaceIndicator from './components/recording/DiskSpaceIndicator'
// FIX P1-4: Provider que monta useGlobalRecording UNA sola vez. Los
// 3 componentes de recording (toggle, drawer, disk indicator) leen
// del context en vez de tener su propio polling. Evita 2-3 pollees
// paralelos cada 10s.
import { RecordingProvider } from './components/recording/RecordingContext'
import { BlinkStreamLogo } from './components/BlinkStreamLogo'
import { getUserIdByLogin } from './utils/twitch'

const VideoPlayer = lazy(() => import('./components/VideoPlayer'))
const Chat = lazy(() => import('./components/Chat'))

// M-8: DebugPanel solo en dev. Lazy + DEV guardean para que Vite
// haga dead-code elimination en el build de produccion y el bundle
// ni siquiera incluya DebugPanel.jsx.
const DebugPanel = import.meta.env.DEV
  ? lazy(() => import('./components/DebugPanel'))
  : null

import { useAuth } from './hooks/useAuth'
import { mergeFavorites, addCloudFavorite, removeCloudFavorite, fetchFollowedChannels } from './utils/favoritesSync'
import { useLiveAlerts } from './hooks/useLiveAlerts'
import { Toast } from './hooks/useLiveAlerts.Toast'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { validateToken, clearStoredToken } from './utils/twitch'
import { logError } from './utils/errors'
import { isTauri } from './utils/tauriEnv'

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
  // FIX WT-20260628-34: getCurrentWindow() falla fuera de Tauri porque
  // internamente accede a `window.__TAURI_INTERNALS__.metadata`, que no
  // existe en el browser. Solo construimos `win` si el runtime de Tauri
  // esta presente.
  const win = isTauri() ? getCurrentWindow() : null

  const handleMinimize = () => { try { win?.minimize() } catch { try { getCurrentWindow().minimize() } catch { /* no-op: Tauri no listo */ } } }
  const handleMaximize = () => { try { win?.toggleMaximize() } catch { try { getCurrentWindow().toggleMaximize() } catch { /* no-op: Tauri no listo */ } } }
  const handleClose = () => { try { win?.close() } catch { try { getCurrentWindow().close() } catch { /* no-op: Tauri no listo */ } } }

  return (
    <div data-tauri-drag-region className="flex items-center h-8 bg-bg-primary border-b border-bg-tertiary/20 select-none shrink-0">
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
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

function loadFavorites() { return loadFrom('blinkstream_favorites', []).filter(f => typeof f === 'string') }
function loadRecent() { return loadFrom('blinkstream_recent', []).filter(f => typeof f === 'string') }
function loadVolume() { const v = Number(localStorage.getItem('blinkstream_volume')); return isNaN(v) ? 100 : v }
function loadTheatre() { return localStorage.getItem('blinkstream_theatre') === 'true' }

function App() {
  useEffect(() => {
    const accent = localStorage.getItem('blinkstream_accent') || 'purple'
    document.documentElement.setAttribute('data-accent', accent)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('popout')) {
      try { window.close() } catch { /* ignore */ }
    }
  }, [])
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
  const [showAbout, setShowAbout] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('blinkstream_onboarded')
  })
  // WT-20260628-14: estado del panel de Channel Points
  const [showCPPanel, setShowCPPanel] = useState(() => {
    try { return localStorage.getItem('bs.cpPanel.open') === '1' } catch { return false }
  })
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
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [theatreMode])

  const { isLoggedIn, user, avatar, loading: authLoading, login, logout, getTwitchToken } = useAuth()

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

  const { alerts, dismissAlert } = useLiveAlerts(favorites)

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    // setShowChat en effect: estado UI derivado del ancho de ventana
    // (debajo del breakpoint ocultamos el chat). No es cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (windowWidth < CHAT_BREAKPOINT) setShowChat(false)
  }, [windowWidth])

  useEffect(() => { saveTo('blinkstream_favorites', favorites) }, [favorites])
  useEffect(() => { saveTo('blinkstream_recent', recentChannels) }, [recentChannels])
  useEffect(() => { localStorage.setItem('blinkstream_quality', quality) }, [quality])
  useEffect(() => { localStorage.setItem('blinkstream_volume', String(volume)) }, [volume])
  useEffect(() => { localStorage.setItem('blinkstream_theatre', String(theatreMode)) }, [theatreMode])
  // WT-20260628-14: persistencia del panel de Channel Points
  useEffect(() => {
    try { localStorage.setItem('bs.cpPanel.open', showCPPanel ? '1' : '0') } catch { /* ignore */ }
  }, [showCPPanel])

  // WT-20260628-14: resolver broadcaster_id del canal actual.
  // Lo necesitamos para Channel Points y para detect isBroadcaster.
  useEffect(() => {
    let cancelled = false
    // Reset + fetch: patron de "estado desde fuente externa".
    // El setState sincrono al inicio es para evitar UI stale; el .then
    // resuelve el broadcasterId real. No es cascading render.
    if (!channel) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBroadcasterId(null); return
    }
     
    setBroadcasterId(null) // limpiamos para no mostrar UI stale
    getUserIdByLogin(channel).then(id => {
      if (!cancelled) setBroadcasterId(id)
    })
    return () => { cancelled = true }
  }, [channel])

  // WT-20260628-14: resolver user_id del viewer logueado.
  // Si no estamos logueados, queda null. Usamos cache local para
  // no pegarle a Twitch en cada mount.
  useEffect(() => {
    if (!isLoggedIn || viewerUserId) return
    const token = getTwitchToken()
    if (!token) return
    let cancelled = false
    fetch('https://api.twitch.tv/helix/users', {
      headers: { 'Client-ID': import.meta.env.VITE_TWITCH_APP_CLIENT_ID || '', Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const id = data?.data?.[0]?.id
        if (!cancelled && id) {
          setViewerUserId(id)
          try { localStorage.setItem('bs.twitch.viewer_userid', id) } catch { /* ignore */ }
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isLoggedIn, viewerUserId, getTwitchToken])

  const username = user?.username || user?.identities?.[0]?.identity_data?.login || null

  useEffect(() => {
    if (!username) return
    const token = getTwitchToken()
    if (!token) return

    Promise.all([
      mergeFavorites(favorites, username),
      fetchFollowedChannels(token),
    ]).then(([merged, follows]) => {
      const allChannels = [...new Set([...merged, ...follows])]
      if (allChannels.length > favorites.length) {
        setFavorites(allChannels)
      }
    }).catch(() => {
      mergeFavorites(favorites, username).then(merged => {
        if (merged.length > favorites.length) setFavorites(merged)
      })
    })
    // Deps: re-sincronizar cuando cambien `favorites` locales (ej: el
    // usuario añade/quita un favorito y queremos re-mergear con la nube
    // en el próximo ciclo) o cuando `getTwitchToken` quede disponible
    // tras el login.
  }, [username, favorites, getTwitchToken])

  const selectChannel = useCallback((name) => {
    setChannel(name)
    setRecentChannels(prev => {
      const filtered = prev.filter(c => c !== name)
      return [name, ...filtered].slice(0, MAX_RECENT)
    })
  }, [])

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
    // FIX P1-4: RecordingProvider envuelve toda la app para que los 3
    // componentes de recording compartan un solo polling. El Provider
    // monta useGlobalRecording() una vez; useRecordingContext() lo lee.
    <RecordingProvider>
    <div
      onContextMenu={(e) => e.preventDefault()}
      className={`h-screen w-screen flex flex-col bg-bg-primary text-text-primary ${theatreMode ? 'theatre-mode' : ''} ${compact ? 'compact-mode' : ''}`}>
      {showOnboarding && <Onboarding onFinish={finishOnboarding} />}

      <TitleBar />

        <header className={`flex items-center gap-3 px-4 py-2 bg-bg-secondary/50 backdrop-blur-xl border-b border-white/[0.04] shrink-0 select-none relative z-10 ${theatreMode ? 'opacity-0 max-h-0 overflow-hidden pointer-events-none' : ''} transition-all duration-300`}>
          <div className="flex items-center gap-3 mr-1.5 cursor-pointer" onClick={() => { if (channel) setChannel('') }} title={channel ? 'Volver al inicio' : 'BlinkStream'}>
            <BlinkStreamLogo size={30} />
            <span className="text-base font-extrabold tracking-tight hidden sm:inline">
              <span className="text-text-primary">Blink</span>
              <span className="bg-gradient-to-r from-twitch to-fuchsia-400 bg-clip-text text-transparent font-bold">Stream</span>
            </span>
          </div>
          <div className="w-px h-6 bg-bg-tertiary mx-1.5" />
          <ChannelSearch onSelect={selectChannel} currentChannel={channel} />

          {/* WT-20260628-49: espacio flexible que empuja el avatar al extremo derecho */}
          <div className="flex-1" />

          {/* WT-20260628-49: grupo centro-derecha — Settings (gear) + Ocultar chat.
              Ambos botones viven siempre visibles, independientes del canal
              seleccionado. El chat toggle ya no esta gateado por `channel` para
              permitir ocultar/mostrar la barra de chat en cualquier momento. */}
          <div className="flex items-center gap-1">
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

          {/* WT-20260628-49: grupo derecho — avatar del usuario con borde izquierdo visible
              que lo separa claramente del grupo de controles */}
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
                    <p className="text-[10px] text-text-muted">Conectado</p>
                  </div>
                  <button
                    onClick={() => { setShowUserMenu(false); setShowLogoutConfirm(true) }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-[12px] text-text-secondary hover:bg-hover hover:text-red-400 cursor-pointer transition-colors"
                  >
                    <PhosphorIcon name="SignOut" size={16} weight="regular" />
                    Cerrar sesión
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

      <div className={`flex flex-1 min-h-0 ${!chatOnRight ? 'flex-row-reverse' : ''}`}>
        <div className={`flex flex-col min-h-0 animate-fade-in ${showChat && !theatreMode ? 'flex-1' : 'w-full'}`}>
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
                />
              </Suspense>
              </div>
            </>
          ) : (
            <HomeScreen
              onSelect={selectChannel}
              onToggleFavorite={toggleFavorite}
              favorites={favorites}
              recentChannels={recentChannels}
              onRemoveRecent={removeRecent}
              onShowAbout={() => setShowAbout(true)}
            />
          )}
        </div>

        {showChat && channel && !theatreMode && (
          <div className={`w-96 min-w-[320px] max-w-[440px] ${chatOnRight ? 'border-l' : 'border-r'} border-bg-tertiary/30 transition-all duration-300`}>
            <Suspense fallback={<ChatFallback />}>
              <Chat
                channel={channel}
                isLoggedIn={isLoggedIn}
                twitchToken={getTwitchToken()}
                twitchUsername={username || localStorage.getItem('blinkstream_twitch_username')}
                broadcasterId={broadcasterId}
                onOpenCPPanel={() => setShowCPPanel(p => !p)}
              />
            </Suspense>
          </div>
        )}
      </div>

      {showSettings && <Settings onClose={handleCloseSettings} />}
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      {/* WT-20260628-14: Panel de Channel Points (P1 + P2) */}
      {channel && broadcasterId && (
        <CPPanel
          open={showCPPanel}
          onClose={() => setShowCPPanel(false)}
          channel={channel}
          broadcasterId={broadcasterId}
          userId={viewerUserId}
          userToken={getTwitchToken()}
          isBroadcaster={!!viewerUserId && viewerUserId === broadcasterId}
        />
      )}
      {showLogoutConfirm && (
        <ConfirmDialog
          title="Cerrar sesión"
          message="¿Estás seguro de que quieres cerrar sesión? Tus favoritos en la nube se conservarán."
          confirmText="Cerrar sesión"
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

      {/* M-8: DebugPanel solo visible en dev. Ver guard arriba. */}
      {DebugPanel && (
        <Suspense fallback={null}>
          <DebugPanel />
        </Suspense>
      )}

      {/* G1 / WT-20260628-16: indicador de espacio en disco (bottom bar) */}
      <DiskSpaceIndicator />
    </div>
    </RecordingProvider>
  )
}

export default App
