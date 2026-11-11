const EMOTE_RE = /^[\w-]+$/

export function buildEmoteTrie(emotes) {
  const root = {}
  for (const [code, data] of Object.entries(emotes)) {
    if (!EMOTE_RE.test(code)) continue
    const key = code
    let node = root
    for (const ch of key) {
      if (!node[ch]) node[ch] = {}
      node = node[ch]
    }
    node.$ = data
  }
  return root
}

export function matchEmotesInText(text, twitchEmotesStr, trie, gifs = []) {
  const emoteMap = {}
  const gifMap = new Map(gifs.map(gif => [gif.start, gif]))
  if (twitchEmotesStr) {
    twitchEmotesStr.split('/').forEach(pair => {
      const [id, positions] = pair.split(':')
      if (id && positions) {
        positions.split(',').forEach(range => {
          const [start, end] = range.split('-')
          const span = { id, start: Number(start), end: Number(end) + 1 }
          if (!gifs.some(gif => span.start < gif.end && span.end > gif.start)) emoteMap[span.start] = span
        })
      }
    })
  }

  const isWordChar = (ch) => /[\w\u00C0-\u024F]/.test(ch)

  const hasWordBoundaries = (start, end) => {
    const beforeOk = start === 0 || !isWordChar(text[start - 1])
    const afterOk = end >= text.length || !isWordChar(text[end])
    return beforeOk && afterOk
  }
  const standaloneChill = text.trim().toLowerCase() === 'chill'
  const canRenderAlias = (start, end) => standaloneChill || text.slice(start, end).toLowerCase() !== 'chill'

  const parts = []
  let i = 0
  while (i < text.length) {
    if (gifMap.has(i)) {
      const gif = gifMap.get(i)
      parts.push({ type: 'gif', ...gif })
      i = gif.end
      continue
    }
    if (emoteMap[i]) {
      const em = emoteMap[i]
      parts.push({ type: 'twitch-emote', id: em.id, text: text.slice(em.start, em.end) })
      i = em.end
      continue
    }

    let node = trie
    let bestMatch = null
    let bestLen = 0
    const remainingText = text.slice(i)
    for (let j = 0; j < remainingText.length && node[remainingText[j]]; j++) {
      node = node[remainingText[j]]
      if (node.$ && j + 1 > bestLen && hasWordBoundaries(i, i + j + 1) && canRenderAlias(i, i + j + 1) && !gifs.some(gif => i < gif.end && i + j + 1 > gif.start)) {
        bestMatch = node.$
        bestLen = j + 1
      }
    }
    if (bestMatch) {
      parts.push({ type: 'third-party-emote', urls: bestMatch.urls, name: text.slice(i, i + bestLen) })
      i += bestLen
      continue
    }

    let textStart = i
    i++
    while (i < text.length) {
      if (emoteMap[i] || gifMap.has(i)) break
      let found = false
      const ch = text[i]
      if (trie[ch]) {
        let n = trie[ch]
        if (n.$ && hasWordBoundaries(i, i + 1) && canRenderAlias(i, i + 1)) found = true
        for (let j = i + 1; j < text.length && n[text[j]]; j++) {
          n = n[text[j]]
          if (n.$ && hasWordBoundaries(i, j + 1) && canRenderAlias(i, j + 1)) { found = true; break }
        }
      }
      if (found) break
      i++
    }
    parts.push({ type: 'text', text: text.slice(textStart, i) })
  }
  return parts
}
