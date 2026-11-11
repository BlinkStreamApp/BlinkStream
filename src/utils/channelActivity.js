const URL = 'wss://pubsub-edge.twitch.tv'
const sessions = new Map()
const chatRows = new WeakMap()
const enrichedRows = new WeakMap()
export const EMPTY_CHANNEL_ACTIVITY = Object.freeze({ state: 'idle', possibleGap: false, redemptions: [], predictions: [], polls: [] })
const text = (value, limit = 500) => typeof value === 'string' ? value.slice(0, limit) : ''
const keyFor = ({ accountId, channelId }) => `${accountId || 'guest'}:${channelId}`
const valid = scope => /^[0-9]{1,32}$/.test(String(scope?.channelId || '')) && /^[a-z0-9_]{1,25}$/.test(scope?.channel || '')
const status = value => ['UNFULFILLED', 'FULFILLED', 'CANCELED', 'CONFIRMED'].includes(value) ? value : 'OBSERVED'

export function normalizeChannelRedemption(raw, scope, source = 'public') {
  if (!valid(scope) || !raw || String(raw.channel_id || raw.broadcaster_id || scope.channelId) !== String(scope.channelId)) return null
  const reward = raw.reward || {}, user = raw.user && typeof raw.user === 'object' ? raw.user : {}
  const id = text(raw.id, 128), rewardId = text(raw.reward_id || reward.id, 128)
  const title = text(raw.reward_title || reward.title), userId = text(raw.user_id || user.id, 32)
  const login = text(raw.user_login || user.login || (typeof raw.user === 'string' ? raw.user : ''), 25)
  const cost = raw.cost ?? reward.cost
  if (!id || !rewardId || !title || !/^[0-9]{1,32}$/.test(userId) || !Number.isSafeInteger(cost) || cost < 0) return null
  return { id, channel: scope.channel, broadcaster_id: String(scope.channelId), user_id: userId,
    user_login: login, user_name: text(raw.user_name || user.display_name || login, 50), reward_id: rewardId,
    reward_title: title, cost, user_input: text(raw.user_input, 500), source, manageable: false,
    status: source === 'local-confirmed' ? 'CONFIRMED' : status(String(raw.status || '').toUpperCase()),
    redeemed_at: Number.isFinite(Date.parse(raw.redeemed_at)) ? raw.redeemed_at : new Date().toISOString(),
    localRequestId: text(raw.localRequestId, 32) }
}

export function mergeRedemptionMessages(messages, redemptions) {
  const replacements = new Set(redemptions.map(r => r.localRequestId && `reward:local-${r.localRequestId}`).filter(Boolean))
  const result = messages.filter(m => !replacements.has(m.id))
  const seen = new Set(result.map(m => m.redemption_id || m.id))
  const matched = new Set()
  for (const rd of redemptions) {
    if (seen.has(rd.id) || seen.has(`reward:${rd.id}`)) continue
    seen.add(rd.id)
    if (!chatRows.has(rd)) chatRows.set(rd, { id: `reward:${rd.id}`, redemption_id: rd.id, channel: rd.channel, user_id: rd.user_id,
      user: rd.user_name || rd.user_login, user_login: rd.user_login, message: '', text: '',
      isNotice: true, isReward: true, eventType: 'reward', custom_reward_id: rd.reward_id,
      reward_title: rd.reward_title, cost: rd.cost, source: rd.source, timestamp: Date.parse(rd.redeemed_at),
      eventHeader: `${rd.user_name || rd.user_login} · ${rd.reward_title} (${rd.cost.toLocaleString()} pts)`,
      eventColorClass: 'from-purple-950/60 to-indigo-950/30 border-purple-500/50 text-purple-200' })
    const ircIndex = result.findIndex((m, index) => !matched.has(index) && !m.redemption_id && m.custom_reward_id === rd.reward_id &&
      String(m.user_id) === rd.user_id && (m.message || m.text || '') === rd.user_input && Math.abs((m.timestamp || 0) - Date.parse(rd.redeemed_at)) < 5000)
    if (ircIndex < 0) result.push(chatRows.get(rd))
    else {
      matched.add(ircIndex)
      const irc = result[ircIndex]
      if (enrichedRows.get(irc)?.rd !== rd) enrichedRows.set(irc, { rd, row: { ...irc, ...chatRows.get(rd), id: irc.id, message: irc.message, text: irc.text } })
      result[ircIndex] = enrichedRows.get(irc).row
    }
  }
  return result.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).slice(-500)
}

