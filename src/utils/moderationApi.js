import { moderationHelix } from './twitch'

export function moderationOperation(kind, { channel, moderator, target, text, value, id } = {}, token) {
  const q = new URLSearchParams({ broadcaster_id: channel, moderator_id: moderator })
  const operations = {
    shield: ['moderation/shield_mode', 'PUT', { is_active: Boolean(value) }],
    shieldStatus: ['moderation/shield_mode', 'GET'],
    warn: ['moderation/warnings', 'POST', { data: { user_id: target, reason: text } }],
    terms: ['moderation/blocked_terms', 'GET'],
    addTerm: ['moderation/blocked_terms', 'POST', { text }],
    removeTerm: ['moderation/blocked_terms', 'DELETE'],
    announcement: ['chat/announcements', 'POST', { message: text, color: 'primary' }],
    automodSettings: ['moderation/automod/settings', 'GET'],
    updateAutomod: ['moderation/automod/settings', 'PUT', { overall_level: Number(value) }],
    suspicious: ['moderation/suspicious_users', 'PUT', { user_id: target, status: value }],
    removeSuspicious: ['moderation/suspicious_users', 'PUT', { user_id: target, status: 'NO_TREATMENT' }],
    pin: ['chat/pins', 'PUT'], unpin: ['chat/pins', 'DELETE'], pinned: ['chat/pins', 'GET'],
  }
  const entry = operations[kind]
  if (!Array.isArray(entry) || !/^[1-9]\d{0,31}$/.test(channel || '') || !/^[1-9]\d{0,31}$/.test(moderator || '')) return Promise.resolve({ success: false, error: { message: 'Operación de moderación inválida' } })
  if (kind === 'updateAutomod' && (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 4)) return Promise.resolve({ success: false, error: { message: 'Nivel AutoMod inválido' } })
  const invalid = message => Promise.resolve({ success: false, error: { message } })
  if (kind === 'shield' && typeof value !== 'boolean') return invalid('Estado Escudo inválido')
  if (['warn', 'suspicious', 'removeSuspicious'].includes(kind) && !/^[1-9]\d{0,31}$/.test(String(target || ''))) return invalid('Usuario inválido')
  if (['warn', 'addTerm', 'announcement'].includes(kind) && (typeof text !== 'string' || !text.trim() || text.length > 500)) return invalid('Texto requerido (máximo 500 caracteres)')
  if (kind === 'addTerm' && text.trim().length < 2) return invalid('El término debe contener al menos dos caracteres')
  if (kind === 'suspicious' && !['ACTIVE_MONITORING', 'RESTRICTED'].includes(value)) return invalid('Estado inválido')
  if (['removeTerm', 'pin', 'unpin'].includes(kind) && !/^[a-zA-Z0-9_-]{1,100}$/.test(String(id || ''))) return invalid('Identificador inválido')
  if (kind === 'removeTerm') q.set('id', id)
  if (kind === 'pin' || kind === 'unpin') q.set('message_id', id)
  const [path, method, body] = entry
  return moderationHelix(`https://api.twitch.tv/helix/${path}?${q}`, { method, token, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) }, { component: 'moderation', action: kind })
}
