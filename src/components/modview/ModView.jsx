import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { useModeration } from '../../hooks/useModeration'
import { useChannelRole } from '../../hooks/useChannelRole'
import { useManageRewards } from '../../hooks/useManageRewards'
import { ModQuickActionsBar } from './ModQuickActionsBar'
import { ModViewLayoutDrawer } from './ModViewLayoutDrawer'
import { UserInspectorCard } from './UserInspectorCard'
import { ModActionFeed } from './ModActionFeed'
import { ActiveModsPanel } from './ActiveModsPanel'
import { AutoModQueue } from './AutoModQueue'
import { UnbanRequestsPanel } from './UnbanRequestsPanel'
import { PredictionsPollsPanel } from './PredictionsPollsPanel'
import { ActivityFeed } from './ActivityFeed'
import { RewardsQueuePanel } from './RewardsQueuePanel'
import PhosphorIcon from '../icons/PhosphorIcon'

const VideoPlayer = lazy(() => import('../VideoPlayer'))
const Chat = lazy(() => import('../Chat'))

const CONFIG_STORAGE_KEY = 'bs.modview.config.v4'

const DEFAULT_CONFIG = {
  preset: 'standard', // 'standard' | 'chat_left' | 'no_player'
  showPlayer: true,
  showInspector: true,
  enabledTabs: ['audit', 'users', 'activity', 'automod', 'predictions', 'rewards'],
  activeTab: 'audit',
}