function publish(session, changes) {
  session.state = { ...session.state, ...changes }
  session.listeners.forEach(listener => listener())
}
function entry(scope) {
  if (!valid(scope)) return null
  const key = keyFor(scope)
  if (!sessions.has(key)) {
    if (sessions.size >= 16) {
      const idle = [...sessions].find(([, s]) => s.refs === 0)
      if (!idle) return null
      idle[1].stop(); sessions.delete(idle[0])
    }
    sessions.set(key, { scope: { ...scope, accountId: String(scope.accountId || ''), channelId: String(scope.channelId) }, refs: 0, connections: 0, state: EMPTY_CHANNEL_ACTIVITY, listeners: new Set(), stop: () => {} })
  }
  return sessions.get(key)
}
export function recordChannelRedemption(scope, raw, source) {
  const session = entry(scope), rd = normalizeChannelRedemption(raw, scope, source)
  if (!session || !rd) return false
  const rows = session.state.redemptions
  const same = rows.find(r => r.id === rd.id)
  if (same && JSON.stringify(same) === JSON.stringify(rd)) return true
  const match = same || rows.find(r => (r.source === 'local-confirmed') !== (source === 'local-confirmed') && !r.localRequestId &&
    r.user_id === rd.user_id && r.reward_id === rd.reward_id && r.user_input === rd.user_input &&
    Math.abs(Date.parse(r.redeemed_at) - Date.parse(rd.redeemed_at)) < 10000)
  let merged = rd
  if (same?.localRequestId) merged = { ...rd, localRequestId: same.localRequestId }
  else if (match && match.source === 'local-confirmed') merged = { ...rd, localRequestId: match.id.replace(/^local-/, '') }
  else if (match && source === 'local-confirmed') merged = { ...match, localRequestId: rd.id.replace(/^local-/, '') }
  publish(session, { redemptions: [...rows.filter(r => r.id !== match?.id && r.id !== rd.id), merged].slice(-200) })
  return true
}
export function recordConfirmedViewerRedemption(scope, item, requestId, input) {
  if (!/^[a-f0-9]{32}$/i.test(requestId || '') || !/^[0-9]{1,32}$/.test(String(scope.accountId || ''))) return false
  return recordChannelRedemption(scope, { id: `local-${requestId}`, reward_id: item.id, reward_title: item.title,
    cost: item.cost, user_id: String(scope.accountId), user_login: scope.account, user_name: scope.account,
    user_input: typeof input === 'string' ? input.trim() : '', redeemed_at: new Date().toISOString() }, 'local-confirmed')
}
export function clearChannelActivity(accountId) {
  for (const [key, session] of sessions) if (session.scope.accountId === accountId) { session.stop(); sessions.delete(key) }
}
function applyPublic(session, topic, payload) {
  const channelId = String(session.scope.channelId)
  if (topic === `community-points-channel-v1.${channelId}` && ['reward-redeemed', 'redemption-status-update'].includes(payload.type)) {
    recordChannelRedemption(session.scope, payload.data?.redemption, 'public')
    return
  }
  const prediction = topic === `predictions-channel-v1.${channelId}`
  const poll = topic === `polls.${channelId}`
  if (!prediction && !poll) return
  const raw = prediction ? payload.data?.event : payload.data?.poll
  const id = text(raw?.id || raw?.poll_id, 128)
  if (!id) return
  const field = prediction ? 'predictions' : 'polls'
  const old = session.state[field].find(item => item.id === id)
  const choices = prediction ? raw.outcomes : raw.choices
  const normalized = { ...old, id, title: text(raw.title) || old?.title || '', status: text(raw.status, 32) || old?.status || 'UNKNOWN',
    [prediction ? 'outcomes' : 'choices']: Array.isArray(choices) ? choices.slice(0, 10).map(c => ({ id: text(c.id || c.choice_id, 128), title: text(c.title),
      ...(prediction ? { channel_points: Number.isSafeInteger(c.total_points) ? c.total_points : 0 } : { votes: Number.isSafeInteger(c.votes?.total) ? c.votes.total : 0 }) })) : old?.[prediction ? 'outcomes' : 'choices'] || [] }
  publish(session, { [field]: [normalized, ...session.state[field].filter(item => item.id !== id)].slice(0, 20) })
}
function connect(session) {
  let stopped = false, socket, retry, watchdog, ping, delay = 1000, confirmed = false
  const topics = [`community-points-channel-v1.${session.scope.channelId}`, `predictions-channel-v1.${session.scope.channelId}`, `polls.${session.scope.channelId}`]
  const cleanup = () => { clearTimeout(watchdog); clearInterval(ping); if (socket) { socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null; const old = socket; socket = null; old.close() } }
  const restart = () => {
    if (stopped || retry) return
    cleanup(); publish(session, { state: 'reconnecting', possibleGap: session.state.possibleGap || confirmed })
    retry = setTimeout(() => { retry = null; open() }, delay); delay = Math.min(delay * 2, 30000)
  }
  const arm = (owner, milliseconds = 45000) => { clearTimeout(watchdog); watchdog = setTimeout(() => { if (!stopped && socket === owner) restart() }, milliseconds) }
  const open = () => {
    if (stopped) return
    publish(session, { state: 'connecting' })
    try { socket = new WebSocket(URL) } catch { restart(); return }
    const activeSocket = socket, nonce = crypto.randomUUID()
    let acknowledged = false
    arm(activeSocket, 10000)
    socket.onopen = () => {
      if (stopped || socket !== activeSocket) return
      socket.send(JSON.stringify({ type: 'LISTEN', nonce, data: { topics } }))
      ping = setInterval(() => { if (!stopped && socket === activeSocket && activeSocket.readyState === 1) activeSocket.send(JSON.stringify({ type: 'PING' })) }, 30000)
    }
    socket.onmessage = ({ data }) => {
      if (stopped || socket !== activeSocket || typeof data !== 'string' || data.length > 131072) return
      let message
      try { message = JSON.parse(data) } catch { return }
      if (message.type === 'RESPONSE' && message.nonce === nonce) {
        if (message.error) { cleanup(); publish(session, { state: 'unavailable' }); return }
        acknowledged = confirmed = true; delay = 1000; arm(activeSocket); publish(session, { state: 'connected' })
      } else if (message.type === 'PONG' && acknowledged) arm(activeSocket)
      else if (message.type === 'RECONNECT') restart()
      else if (message.type === 'MESSAGE' && session.state.state === 'connected' && topics.includes(message.data?.topic)) {
        try { applyPublic(session, message.data.topic, JSON.parse(message.data.message)) } catch { /* Discard malformed public frames. */ }
      }
    }
    socket.onclose = socket.onerror = () => { if (!stopped && socket === activeSocket) restart() }
  }
  open()
  return () => { stopped = true; clearTimeout(retry); cleanup(); if (confirmed) publish(session, { possibleGap: true }) }
}
export function acquireChannelActivity(scope, network = false) {
  const session = entry(scope)
  if (!session) return { snapshot: () => EMPTY_CHANNEL_ACTIVITY, subscribe: () => () => {}, release: () => {} }
  session.refs++
  if (network && session.connections++ === 0) session.stop = connect(session)
  let released = false
  return { snapshot: () => session.state, subscribe: listener => { session.listeners.add(listener); return () => session.listeners.delete(listener) },
    release: () => { if (released) return; released = true; session.refs--; if (network && --session.connections === 0) { session.stop(); publish(session, { state: 'idle' }) } } }
}
