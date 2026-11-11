import { measureFetch } from './perf'
import { getStoredToken } from './twitch'

const SOCKET_URL = 'wss://eventsub.wss.twitch.tv/ws'
const SUBSCRIPTION_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions'
const REDEMPTION_TYPES = [
  'channel.channel_points_custom_reward_redemption.add',
  'channel.channel_points_custom_reward_redemption.update',
]

// Owns every socket, request and timer for one mounted consumer.
export function startRewardEventSub({ broadcasterId, token, onRedemption, onStatus, moderation }) {
  let stopped = false
  let activeSocket = null
  let migrationSocket = null
  let retryTimer = null
  let retryDelay = 1000
  const connections = new Map()
  const requests = new Set()
  const seenMessages = new Set()

  const status = (state, message = '') => {
    if (!stopped) onStatus?.({ state, message })
  }
  const closeSocket = (socket) => {
    const connection = connections.get(socket)
    clearTimeout(connection?.timer)
    connections.delete(socket)
    socket.onmessage = socket.onclose = socket.onerror = null
    try { socket.close() } catch { /* Already closed. */ }
  }
  const disconnect = () => {
    for (const socket of connections.keys()) closeSocket(socket)
    activeSocket = migrationSocket = null
    for (const controller of requests) controller.abort()
  }
  const stop = () => {
    stopped = true
    clearTimeout(retryTimer)
    disconnect()
  }
  const unavailable = (message) => {
    status('unavailable', message)
    stop()
  }
  const request = async (url, options) => {
    const controller = new AbortController()
    requests.add(controller)
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await measureFetch(url, { ...options, signal: controller.signal })
      const data = await response.json().catch(() => null)
      return { ok: response.ok, status: response.status, data }
    } finally {
      clearTimeout(timer)
      requests.delete(controller)
    }
  }
  const retry = () => {
    if (stopped || retryTimer) return
    disconnect()
    status('reconnecting', 'Reconectando los avisos de canjes…')
    retryTimer = setTimeout(() => {
      retryTimer = null
      initialize()
    }, retryDelay)
    retryDelay = Math.min(retryDelay * 2, 60000)
  }
  const armTimeout = (socket, seconds) => {
    const connection = connections.get(socket)
    if (!connection) return
    clearTimeout(connection.timer)
    connection.timer = setTimeout(retry, seconds * 1000 + 1000)
  }

  const connect = (url, authorization, migrating = false) => {
    if (stopped) return
    let socket
    try { socket = new WebSocket(url) } catch { retry(); return }
    connections.set(socket, { timer: null, keepalive: 10, welcomed: false })
    if (migrating) migrationSocket = socket
    else activeSocket = socket
    armTimeout(socket, 15)

    socket.onmessage = async ({ data }) => {
      if (stopped || !connections.has(socket)) return
      let message
      try { message = JSON.parse(data) } catch { return }
      const connection = connections.get(socket)
      const type = message?.metadata?.message_type
      if (type === 'session_welcome') {
        if (connection.welcomed) return
        connection.welcomed = true
        const session = message.payload?.session
        if (!session?.id) { retry(); return }
        connection.keepalive = session.keepalive_timeout_seconds || 10
        armTimeout(socket, connection.keepalive)
        if (migrating) {
          const previous = activeSocket
          activeSocket = socket
          migrationSocket = null
          if (previous) closeSocket(previous)
          status('connected')
          return // Twitch transfers existing subscriptions during a handoff.
        }
        try {
          const topics = moderation ? moderation.topics : REDEMPTION_TYPES.map(type => ({ type, version: '1', condition: { broadcaster_user_id: String(broadcasterId) } }))
          const responses = await Promise.all(topics.map(topic => request(SUBSCRIPTION_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authorization.token}`,
              'Client-ID': authorization.clientId,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: topic.type,
              version: topic.version,
              condition: topic.condition,
              transport: { method: 'websocket', session_id: session.id },
            }),
          }).catch(() => ({ ok: false, status: 0 }))))
          if (stopped || !connections.has(socket)) return
          if (moderation) {
            moderation.onTopics?.(topics.map((topic, index) => ({ type: topic.type, status: responses[index].status })))
            if (responses.some(response => response.ok)) { retryDelay = 1000; status('connected') }
            else if (responses.some(response => response.status === 0 || response.status === 429 || response.status >= 500)) retry()
            else unavailable('Sin permisos para los eventos de moderación.')
          } else if (responses.some(response => response.status === 401 || response.status === 403)) {
            unavailable('Renueva la sesión del creador con permisos para recibir canjes.')
          } else if (responses.some(response => !response.ok)) {
            retry()
          } else {
            retryDelay = 1000
            status('connected')
          }
        } catch { if (connections.has(socket)) retry() }
      } else if (type === 'session_keepalive' || type === 'notification') {
        armTimeout(socket, connection.keepalive)
        if (type !== 'notification') return
        const subscriptionType = message.payload?.subscription?.type
        const event = message.payload?.event
        if (moderation) {
          const id = message.metadata.message_id
          const matchesOwner = subscriptionType === 'user.whisper.message'
            ? String(event?.to_user_id) === String(moderation.userId)
            : String(event?.broadcaster_user_id || event?.to_broadcaster_user_id) === String(broadcasterId)
          if (!moderation.topics.some(t => t.type === subscriptionType) || !event || !matchesOwner || !id || seenMessages.has(id)) return
          seenMessages.add(id)
          if (seenMessages.size > 500) seenMessages.delete(seenMessages.values().next().value)
          moderation.onEvent?.({ id, type: subscriptionType, event, timestamp: message.metadata.message_timestamp })
          return
        }
        if (!REDEMPTION_TYPES.includes(subscriptionType) || !event?.id ||
          String(event.broadcaster_user_id) !== String(broadcasterId)) return
        const messageId = message.metadata.message_id
        if (!messageId || seenMessages.has(messageId)) return
        seenMessages.add(messageId)
        if (seenMessages.size > 500) seenMessages.delete(seenMessages.values().next().value)
        onRedemption?.({
          ...event,
          reward_id: event.reward?.id,
          reward_title: event.reward?.title || 'Recompensa',
          cost: event.reward?.cost || 0,
          status: String(event.status || 'unfulfilled').toUpperCase(),
        }, subscriptionType.endsWith('.add'))
      } else if (type === 'session_reconnect') {
        if (migrationSocket || socket !== activeSocket) return
        const reconnectUrl = message.payload?.session?.reconnect_url
        try {
          const parsed = new URL(reconnectUrl)
          if (parsed.protocol !== 'wss:' || parsed.hostname !== 'eventsub.wss.twitch.tv' ||
            parsed.port || parsed.username || parsed.password) { retry(); return }
        } catch { retry(); return }
        connect(reconnectUrl, authorization, true)
      } else if (type === 'revocation') {
        if (moderation) {
          moderation.onTopics?.([{ type: message.payload?.subscription?.type, status: 403 }])
          return
        }
        unavailable('Twitch ha retirado el permiso para recibir canjes. Renueva la sesión del creador.')
      }
    }
    socket.onclose = () => {
      const wasCurrent = socket === activeSocket || socket === migrationSocket
      closeSocket(socket)
      if (wasCurrent) retry()
    }
    socket.onerror = () => {
      // The watchdog also covers connections that never produce a close event.
    }
  }

  async function initialize() {
    if (stopped) return
    status('connecting', 'Conectando los avisos de canjes…')
    try {
      const cleanToken = (token || await getStoredToken() || '').replace(/^oauth:/i, '')
      if (stopped) return
      if (!cleanToken) { unavailable('Inicia sesión para recibir avisos de canjes.'); return }
      const response = await request('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: `OAuth ${cleanToken}` },
      })
      if (stopped) return
      if (response.status === 401 || response.status === 403) {
        unavailable('Tu sesión ha caducado. Inicia sesión de nuevo.'); return
      }
      if (!response.ok) { retry(); return }
      const identity = response.data
      if (stopped) return
      if (!identity) { retry(); return }
      if (moderation) {
        if (String(identity.user_id) !== String(moderation.userId) || !identity.client_id) { unavailable('La cuenta de moderación no coincide.'); return }
        moderation.onIdentity?.({ scopes: identity.scopes || [], userId: identity.user_id })
        connect(SOCKET_URL, { token: cleanToken, clientId: identity.client_id })
        return
      }
      if (String(identity.user_id) !== String(broadcasterId)) {
        unavailable('Los avisos de canjes requieren la autorización del creador del canal. Puedes consultar el chat oficial.'); return
      }
      if (!identity.client_id || !identity.scopes?.some(scope =>
        scope === 'channel:read:redemptions' || scope === 'channel:manage:redemptions')) {
        unavailable('Renueva la sesión del creador con permisos para recibir canjes.'); return
      }
      connect(SOCKET_URL, { token: cleanToken, clientId: identity.client_id })
    } catch { if (!stopped) retry() }
  }

  if (broadcasterId) initialize()
  return stop
}
