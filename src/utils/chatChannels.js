export function normalizeChatChannels(channels) {
  return [...new Set((channels || []).map(channel => String(channel || '').trim().replace(/^#/, '').toLowerCase()).filter(channel => /^[a-z0-9_]{1,25}$/.test(channel)))].slice(0, 4)
}

export function parseIrcEnvelope(line) {
  let rest = line.trim(), tags = '', prefix = ''
  if (rest.startsWith('@')) {
    const end = rest.indexOf(' ')
    if (end < 0) return null
    tags = rest.slice(1, end)
    rest = rest.slice(end + 1).trimStart()
  }
  if (rest.startsWith(':')) {
    const end = rest.indexOf(' ')
    if (end < 0) return null
    prefix = rest.slice(1, end)
    rest = rest.slice(end + 1).trimStart()
  }
  const parts = `${prefix ? `:${prefix} ` : ''}${rest}`.split(' ')
  const command = rest.split(' ', 1)[0]
  const target = rest.slice(command.length).trimStart().split(' ', 1)[0]
  return { tags, parts, command, channel: target?.startsWith('#') ? target.slice(1).toLowerCase() : '', prefix }
}

const channelAccents = [
  'border-violet-400/30 bg-violet-500/15 text-violet-200',
  'border-fuchsia-400/30 bg-fuchsia-500/15 text-fuchsia-200',
  'border-sky-400/30 bg-sky-500/15 text-sky-200',
  'border-teal-400/30 bg-teal-500/15 text-teal-200',
]

export function chatChannelAccent(channel, channels = []) {
  const assigned = new Map(), used = new Set()
  for (const name of normalizeChatChannels(channels).sort()) {
    let hash = 0
    for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
    let index = hash % channelAccents.length
    while (used.has(index)) index = (index + 1) % channelAccents.length
    used.add(index)
    assigned.set(name, channelAccents[index])
  }
  if (assigned.has(channel)) return assigned.get(channel)
  let hash = 0
  for (const character of channel || '') hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return channelAccents[hash % channelAccents.length]
}
