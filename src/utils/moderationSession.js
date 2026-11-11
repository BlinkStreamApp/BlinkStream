import { startRewardEventSub } from './twitchEventSub'

export const MOD_SCOPES = {
  shield: 'moderator:manage:shield_mode', warn: 'moderator:manage:warnings',
  automod: 'moderator:manage:automod', terms: 'moderator:manage:blocked_terms',
  ban: 'moderator:manage:banned_users', messages: 'moderator:manage:chat_messages',
  settings: 'moderator:manage:chat_settings', unban: 'moderator:manage:unban_requests',
  suspicious: 'moderator:manage:suspicious_users', announcements: 'moderator:manage:announcements',
}

const TOPICS = [
  ['channel.moderate', '2'], ['automod.message.hold', '2'], ['automod.message.update', '2'],
  ['channel.suspicious_user.message', '1'], ['channel.suspicious_user.update', '1'],
  ['channel.unban_request.create', '1'], ['channel.unban_request.resolve', '1'],
  ['channel.shield_mode.begin', '1'], ['channel.shield_mode.end', '1'],
  ['channel.follow', '2'], ['channel.subscribe', '1'], ['channel.subscription.gift', '1'],
  ['channel.cheer', '1'], ['channel.raid', '1'],
]

export function initialModerationState() {
  return { status: 'connecting', activityPossibleGap: false, topics: {}, scopes: [], held: [], audit: [], suspicious: [], activity: [], revision: 0, modesRevision: 0 }
}

export function applyModerationEvent(state, frame) {
  const { event: e, type, id } = frame
  const timestamp = Date.parse(frame.timestamp) || Date.now()
  const next = { ...state, revision: state.revision + 1 }
  if (type === 'automod.message.hold') {
    const item = { id: e.message_id, userId: e.user_id, user: e.user_name || e.user_login, message: e.message?.text || '', reason: e.reason || e.automod?.category || 'AutoMod', timestamp }
    next.held = [...state.held.filter(x => x.id !== item.id), item].slice(-200)
  } else if (type === 'automod.message.update') {
    next.held = state.held.filter(x => x.id !== e.message_id)
  } else if (type === 'channel.moderate') {
    if (['slow', 'slowoff', 'followers', 'followersoff', 'emoteonly', 'emoteonlyoff', 'subscribers', 'subscribersoff', 'uniquechat', 'uniquechatoff'].includes(e.action)) next.modesRevision = state.modesRevision + 1
    const detail = e[e.action] || {}
    next.audit = [...state.audit, { id, action: e.action, moderator: e.moderator_user_name || e.moderator_user_login,
      target: detail.user_id, targetLogin: detail.user_login, targetName: detail.user_name || detail.user_login, reason: detail.reason,
      timestamp, success: true, source: 'eventsub' }].slice(-200)
  } else if (type?.startsWith('channel.suspicious_user.')) {
    const previous = state.suspicious.find(x => x.user_id === e.user_id)
    const item = { ...previous, ...e, timestamp, message: e.message?.text || previous?.message || '' }
    next.suspicious = [...state.suspicious.filter(x => x.user_id !== item.user_id), item].filter(x => String(x.low_trust_status).toLowerCase() !== 'none').slice(-200)
  } else if (type?.startsWith('channel.shield_mode.')) {
    next.shield = type.endsWith('.begin')
  } else if (type?.startsWith('channel.unban_request.')) {
    next.unbanRevision = (state.unbanRevision || 0) + 1
  } else {
    next.activity = [...state.activity, { id, type, event: e, timestamp }].slice(-200)
  }
  return next
}

const sessions = new Map()
export function acquireModerationSession({ broadcasterId, userId, token }) {
  const key = `${userId}:${broadcasterId}`
  let session = sessions.get(key)
  if (session && session.token !== token) { session.stop(); sessions.delete(key); session = null }
  if (!session) {
    session = { token, refs: 0, listeners: new Set(), state: initialModerationState(), stop: () => {} }
    const publish = update => {
      if (sessions.get(key) !== session) return
      session.state = { ...session.state, ...update }
      for (const listener of session.listeners) listener()
    }
    sessions.set(key, session)
    const condition = { broadcaster_user_id: String(broadcasterId), moderator_user_id: String(userId) }
    session.stop = startRewardEventSub({ broadcasterId, token, onStatus: ({ state }) => publish({ status: state, activityPossibleGap: session.state.activityPossibleGap || (state === 'reconnecting' && ['channel.moderate', 'channel.follow', 'channel.subscribe', 'channel.subscription.gift', 'channel.cheer', 'channel.raid'].some(type => session.state.topics[type] === 202)), ...(state === 'connected' ? {} : { topics: {} }) }), moderation: {
      userId, topics: TOPICS.map(([type, version]) => ({ type, version, condition: type === 'channel.raid' ? { to_broadcaster_user_id: String(broadcasterId) }
        : ['channel.subscribe', 'channel.subscription.gift', 'channel.cheer'].includes(type) ? { broadcaster_user_id: String(broadcasterId) } : condition })),
      onIdentity: ({ scopes }) => publish({ scopes }),
      onTopics: topics => {
        if (sessions.get(key) !== session) return
        publish({ topics: { ...session.state.topics, ...Object.fromEntries(topics.map(t => [t.type, t.status])) } })
      },
      onEvent: frame => publish(applyModerationEvent(session.state, frame)),
    } })
  }
  session.refs++
  let released = false
  return {
    subscribe: listener => { session.listeners.add(listener); return () => session.listeners.delete(listener) },
    snapshot: () => session.state,
    removeHeld: id => { if (sessions.get(key) !== session) return; session.state = { ...session.state, held: session.state.held.filter(x => x.id !== id) }; for (const listener of session.listeners) listener() },
    release: () => { if (released) return; released = true; if (--session.refs === 0) { session.stop(); session.listeners.clear(); if (sessions.get(key) === session) sessions.delete(key) } },
  }
}
