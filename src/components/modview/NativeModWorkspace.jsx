import { lazy, memo, Suspense, useCallback, useEffect, useState } from 'react'
import { useModeration } from '../../hooks/useModeration'
import { useChannelRole } from '../../hooks/useChannelRole'
import { useManageRewards } from '../../hooks/useManageRewards'
import { useModerationSession } from '../../hooks/useModerationSession'
import { MOD_SCOPES } from '../../utils/moderationSession'
import { moderationOperation } from '../../utils/moderationApi'
import { normalizeModViewConfig } from '../../utils/modViewConfig'
import { getUserIdByLogin } from '../../utils/twitch'
import { useT } from '../../utils/i18n'
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
import { NativeExtraTools, NativeUserActions, ToolFallback } from './NativeTools'
import PhosphorIcon from '../icons/PhosphorIcon'
import ViewerRewardsPanel from './ViewerRewardsPanel'
import { useChannelActivity } from '../../hooks/useChannelActivity'

const VideoPlayer = memo(lazy(() => import('../VideoPlayer')))
const Chat = lazy(() => import('../Chat'))
const activityTypes = { 'channel.cheer': 'bits', 'channel.raid': 'raid', 'channel.subscribe': 'sub', 'channel.subscription.gift': 'subgift', 'channel.follow': 'follow' }
const STORAGE = 'bs.modview.config.v4'
const TOOLS = [['audit', 'ClockCounterClockwise'], ['users', 'Users'], ['activity', 'Lightning'], ['automod', 'ShieldCheck'], ['unban', 'Heart'], ['predictions', 'ChartBar'], ['rewards', 'Gift'], ['suspicious', 'WarningCircle'], ['terms', 'TextAa'], ['protection', 'SlidersHorizontal'], ['chatTools', 'Broadcast']]
const EVENT_TOOLS = { audit: ['channel.moderate'], automod: ['automod.message.hold', 'automod.message.update'], suspicious: ['channel.suspicious_user.message', 'channel.suspicious_user.update'], unban: ['channel.unban_request.create', 'channel.unban_request.resolve'], activity: ['channel.follow', 'channel.subscribe', 'channel.subscription.gift', 'channel.cheer', 'channel.raid'] }

