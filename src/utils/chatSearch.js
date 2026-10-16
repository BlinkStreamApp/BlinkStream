// Shared with message rendering so "links only" matches the links users can open.
export const CHAT_URL_REGEX = /((?:https?:\/\/[^\s]+|www\.[^\s]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:tv|com|gg|co|io|net|org|es|me|app|dev|ai|live|pro|fm|store|shop|tech|space|site|online|ws|gs|xyz|club|info|biz|lat|uk|de|fr|br|nl|eu|ca|au|in|pl|tr|sr|st|su|se|no|fi|ch|at|gr|pt|dk|cz|hu|ro|sk|si|hr|bg|lt|lv|ee|ie|is|lu|mt|mc|by|kr|tw|hk|sg|ph|my|id|th|vn|ae|il|za|pr|ec|pe|uy|pa|do|ve|cr|gt|bo|ni|hn|py|sv|bz)(?:\/[^\s]*)?))/gi

export const EMPTY_CHAT_SEARCH = Object.freeze({ open: false, text: '', user: '', channel: '', linksOnly: false })

const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export function createChatSearchMatcher({ text = '', user = '', channel = '', linksOnly = false } = {}) {
  const textQuery = normalize(text.trim().slice(0, 200))
  const userQuery = normalize(user.trim().replace(/^@/, '').slice(0, 40))
  const source = channel.trim().replace(/^#/, '').toLowerCase()
  return message => {
    if (source && message.channel !== source) return false
    if (userQuery && ![message.user_login, message.user_name, message.user].some(name => normalize(name).includes(userQuery))) return false
    if (textQuery && !normalize(`${message.message || ''} ${message.eventHeader || ''}`).includes(textQuery)) return false
    if (linksOnly && !String(message.message || '').match(CHAT_URL_REGEX)) return false
    return true
  }
}
