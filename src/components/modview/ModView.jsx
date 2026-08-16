import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { useModeration } from '../../hooks/useModeration'
import { useChannelRole } from '../../hooks/useChannelRole'
import { ModQuickActionsBar } from './ModQuickActionsBar'
import { UserInspectorCard } from './UserInspectorCard'
import { ModActionFeed } from './ModActionFeed'
import { ActiveModsPanel } from './ActiveModsPanel'
import PhosphorIcon from '../icons/PhosphorIcon'

const VideoPlayer = lazy(() => import('../VideoPlayer'))
const Chat = lazy(() => import('../Chat'))

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

  const [selectedUser, setSelectedUser] = useState(null)
  const [rightPanelTab, setRightPanelTab] = useState('audit') // 'audit' | 'team'
  const [chatMessages, setChatMessages] = useState([])
  const [activeModes, setActiveModes] = useState({})

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
        const base = mode.replace('off', '')
        setActiveModes(prev => ({ ...prev, [base]: false }))
      } else {
        setActiveModes(prev => ({ ...prev, [mode]: val || true }))
      }
    }
  }

  const handleClearChat = async () => {
    await modState.clearChat(channel)
  }

  return (
    <div className="flex flex-col w-full h-full bg-[#09090f] text-text-primary overflow-hidden font-sans select-none animate-fade-in">
      {/* Top Quick Actions Bar */}
      <ModQuickActionsBar
        channel={channel}
        isModerator={roleState.isModerator}
        isBroadcaster={roleState.isBroadcaster}
        activeModes={activeModes}
        onSetMode={handleSetMode}
        onClearChat={handleClearChat}
        onExit={onExit}
        remainingActions={modState.remainingActions}
        isRateLimited={modState.isRateLimited}
      />

      {/* Main 3-Column Mod Grid Layout */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3 p-3 overflow-hidden">
        {/* Left Column: Video Monitor & User Inspector (Col span 4) */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* Live Player Monitor */}
          <div className="shrink-0 aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 shadow-xl relative">
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center bg-black/60"><div className="w-6 h-6 border-2 border-twitch border-t-transparent rounded-full animate-spin" /></div>}>
              <VideoPlayer
                channel={channel}
                quality={quality}
                onQualityChange={onQualityChange}
                volume={volume}
                onVolumeChange={onVolumeChange}
                theatreMode={false}
                compact={true}
                isLoggedIn={isLoggedIn}
                twitchToken={twitchToken}
                twitchUsername={twitchUsername}
                broadcasterId={broadcasterId}
                isModerator={roleState.isModerator}
                isBroadcaster={roleState.isBroadcaster}
                viewerLogin={twitchUsername}
                onLoginWithToken={onLoginWithToken}
              />
            </Suspense>
          </div>

          {/* User Inspector Card */}
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
        </div>

        {/* Center Column: Live Chat with Mod Tools (Col span 5) */}
        <div className="col-span-12 lg:col-span-5 flex flex-col min-h-0 bg-[#111119]/80 border border-white/10 rounded-2xl overflow-hidden shadow-xl backdrop-blur-xl">
          <div className="shrink-0 p-2.5 bg-white/5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PhosphorIcon name="Chats" size={18} className="text-twitch-glow" weight="duotone" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Chat de Moderación</span>
            </div>
            <span className="text-[10px] text-text-muted">Clic en usuario para inspeccionar</span>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-twitch border-t-transparent rounded-full animate-spin" /></div>}>
              <Chat
                channel={channel}
                isLoggedIn={isLoggedIn}
                twitchToken={twitchToken}
                twitchUsername={twitchUsername}
                broadcasterId={broadcasterId}
                userId={userId}
                isModerator={roleState.isModerator}
                isBroadcaster={roleState.isBroadcaster}
                viewerLogin={twitchUsername}
                onLoginWithToken={onLoginWithToken}
                onSelectUserForInspection={handleSelectUser}
                onMessagesUpdate={setChatMessages}
              />
            </Suspense>
          </div>
        </div>

        {/* Right Column: Audit Logs & Active Users / Team (Col span 3) */}
        <div className="col-span-12 lg:col-span-3 flex flex-col min-h-0 bg-[#111119]/80 border border-white/10 rounded-2xl overflow-hidden shadow-xl backdrop-blur-xl">
          {/* Header Switcher */}
          <div className="shrink-0 p-2 border-b border-white/10 bg-white/5 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setRightPanelTab('audit')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  rightPanelTab === 'audit'
                    ? 'bg-twitch/20 text-twitch-glow border border-twitch/40 shadow-sm'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <PhosphorIcon name="ClockCounterClockwise" size={14} />
                <span>Mod Log</span>
              </button>
              <button
                onClick={() => setRightPanelTab('users')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  rightPanelTab === 'users'
                    ? 'bg-twitch/20 text-twitch-glow border border-twitch/40 shadow-sm'
                    : 'text-white/60 hover:text-white'
                }`}
                title="Lista de Espectadores, Moderadores y VIPs"
              >
                <PhosphorIcon name="ChatsCircle" size={14} />
                <span>Espectadores y Mods</span>
              </button>
            </div>

            {rightPanelTab === 'audit' && modState.auditLog.length > 0 && (
              <button
                onClick={modState.clearAuditLog}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/50 hover:text-red-300 border border-white/10 hover:border-red-500/30 text-[11px] font-medium transition-all cursor-pointer"
                title="Vaciar registro local de acciones de moderación"
              >
                <PhosphorIcon name="Trash" size={13} />
                <span>Limpiar Log</span>
              </button>
            )}
          </div>

          {/* Panel Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {rightPanelTab === 'audit' ? (
              <ModActionFeed
                auditLog={modState.auditLog}
                onInspectUser={handleSelectUser}
                onClearLog={modState.clearAuditLog}
              />
            ) : (
              <ActiveModsPanel
                broadcasterId={broadcasterId}
                userId={userId}
                recentMessages={chatMessages}
                onInspectUser={handleSelectUser}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
export default ModView
