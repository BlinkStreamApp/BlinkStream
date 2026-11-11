import { expect, it } from 'vitest'
import { buildEmoteTrie, matchEmotesInText } from './chatEmotes'

const trie = buildEmoteTrie({ xdd: { urls: ['https://cdn.7tv.app/example.webp'] }, OMEGALUL: { urls: ['https://cdn.7tv.app/other.webp'] } })

it.each(['vamos chill hoy', 'chill xdd', 'hoy toca chill', 'chill!', 'Chill hoy'])('keeps the requested ambiguous word literal in a phrase: %s', text => {
  const catalog = buildEmoteTrie({ chill: { urls: ['calm.webp'] }, Chill: { urls: ['calm-cap.webp'] }, xdd: { urls: ['laugh.webp'] } })
  const parts = matchEmotesInText(text, '', catalog)
  expect(parts.filter(part => part.type === 'third-party-emote').map(part => part.name)).toEqual(text.includes('xdd') ? ['xdd'] : [])
  expect(parts.map(part => part.text ?? part.name).join('')).toBe(text)
})

it.each(['chill', '  chill  ', '\nchill\n'])('still renders an exact standalone chill message: %s', text => {
  const catalog = buildEmoteTrie({ chill: { urls: ['calm.webp'] } })
  expect(matchEmotesInText(text, '', catalog).filter(part => part.type === 'third-party-emote')).toMatchObject([{ name: 'chill' }])
})

it('does not override explicit Twitch emote positions with the literal-word rule', () => {
  expect(matchEmotesInText('hola chill fin', '25:5-9', buildEmoteTrie({ chill: { urls: ['calm.webp'] } })).filter(part => part.type !== 'text')).toEqual([{ type: 'twitch-emote', id: '25', text: 'chill' }])
})

it('preserves ordinary words when only an uppercase emote alias exists', () => {
  const catalog = buildEmoteTrie({ QUE: { urls: ['goku.webp'] }, xdd: { urls: ['laugh.webp'] } })
  const text = 'Que addon es el que marca los ccs así en el frame xdd'
  const parts = matchEmotesInText(text, '', catalog)
  expect(parts.filter(part => part.type === 'third-party-emote')).toMatchObject([{ name: 'xdd' }])
  expect(parts.map(part => part.text ?? part.name).join('')).toBe(text)
  expect(matchEmotesInText('hola QUE fin', '', catalog).filter(part => part.type === 'third-party-emote')).toMatchObject([{ name: 'QUE' }])
})

it('keeps aliases differing only in case distinct instead of overwriting each other', () => {
  const catalog = buildEmoteTrie({ Xdd: { urls: ['upper.webp'] }, xdd: { urls: ['lower.webp'] } })
  expect(matchEmotesInText('Xdd xdd XDD', '', catalog).filter(part => part.type === 'third-party-emote')).toMatchObject([
    { name: 'Xdd', urls: ['upper.webp'] }, { name: 'xdd', urls: ['lower.webp'] },
  ])
})

it.each(['xdd', 'hola xdd', 'hola xdd adiós', 'hola, xdd!', '😀 xdd', 'hola\nxdd'])('recognizes an emote within ordinary text: %s', text => {
  const parts = matchEmotesInText(text, '', trie)
  expect(parts.filter(part => part.type === 'third-party-emote')).toHaveLength(1)
  expect(parts.map(part => part.text ?? part.name).join('')).toBe(text)
})

it('preserves multiple emotes, surrounding text and Twitch metadata', () => {
  const parts = matchEmotesInText('hola xdd y Kappa OMEGALUL fin', '25:11-15', trie)
  expect(parts.filter(part => part.type !== 'text')).toMatchObject([
    { type: 'third-party-emote', name: 'xdd' }, { type: 'twitch-emote', id: '25', text: 'Kappa' },
    { type: 'third-party-emote', name: 'OMEGALUL' },
  ])
  expect(parts.map(part => part.text ?? part.name).join('')).toBe('hola xdd y Kappa OMEGALUL fin')
})

it.each(['axdd', 'xddsuffix', 'unaxddpalabra', 'texto desconocido'])('does not replace fragments inside words: %s', text => {
  expect(matchEmotesInText(text, '', trie)).toEqual([{ type: 'text', text }])
})

it('keeps GIF precedence over third-party codes inside its text', () => {
  const parts = matchEmotesInText('hola [xdd] xdd', '', trie, [{ start: 5, end: 10, text: '[xdd]', url: 'https://media.giphy.com/a.gif' }])
  expect(parts.map(part => part.type)).toEqual(['text', 'gif', 'text', 'third-party-emote'])
})

it('also recognizes single-character codes after text without matching word fragments', () => {
  const single = buildEmoteTrie({ x: { urls: ['https://cdn.7tv.app/example.webp'] } })
  expect(matchEmotesInText('texto x fin', '', single).filter(part => part.type === 'third-party-emote')).toHaveLength(1)
})