export function ModView({
  channel,
  broadcasterId,
  userId,
  isLoggedIn,
  twitchToken,
  twitchUsername,
  volume,
  onVolumeChange,
  quality,
  onQualityChange,
  onExit,
  onLoginWithToken,
}) {
  const modState = useModeration({ broadcasterId, userId })
  const roleState = useChannelRole({ broadcasterId, userId, channel })
  const rewardsState = useManageRewards({ broadcasterId, token: twitchToken })

  const [selectedUser, setSelectedUser] = useState(null)
  const [chatMessages, setChatMessages] = useState([])
  const [heldMessages, setHeldMessages] = useState([])
  const [activeModes, setActiveModes] = useState({})
  const [isLayoutDrawerOpen, setIsLayoutDrawerOpen] = useState(false)
  const [automodSubTab, setAutomodSubTab] = useState('automod') // 'automod' | 'unban'

  // Load layout config from localStorage
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem(CONFIG_STORAGE_KEY)
      if (saved) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) }
      }
    } catch {
      // ignore
    }
    return DEFAULT_CONFIG
  })

  const [rightPanelTab, setRightPanelTab] = useState(config.activeTab || 'audit')

  // Keep rightPanelTab in sync with enabled tabs
  useEffect(() => {
    if (!config.enabledTabs.includes(rightPanelTab) && config.enabledTabs.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRightPanelTab(config.enabledTabs[0])
    }
  }, [config.enabledTabs, rightPanelTab])

  // Save config changes
  useEffect(() => {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ ...config, activeTab: rightPanelTab }))
    } catch {
      // ignore
    }
  }, [config, rightPanelTab])

  const { fetchChatSettings } = modState
  useEffect(() => {
    let cancelled = false
    const loadModes = async () => {
      if (fetchChatSettings) {
        const s = await fetchChatSettings()
        if (s && !cancelled) {
          setActiveModes({
            slow: s.slow_mode ? (s.slow_mode_wait_time || 30) : false,
            emoteonly: !!s.emote_mode,
            subscribers: !!s.subscriber_mode,
            followers: s.follower_mode ? (s.follower_mode_duration ?? 0) : false,
            uniquechat: !!s.unique_chat_mode,
          })
        }
      }
    }
    loadModes()
    return () => { cancelled = true }
  }, [fetchChatSettings])

  const handleSelectUser = useCallback((userObj) => {
    if (!userObj) {
      setSelectedUser(null)
      return
    }
    setSelectedUser(prev => ({
      ...prev,
      ...userObj,
    }))
  }, [])

  const handleSetMode = async (mode, val) => {
    const ok = await modState.setChatMode(mode, val)
    if (ok) {
      if (mode.endsWith('off')) {
        const baseMode = mode.replace('off', '')
        setActiveModes(prev => ({ ...prev, [baseMode]: false }))
      } else {
        setActiveModes(prev => ({ ...prev, [mode]: val || true }))
      }
    }
  }

  const handleRemoveHeldMessage = useCallback((msgId) => {
    setHeldMessages(prev => prev.filter(m => m.id !== msgId))
  }, [])

  const handleResetDefaults = () => {
    setConfig(DEFAULT_CONFIG)
    setRightPanelTab('audit')
    try {
      localStorage.removeItem(CONFIG_STORAGE_KEY)
    } catch {
      // ignore
    }
  }

  // Left Column Component (Video Player + User Inspector)
  const leftColumnNode = (
    <div className="col-span-12 lg:col-span-4 flex flex-col gap-3 min-h-0 overflow-hidden">
      {/* Video Player Monitor */}
      {config.showPlayer && (
        <div className="shrink-0 aspect-video max-h-[300px] rounded-2xl overflow-hidden bg-black/60 border border-white/10 relative shadow-xl backdrop-blur-xl">
          <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-text-muted text-xs">Cargando reproductor...</div>}>
            <VideoPlayer
              channel={channel}
              volume={volume}
              onVolumeChange={onVolumeChange}
              quality={quality}
              onQualityChange={onQualityChange}
              isLoggedIn={isLoggedIn}
              onLoginWithToken={onLoginWithToken}
            />
          </Suspense>
        </div>
      )}

      {/* User Inspector Card */}
      {config.showInspector && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <UserInspectorCard
            targetUser={selectedUser}
            recentMessages={chatMessages}
            onTimeout={modState.timeout}
            onBan={modState.ban}
            onUnban={modState.unban}
            onClose={() => setSelectedUser(null)}
            onSelectUser={handleSelectUser}
            isBroadcaster={roleState.isBroadcaster}
          />
        </div>
      )}
    </div>
  )

  // Center Column Component (Live Chat with Mod Header)
  const centerColumnNode = (
    <div className={`col-span-12 ${config.preset === 'no_player' ? 'lg:col-span-7' : 'lg:col-span-4'} flex flex-col min-h-0 bg-[#111119]/80 border border-white/10 rounded-2xl overflow-hidden shadow-xl backdrop-blur-xl`}>
      <div className="shrink-0 p-2.5 bg-white/5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PhosphorIcon name="Chats" size={18} className="text-twitch-glow" weight="duotone" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">Chat de Moderación</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-text-muted">
          <span>Clic en usuario para inspeccionar</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-text-muted text-xs">Cargando chat...</div>}>
          <Chat
            channel={channel}
            broadcasterId={broadcasterId}
            userId={userId}
            isLoggedIn={isLoggedIn}
            twitchToken={twitchToken}
            twitchUsername={twitchUsername}
            isMod={true}
            isBroadcaster={roleState.isBroadcaster}
            viewerLogin={twitchUsername}
            onLoginWithToken={onLoginWithToken}
            onSelectUserForInspection={handleSelectUser}
            onMessagesUpdate={setChatMessages}
          />
        </Suspense>
      </div>
    </div>
  )

  // Right Column Component (Multi-tool Command Dock)
  const rightColumnNode = (
    <div className={`col-span-12 ${config.preset === 'no_player' ? 'lg:col-span-5' : 'lg:col-span-4'} flex flex-col min-h-0 bg-[#111119]/80 border border-white/10 rounded-2xl overflow-hidden shadow-xl backdrop-blur-xl`}>
      {/* Dock Tab Switcher Header */}
      <div className="shrink-0 p-2 border-b border-white/10 bg-white/5 flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1">
          {config.enabledTabs.includes('audit') && (
            <button
              onClick={() => setRightPanelTab('audit')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                rightPanelTab === 'audit'
                  ? 'bg-twitch/20 text-twitch-glow border border-twitch/40 shadow-sm'
                  : 'text-white/60 hover:text-white'
              }`}
              title="Mod Log de Auditoría"
            >
              <PhosphorIcon name="ClockCounterClockwise" size={13} />
              <span>Log</span>
            </button>
          )}

          {config.enabledTabs.includes('users') && (
            <button
              onClick={() => setRightPanelTab('users')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                rightPanelTab === 'users'
                  ? 'bg-twitch/20 text-twitch-glow border border-twitch/40 shadow-sm'
                  : 'text-white/60 hover:text-white'
              }`}
              title="Lista de Espectadores y Moderadores"
            >
              <PhosphorIcon name="ChatsCircle" size={13} />
              <span>Usuarios</span>
            </button>
          )}

          {config.enabledTabs.includes('activity') && (
            <button
              onClick={() => setRightPanelTab('activity')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                rightPanelTab === 'activity'
                  ? 'bg-twitch/20 text-twitch-glow border border-twitch/40 shadow-sm'
                  : 'text-white/60 hover:text-white'
              }`}
              title="Fuente de Actividad (Subs, Raids, Bits)"
            >
              <PhosphorIcon name="Lightning" size={13} />
              <span>Actividad</span>
            </button>
          )}

          {config.enabledTabs.includes('automod') && (
            <button
              onClick={() => setRightPanelTab('automod')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                rightPanelTab === 'automod'
                  ? 'bg-twitch/20 text-twitch-glow border border-twitch/40 shadow-sm'
                  : 'text-white/60 hover:text-white'
              }`}
              title="Cola de AutoMod y Solicitudes de Unban"
            >
              <PhosphorIcon name="ShieldCheck" size={13} />
              <span>AutoMod</span>
              {heldMessages.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              )}
            </button>
          )}

          {config.enabledTabs.includes('predictions') && (
            <button
              onClick={() => setRightPanelTab('predictions')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                rightPanelTab === 'predictions'
                  ? 'bg-twitch/20 text-twitch-glow border border-twitch/40 shadow-sm'
                  : 'text-white/60 hover:text-white'
              }`}
              title="Predicciones y Encuestas"
            >
              <PhosphorIcon name="Coins" size={13} />
              <span>Predicciones</span>
            </button>
          )}

          {config.enabledTabs.includes('rewards') && (
            <button
              onClick={() => setRightPanelTab('rewards')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                rightPanelTab === 'rewards'
                  ? 'bg-twitch/20 text-twitch-glow border border-twitch/40 shadow-sm'
                  : 'text-white/60 hover:text-white'
              }`}
              title="Cola de Solicitudes de Puntos"
            >
              <PhosphorIcon name="Gift" size={13} />
              <span>Puntos</span>
              {rewardsState.pendingRedemptions?.length > 0 && (
                <span className="px-1 py-0.2 bg-twitch text-[9px] rounded-full font-bold">
                  {rewardsState.pendingRedemptions.length}
                </span>
              )}
            </button>
          )}
        </div>

        {rightPanelTab === 'audit' && modState.auditLog.length > 0 && (
          <button
            onClick={modState.clearAuditLog}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/50 hover:text-red-300 border border-white/10 hover:border-red-500/30 text-[10px] font-medium transition-all cursor-pointer shrink-0"
            title="Vaciar registro local de acciones"
          >
            <PhosphorIcon name="Trash" size={11} />
            <span>Limpiar</span>
          </button>
        )}
      </div>

      {/* Sub-Header for AutoMod / Unban tab */}
      {rightPanelTab === 'automod' && (
        <div className="shrink-0 p-1.5 bg-black/40 border-b border-white/10 flex items-center gap-1">
          <button
            onClick={() => setAutomodSubTab('automod')}
            className={`flex-1 py-1 rounded-lg text-xs font-bold text-center transition-colors cursor-pointer ${
              automodSubTab === 'automod'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            AutoMod ({heldMessages.length})
          </button>
          <button
            onClick={() => setAutomodSubTab('unban')}
            className={`flex-1 py-1 rounded-lg text-xs font-bold text-center transition-colors cursor-pointer ${
              automodSubTab === 'unban'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            Solicitudes Unban
          </button>
        </div>
      )}

      {/* Dock Body Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {rightPanelTab === 'audit' ? (
          <ModActionFeed
            auditLog={modState.auditLog}
            onInspectUser={handleSelectUser}
            onClearLog={modState.clearAuditLog}
          />
        ) : rightPanelTab === 'users' ? (
          <ActiveModsPanel
            broadcasterId={broadcasterId}
            userId={userId}
            recentMessages={chatMessages}
            onInspectUser={handleSelectUser}
          />
        ) : rightPanelTab === 'activity' ? (
          <ActivityFeed
            messages={chatMessages}
            onInspectUser={handleSelectUser}
          />
        ) : rightPanelTab === 'automod' ? (
          automodSubTab === 'automod' ? (
            <AutoModQueue
              broadcasterId={broadcasterId}
              userId={userId}
              token={twitchToken}
              isLoggedIn={isLoggedIn}
              onLoginWithToken={onLoginWithToken}
              heldMessages={heldMessages}
              onRemoveMessage={handleRemoveHeldMessage}
              onInspectUser={handleSelectUser}
            />
          ) : (
            <UnbanRequestsPanel
              broadcasterId={broadcasterId}
              userId={userId}
              token={twitchToken}
              isLoggedIn={isLoggedIn}
              onLoginWithToken={onLoginWithToken}
              onInspectUser={handleSelectUser}
            />
          )
        ) : rightPanelTab === 'predictions' ? (
          <PredictionsPollsPanel
            channel={channel}
            broadcasterId={broadcasterId}
            userId={userId}
            token={twitchToken}
            isLoggedIn={isLoggedIn}
            onLoginWithToken={onLoginWithToken}
          />
        ) : (
          <RewardsQueuePanel
            pendingRedemptions={rewardsState.pendingRedemptions}
            onFulfillRedemption={rewardsState.fulfillRedemption}
            onCancelRedemption={rewardsState.cancelRedemption}
            loading={rewardsState.loading}
            onRefresh={rewardsState.refresh}
            onInspectUser={handleSelectUser}
          />
        )}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0a0f] text-white select-none overflow-hidden font-sans">
      {/* Top Quick Actions Bar */}
      <ModQuickActionsBar
        channel={channel}
        activeModes={activeModes}
        onSetMode={handleSetMode}
        onClearChat={modState.clearChat}
        onExit={onExit}
        remainingActions={modState.remainingActions}
        onOpenLayoutDrawer={() => setIsLayoutDrawerOpen(true)}
      />

      {/* 3-Column Glassmorphic Layout based on Preset */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3 p-3 overflow-hidden">
        {config.preset === 'chat_left' ? (
          <>
            {centerColumnNode}
            {leftColumnNode}
            {rightColumnNode}
          </>
        ) : config.preset === 'no_player' ? (
          <>
            {centerColumnNode}
            {rightColumnNode}
          </>
        ) : (
          <>
            {leftColumnNode}
            {centerColumnNode}
            {rightColumnNode}
          </>
        )}
      </div>

      {/* Layout Drawer Settings Modal */}
      <ModViewLayoutDrawer
        isOpen={isLayoutDrawerOpen}
        onClose={() => setIsLayoutDrawerOpen(false)}
        config={config}
        onChangeConfig={setConfig}
        onResetDefaults={handleResetDefaults}
      />
    </div>
  )
}
export default ModView
