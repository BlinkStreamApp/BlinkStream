import { useState, useEffect, useCallback, Suspense, lazy, useMemo } from 'react'
import { useModeration } from '../../hooks/useModeration'
import { useChannelRole } from '../../hooks/useChannelRole'
import { useManageRewards } from '../../hooks/useManageRewards'
import { ModQuickActionsBar } from './ModQuickActionsBar'
import { ModWidgetWrapper } from './ModWidgetWrapper'
import { ModViewLayoutDrawer, ALL_WIDGETS } from './ModViewLayoutDrawer'
import { UserInspectorCard } from './UserInspectorCard'
import { ModActionFeed } from './ModActionFeed'
import { ActiveModsPanel } from './ActiveModsPanel'
import { AutoModQueue } from './AutoModQueue'
import { UnbanRequestsPanel } from './UnbanRequestsPanel'
import { PredictionsPollsPanel } from './PredictionsPollsPanel'
import { ActivityFeed } from './ActivityFeed'
import { RewardsQueuePanel } from './RewardsQueuePanel'

const VideoPlayer = lazy(() => import('../VideoPlayer'))
const Chat = lazy(() => import('../Chat'))

const LAYOUT_STORAGE_KEY = 'bs.modview.layout.v3'

const DEFAULT_COLUMNS = [
  { id: 'col-0', span: 4, widgets: ['player', 'inspector'] },
  { id: 'col-1', span: 5, widgets: ['chat'] },
  { id: 'col-2', span: 3, widgets: ['log', 'users'] },
]

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
  const [isEditMode, setIsEditMode] = useState(false)
  const [draggedWidgetId, setDraggedWidgetId] = useState(null)

  // Load layout from localStorage or fallback
  const [columns, setColumns] = useState(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length === 3) return parsed
      }
    } catch {
      // ignore
    }
    return DEFAULT_COLUMNS
  })

  // Save layout changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(columns))
    } catch {
      // ignore
    }
  }, [columns])

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

  // Flat list of currently active widgets
  const activeWidgetIds = useMemo(() => {
    return columns.flatMap(c => c.widgets)
  }, [columns])

  // Toggle widget visibility
  const handleToggleWidget = useCallback((widgetId) => {
    setColumns(prevCols => {
      const isPresent = prevCols.some(c => c.widgets.includes(widgetId))
      if (isPresent) {
        // Remove from whichever column contains it
        return prevCols.map(c => ({
          ...c,
          widgets: c.widgets.filter(w => w !== widgetId),
        }))
      } else {
        // Add to column with the least widgets (prefer column 2 or 0)
        const targetColIdx = prevCols[2].widgets.length <= prevCols[0].widgets.length ? 2 : 0
        return prevCols.map((c, i) => {
          if (i === targetColIdx) {
            return { ...c, widgets: [...c.widgets, widgetId] }
          }
          return c
        })
      }
    })
  }, [])

  // Move widget across or within columns
  const handleMoveWidget = useCallback((widgetId, targetColIdx, targetRowIdx) => {
    setColumns(prevCols => {
      // 1. Remove from all columns
      const cleanCols = prevCols.map(c => ({
        ...c,
        widgets: c.widgets.filter(w => w !== widgetId),
      }))

      // 2. Insert into target column at targetRowIdx
      const destCol = cleanCols[targetColIdx]
      if (!destCol) return prevCols

      const newWidgets = [...destCol.widgets]
      const insertAt = Math.max(0, Math.min(targetRowIdx, newWidgets.length))
      newWidgets.splice(insertAt, 0, widgetId)

      return cleanCols.map((c, i) => (i === targetColIdx ? { ...c, widgets: newWidgets } : c))
    })
  }, [])

  // Reset to default layout
  const handleResetLayout = useCallback(() => {
    setColumns(DEFAULT_COLUMNS)
    try {
      localStorage.removeItem(LAYOUT_STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  // Drag & drop handlers
  const handleDragStart = (widgetId, e) => {
    setDraggedWidgetId(widgetId)
    e.dataTransfer.setData('text/plain', widgetId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (colIdx, targetRowIdx, e) => {
    e.preventDefault()
    const widgetId = e.dataTransfer.getData('text/plain') || draggedWidgetId
    if (widgetId) {
      handleMoveWidget(widgetId, colIdx, targetRowIdx)
    }
    setDraggedWidgetId(null)
  }

  // Render individual widget component by ID
  const renderWidgetContent = (widgetId, colIdx, rowIdx, colWidgets) => {
    const isFirstInCol = rowIdx === 0
    const isLastInCol = rowIdx === colWidgets.length - 1
    const canMoveLeft = colIdx > 0
    const canMoveRight = colIdx < columns.length - 1

    const meta = ALL_WIDGETS.find(w => w.id === widgetId) || {
      id: widgetId,
      title: 'Panel',
      icon: 'Shield',
    }

    const wrapperProps = {
      key: widgetId,
      widgetId,
      title: meta.title,
      icon: meta.icon,
      isEditMode,
      canMoveLeft,
      canMoveRight,
      canMoveUp: !isFirstInCol,
      canMoveDown: !isLastInCol,
      onMoveLeft: () => handleMoveWidget(widgetId, colIdx - 1, rowIdx),
      onMoveRight: () => handleMoveWidget(widgetId, colIdx + 1, rowIdx),
      onMoveUp: () => handleMoveWidget(widgetId, colIdx, rowIdx - 1),
      onMoveDown: () => handleMoveWidget(widgetId, colIdx, rowIdx + 1),
      onClose: () => handleToggleWidget(widgetId),
      draggable: true,
      onDragStart: (e) => handleDragStart(widgetId, e),
      onDragOver: handleDragOver,
      onDrop: (e) => handleDrop(colIdx, rowIdx, e),
      className: widgetId === 'player' && colWidgets.length > 1 ? 'shrink-0 aspect-video max-h-[300px]' : 'flex-1',
    }

    switch (widgetId) {
      case 'player':
        return (
          <ModWidgetWrapper {...wrapperProps}>
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
          </ModWidgetWrapper>
        )

      case 'chat':
        return (
          <ModWidgetWrapper {...wrapperProps}>
            <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-text-muted text-xs">Cargando chat...</div>}>
              <Chat
                channel={channel}
                broadcasterId={broadcasterId}
                userId={userId}
                isLoggedIn={isLoggedIn}
                isMod={true}
                isBroadcaster={roleState.isBroadcaster}
                viewerLogin={twitchUsername}
                onLoginWithToken={onLoginWithToken}
                onSelectUserForInspection={handleSelectUser}
                onMessagesUpdate={setChatMessages}
              />
            </Suspense>
          </ModWidgetWrapper>
        )

      case 'inspector':
        return (
          <ModWidgetWrapper {...wrapperProps}>
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
          </ModWidgetWrapper>
        )

      case 'log':
        return (
          <ModWidgetWrapper
            {...wrapperProps}
            headerRight={
              modState.auditLog.length > 0 ? (
                <button
                  onClick={modState.clearAuditLog}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 hover:bg-red-500/20 text-white/50 hover:text-red-300 text-[10px] cursor-pointer"
                  title="Vaciar log local"
                >
                  <PhosphorIcon name="Trash" size={11} />
                  <span>Limpiar</span>
                </button>
              ) : null
            }
          >
            <ModActionFeed
              auditLog={modState.auditLog}
              onInspectUser={handleSelectUser}
              onClearLog={modState.clearAuditLog}
            />
          </ModWidgetWrapper>
        )

      case 'users':
        return (
          <ModWidgetWrapper {...wrapperProps}>
            <ActiveModsPanel
              broadcasterId={broadcasterId}
              userId={userId}
              recentMessages={chatMessages}
              onInspectUser={handleSelectUser}
            />
          </ModWidgetWrapper>
        )

      case 'activity':
        return (
          <ModWidgetWrapper {...wrapperProps}>
            <ActivityFeed
              messages={chatMessages}
              onInspectUser={handleSelectUser}
            />
          </ModWidgetWrapper>
        )

      case 'automod':
        return (
          <ModWidgetWrapper {...wrapperProps}>
            <AutoModQueue
              broadcasterId={broadcasterId}
              userId={userId}
              heldMessages={heldMessages}
              onRemoveMessage={handleRemoveHeldMessage}
              onInspectUser={handleSelectUser}
            />
          </ModWidgetWrapper>
        )

      case 'unban':
        return (
          <ModWidgetWrapper {...wrapperProps}>
            <UnbanRequestsPanel
              broadcasterId={broadcasterId}
              userId={userId}
              onInspectUser={handleSelectUser}
            />
          </ModWidgetWrapper>
        )

      case 'predictions':
        return (
          <ModWidgetWrapper {...wrapperProps}>
            <PredictionsPollsPanel
              broadcasterId={broadcasterId}
              userId={userId}
            />
          </ModWidgetWrapper>
        )

      case 'rewards':
        return (
          <ModWidgetWrapper
            {...wrapperProps}
            badge={
              rewardsState.pendingRedemptions?.length > 0 ? (
                <span className="px-1.5 py-0.2 bg-twitch text-white text-[9px] font-bold rounded-full">
                  {rewardsState.pendingRedemptions.length}
                </span>
              ) : null
            }
          >
            <RewardsQueuePanel
              pendingRedemptions={rewardsState.pendingRedemptions}
              onFulfillRedemption={rewardsState.fulfillRedemption}
              onCancelRedemption={rewardsState.cancelRedemption}
              loading={rewardsState.loading}
              onRefresh={rewardsState.refresh}
              onInspectUser={handleSelectUser}
            />
          </ModWidgetWrapper>
        )

      default:
        return null
    }
  }

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

      {/* Customizable Dynamic 3-Column Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3 p-3 overflow-hidden">
        {columns.map((col, colIdx) => (
          <div
            key={col.id}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(colIdx, col.widgets.length, e)}
            className={`col-span-12 lg:col-span-${col.span} flex flex-col gap-3 min-h-0 overflow-hidden ${
              col.widgets.length === 0 ? 'border-2 border-dashed border-white/10 rounded-2xl flex items-center justify-center p-4' : ''
            }`}
          >
            {col.widgets.length === 0 ? (
              <div className="text-center text-text-muted text-xs space-y-1 select-none">
                <p className="font-semibold text-white/50">Columna Vacía</p>
                <p className="text-[10px]">Arrastra un panel aquí o usa el botón "Paneles".</p>
              </div>
            ) : (
              col.widgets.map((widgetId, rowIdx) => renderWidgetContent(widgetId, colIdx, rowIdx, col.widgets))
            )}
          </div>
        ))}
      </div>

      {/* Layout Customizer Drawer Modal */}
      <ModViewLayoutDrawer
        isOpen={isLayoutDrawerOpen}
        onClose={() => setIsLayoutDrawerOpen(false)}
        activeWidgetIds={activeWidgetIds}
        onToggleWidget={handleToggleWidget}
        isEditMode={isEditMode}
        onToggleEditMode={() => setIsEditMode(p => !p)}
        onResetLayout={handleResetLayout}
      />
    </div>
  )
}
export default ModView