export function BlinkStreamModView({ channel, broadcasterId, userId, isLoggedIn, twitchToken, twitchUsername, volume, onVolumeChange, quality, onQualityChange, onExit, onLoginWithToken, onOpenOfficial }) {
  const t = useT()
  const [resolved, setResolved] = useState(null)
  useEffect(() => {
    if (broadcasterId || !channel) return
    let cancelled = false
    getUserIdByLogin(channel).then(id => { if (!cancelled) setResolved({ channel, id }) }).catch(() => {})
    return () => { cancelled = true }
  }, [broadcasterId, channel])
  const channelId = broadcasterId || (resolved?.channel === channel ? resolved.id : null)
  const publicActivity = useChannelActivity({ accountId: String(userId || ''), channel, channelId })
  const mod = useModeration({ broadcasterId: channelId, userId })
  const role = useChannelRole({ broadcasterId: channelId, userId, channel })
  const rewards = useManageRewards({ broadcasterId: role.isBroadcaster ? channelId : null, channel, token: twitchToken })
  const { state: live, removeHeld } = useModerationSession({ broadcasterId: isLoggedIn ? channelId : null, userId, token: twitchToken })
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [config, setConfig] = useState(() => { try { return normalizeModViewConfig(JSON.parse(localStorage.getItem(STORAGE))) } catch { return normalizeModViewConfig() } })
  const [tool, setTool] = useState(config.activeTab === 'users' ? 'audit' : config.activeTab || 'audit')
  const [drawer, setDrawer] = useState(false)
  const [communityOpen, setCommunityOpen] = useState(false)
  const [modes, setModes] = useState({})
  const [shield, setShield] = useState(false)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const closeDrawer = useCallback(() => setDrawer(false), [])
  const inspect = useCallback(user => { setSelected(user); setCommunityOpen(true); setConfig(c => ({ ...c, showInspector: true, showCommunity: true })) }, [])
  useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify({ ...config, activeTab: config.enabledTabs.includes(tool) ? tool : 'audit' })) } catch {} }, [config, tool])
  const { fetchChatSettings } = mod
  useEffect(() => {
    let cancelled = false
    fetchChatSettings?.().then(settings => {
      if (!settings || cancelled) return
      setModes({ slow: settings.slow_mode ? settings.slow_mode_wait_time : false, followers: settings.follower_mode ? settings.follower_mode_duration : false, emoteonly: settings.emote_mode, subscribers: settings.subscriber_mode })
    })
    return () => { cancelled = true }
  }, [fetchChatSettings, live.modesRevision])
  const shieldAllowed = live.scopes.includes(MOD_SCOPES.shield) && (role.isModerator || role.isBroadcaster)
  useEffect(() => {
    if (!shieldAllowed) return
    let cancelled = false
    moderationOperation('shieldStatus', { channel: channelId, moderator: userId }, twitchToken).then(result => {
      if (!cancelled && result.success) setShield(Boolean(result.value?.data?.[0]?.is_active))
    })
    return () => { cancelled = true }
  }, [channelId, userId, twitchToken, shieldAllowed, live.shield])
  const changeShield = async active => {
    if (!shieldAllowed || pending) return
    setPending(true); setNotice('')
    try {
      const result = await moderationOperation('shield', { channel: channelId, moderator: userId, value: active }, twitchToken)
      if (result.success) setShield(Boolean(result.value?.data?.[0]?.is_active))
      else setNotice(result.error?.message || t('mod.native.unavailable'))
    } catch { setNotice(t('mod.native.unconfirmed')) } finally { setPending(false) }
  }
  const setMode = async (name, value) => {
    const success = await mod.setChatMode?.(name, value)
    if (success) setModes(previous => ({ ...previous, [name.replace(/off$/, '')]: name.endsWith('off') ? false : value ?? true }))
  }

  const eventMessages = live.activity.filter(item => activityTypes[item.type]).map(item => ({ id: item.id, source: 'eventsub', timestamp: item.timestamp, eventType: activityTypes[item.type], user: item.event.user_name || item.event.from_broadcaster_user_name, user_login: item.event.user_login || item.event.from_broadcaster_user_login, user_id: item.event.user_id || item.event.from_broadcaster_user_id, bits: item.event.bits, eventHeader: item.event.user_name || item.event.from_broadcaster_user_name || '' }))
  const audit = [...(mod.auditLog || []), ...live.audit].sort((a, b) => a.timestamp - b.timestamp)
  const closeInspector = () => setSelected(null)
  const toggleCommunity = () => {
    if (window.matchMedia('(min-width:1440px)').matches) setConfig(c => ({ ...c, showCommunity: !c.showCommunity }))
    else { setCommunityOpen(v => !v); setConfig(c => ({ ...c, showCommunity: true })) }
  }
  const openTool = id => { if (id === 'users') { setCommunityOpen(true); setConfig(c => ({ ...c, showCommunity: true })) } else setTool(id) }
  const shared = { broadcasterId: channelId, userId, token: twitchToken, isLoggedIn, onLoginWithToken, onInspectUser: inspect }
  const selectedId = selected?.userId || selected?.user_id || selected?.id
  return <div className={`native-mod-root ${communityOpen ? 'community-open' : ''} ${config.showCommunity ? '' : 'community-hidden'} ${tool !== 'audit' ? 'tools-open' : ''} ${config.preset === 'chat_left' ? 'chat-left' : ''}`}>
    <ModQuickActionsBar channel={channel} activeModes={modes} onSetMode={setMode} onClearChat={mod.clearChat} onExit={onExit} remainingActions={mod.remainingActions} onOpenLayoutDrawer={() => setDrawer(true)} shieldActive={shield} onShieldChange={changeShield} shieldAvailable={shieldAllowed} shieldPending={pending} />
    <div className="native-mod-status"><span>{role.isBroadcaster ? t('mod.native.creator') : role.isModerator ? t('mod.native.moderator') : t('mod.native.viewer')} · {t(`mod.native.${live.status === 'connected' ? 'connected' : live.status === 'unavailable' ? 'unavailable' : 'connecting'}`)}</span>
      <button type="button" onClick={toggleCommunity}>{t('mod.native.community')}</button><button type="button" onClick={onOpenOfficial}>{t('mod.native.openOfficial')}</button>
      <details className="native-mod-capabilities"><summary>{t('mod.native.capabilities')}</summary><ul>{Object.entries(EVENT_TOOLS).map(([id, topics]) => { const connected = topics.filter(type => live.topics[type] === 202).length; return <li key={id}>{t(`mod.native.${id}`)}: {t(connected === topics.length ? 'mod.native.connected' : connected ? 'mod.native.partial' : 'mod.native.unavailable')}</li> })}</ul></details>
    </div>
    {notice && <p role="alert" className="native-mod-notice">{notice}</p>}
    <div className="native-mod-grid" style={{ '--native-work-weight': `${config.workWeight || 1}fr` }}>
      <nav className="native-mod-dock" aria-label={t('mod.native.tools')}>{TOOLS.filter(([id]) => config.enabledTabs.includes(id)).map(([id, icon]) => <button key={id} aria-pressed={tool === id} title={t(`mod.native.${id}`)} aria-label={t(`mod.native.${id}`)} onClick={() => openTool(id)}><PhosphorIcon name={icon} size={20} />{((id === 'automod' && live.held.length) || (id === 'suspicious' && live.suspicious.length)) > 0 && <small>{id === 'automod' ? live.held.length : live.suspicious.length}</small>}</button>)}</nav>
      <main className="native-mod-work">
        <section className="native-mod-monitor" hidden={!config.showPlayer || config.preset === 'no_player'}>{config.showPlayer && config.preset !== 'no_player' && <Suspense fallback={<p>{t('mod.native.loading')}</p>}><VideoPlayer channel={channel} volume={volume} onVolumeChange={onVolumeChange} quality={quality} onQualityChange={onQualityChange} isLoggedIn={isLoggedIn} twitchToken={twitchToken} twitchUsername={twitchUsername} viewerLogin={twitchUsername} broadcasterId={channelId} isModerator={role.isModerator} isBroadcaster={role.isBroadcaster} compact={true} theatreMode={false} onLoginWithToken={onLoginWithToken} /></Suspense>}</section>
        <div className={`native-mod-panels ${tool !== 'audit' ? 'single-tool' : ''}`}>
          <section className="native-mod-panel"><header><strong>{t(`mod.native.${tool}`)}</strong><button type="button" onClick={onOpenOfficial} title={t('mod.native.openOfficial')}><PhosphorIcon name="ArrowSquareOut" size={16} /></button></header>
            <div className="native-mod-panel-body">
              {tool === 'audit' ? <ModActionFeed auditLog={audit} onInspectUser={inspect} /> : tool === 'activity' ? <ActivityFeed moderationEvents={live.audit} possibleGap={publicActivity.possibleGap || live.activityPossibleGap} connectionState={publicActivity.state} messages={[...messages, ...eventMessages]} recentRedemptions={[...(rewards.pendingRedemptions || []), ...(rewards.fulfilledRedemptions || []), ...publicActivity.redemptions]} onInspectUser={inspect} />
                : tool === 'automod' ? <AutoModQueue {...shared} heldMessages={live.held} onRemoveMessage={removeHeld} connected={live.topics['automod.message.hold'] === 202} />
                  : tool === 'unban' ? <UnbanRequestsPanel refreshKey={live.unbanRevision || 0} {...shared} />
                    : tool === 'predictions' ? <><ToolFallback onOpenOfficial={onOpenOfficial}>{t('mod.native.creatorTools')}</ToolFallback><PredictionsPollsPanel {...shared} channel={channel} canManage={role.isBroadcaster} publicActivity={publicActivity} /></>
                      : tool === 'rewards' ? <div className="native-rewards-columns"><ViewerRewardsPanel account={isLoggedIn ? twitchUsername : ''} userId={userId} channel={channel} onOpenOfficial={onOpenOfficial} /><RewardsQueuePanel observedRedemptions={publicActivity.redemptions} feedState={publicActivity.state} showSummary={false} canManage={role.isBroadcaster} key={`${userId}:${channelId}`} channel={channel} account={isLoggedIn ? twitchUsername : ''} messages={messages} onOpenOfficial={onOpenOfficial} {...rewards} onFulfillRedemption={rewards.fulfillRedemption} onCancelRedemption={rewards.cancelRedemption} onRefresh={rewards.refresh} onInspectUser={inspect} /></div>
                        : <NativeExtraTools key={tool} type={tool} channelId={channelId} userId={userId} token={twitchToken} scopes={role.isModerator || role.isBroadcaster ? live.scopes : []} messages={messages} suspicious={live.suspicious} onInspectUser={inspect} onOpenOfficial={onOpenOfficial} />}
            </div>
          </section>
          <section className="native-mod-panel native-mod-automod" hidden={tool !== 'audit'}><header><strong>AutoMod ({live.held.length})</strong></header><div className="native-mod-panel-body"><AutoModQueue {...shared} heldMessages={live.held} onRemoveMessage={removeHeld} connected={live.topics['automod.message.hold'] === 202} /></div></section>
        </div>
        <label className="native-mod-width">{t('mod.native.workspaceSize')}<input aria-label={t('mod.native.workspaceSize')} type="range" min="0.7" max="1.8" step="0.1" value={config.workWeight || 1} onChange={e => setConfig(c => ({ ...c, workWeight: Number(e.target.value) }))} /></label>
      </main>
      <section className="native-mod-panel native-mod-chat"><header><strong>{t('mod.chat.title', 'Chat de Moderación')}</strong></header><div className="native-mod-panel-body"><Suspense fallback={<p>{t('mod.native.loading')}</p>}><Chat channel={channel} broadcasterId={channelId} userId={userId} isLoggedIn={isLoggedIn} twitchToken={twitchToken} twitchUsername={twitchUsername} isMod={role.isModerator || role.isBroadcaster} isModerator={role.isModerator} isBroadcaster={role.isBroadcaster} viewerLogin={twitchUsername} onLoginWithToken={onLoginWithToken} onSelectUserForInspection={inspect} onMessagesUpdate={setMessages} /></Suspense></div></section>
      <aside className="native-mod-panel native-mod-community" hidden={!config.showCommunity}><header><strong>{t('mod.native.community')}</strong><button type="button" aria-label={t('mod.native.close')} onClick={() => setCommunityOpen(false)}><PhosphorIcon name="X" size={16} /></button></header><div className="native-mod-panel-body">
        {selected && config.showInspector ? <><UserInspectorCard targetUser={selected} recentMessages={messages} onTimeout={mod.timeout} onBan={mod.ban} onUnban={mod.unban} onClose={closeInspector} onSelectUser={inspect} isBroadcaster={role.isBroadcaster} /><NativeUserActions key={selectedId} channelId={channelId} userId={userId} targetId={selectedId} token={twitchToken} scopes={role.isModerator || role.isBroadcaster ? live.scopes : []} /><ToolFallback onOpenOfficial={onOpenOfficial}>{t('mod.native.extendedActions')}</ToolFallback></>
          : <ActiveModsPanel broadcasterId={channelId} channelLogin={channel} userId={userId} recentMessages={messages} onInspectUser={inspect} />}
      </div></aside>
    </div>
    <ModViewLayoutDrawer isOpen={drawer} onClose={closeDrawer} config={config} onChangeConfig={next => { setConfig(normalizeModViewConfig(next)); if (!next.enabledTabs.includes(tool)) setTool('audit') }} onResetDefaults={() => { setConfig(normalizeModViewConfig()); setTool('audit') }} />
  </div>
}
