export function openNativeWhisper(user) {
  const login = String(user?.username || user?.user_login || user?.login || '').replace(/^@/, '').toLowerCase()
  if (!/^[a-z0-9_]{1,25}$/.test(login)) return false
  window.dispatchEvent(new CustomEvent('bs:whisper:open', { detail: {
    userId: String(user.userId || user.user_id || user.id || ''), username: login,
    displayName: user.displayName || user.user_name || login,
  } }))
  return true
}

export function openWhisperInbox() {
  window.dispatchEvent(new CustomEvent('bs:whisper:open', { detail: { inbox: true } }))
}

let unread = { account: '', count: 0 }
const unreadListeners = new Set()
export const subscribeWhisperUnread = listener => { unreadListeners.add(listener); return () => unreadListeners.delete(listener) }
export const getWhisperUnread = account => unread.account === account ? unread.count : 0
export function publishWhisperUnread(account, count) {
  if (!/^[0-9]{1,32}$/.test(account) || !Number.isSafeInteger(count) || count < 0 || count > 200) return
  if (unread.account === account && unread.count === count) return
  unread = { account, count }; unreadListeners.forEach(listener => listener())
}
export function clearWhisperUnread(account) {
  if (unread.account !== account) return
  unread = { account: '', count: 0 }; unreadListeners.forEach(listener => listener())
}

export function normalizeIncomingWhisper(frame, account) {
  const event = frame?.event, id = event?.whisper_id
  if (!/^[0-9]{1,32}$/.test(account) || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id) || String(event?.to_user_id) !== account || String(event?.from_user_id) === account) return null
  const from = String(event?.from_user_id || ''), username = String(event?.from_user_login || '').toLowerCase()
  const text = event?.whisper?.text
  if (!/^[0-9]{1,32}$/.test(from) || !/^[a-z0-9_]{1,25}$/.test(username) || typeof text !== 'string' || text.length > 1000 || [...text].length > 500 || !text.trim()) return null
  return { id, from, to: account, text, username, displayName: String(event.from_user_name || username).slice(0, 50), status: 'received' }
}

export function getWhisperThreads(events, account) {
  const threads = new Map()
  for (const event of events) {
    if (event.from !== account && event.to !== account) continue
    const userId = event.from === account ? event.to : event.from
    const previous = threads.get(userId)
    threads.delete(userId)
    threads.set(userId, { userId, username: event.username, displayName: event.displayName || event.username,
      text: event.text, unread: (previous?.unread || 0) + Number(Boolean(event.unread)) })
  }
  return [...threads.values()].reverse()
}
