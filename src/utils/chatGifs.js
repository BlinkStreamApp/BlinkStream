// Twitch IRC PRIVMSG: start-end|gifID|fullURL, with inclusive character ranges.
// https://dev.twitch.tv/docs/chat/irc/#privmsg-tags
export function parseChatGifs(message, tag) {
  if (typeof message !== 'string' || typeof tag !== 'string' || tag.length > 32768) return []
  const actionOffset = message.startsWith('\u0001ACTION ') ? 8 : 0
  const body = message.slice(actionOffset, actionOffset && message.endsWith('\u0001') ? -1 : undefined)
  const offsets = [actionOffset]
  for (const character of body) offsets.push(offsets.at(-1) + character.length)
  const entries = [...tag.matchAll(/(?:^|,)(\d+)-(\d+)\|([^|,]+)\|/g)].slice(0, 20)
  const result = []
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    const start = Number(entry[1]), end = Number(entry[2])
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end + 1 >= offsets.length) continue
    const url = tag.slice(entry.index + entry[0].length, entries[index + 1]?.index ?? tag.length)
    if (url.length > 4096 || /\s/.test(url) || [...url].some(character => character.charCodeAt(0) < 32)) continue
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || !/^(?:media\d*|i)\.giphy\.com$/.test(parsed.hostname)) continue
    } catch { continue }
    const range = { start: offsets[start], end: offsets[end + 1], id: entry[3], url }
    if (result.some(other => range.start < other.end && range.end > other.start)) continue
    result.push({ ...range, text: message.slice(range.start, range.end) })
  }
  return result.sort((a, b) => a.start - b.start)
}
