import { describe, expect, it } from 'vitest'
import { parseChatGifs } from './chatGifs'

const url = 'https://media4.giphy.com/media/joSNxeswxuc74Juo8X/giphy.gif?cid=example&ep=v1_gifs_trending&rid=giphy.gif&ct=g'
describe('Twitch IRC GIF ranges', () => {
  it('preserves the full URL and inclusive range from the Twitch documentation format', () => {
    const message = '[Y A Y Yes GIF by Djemilah Birnie]'
    expect(parseChatGifs(message, `0-33|joSNxeswxuc74Juo8X|${url}`)).toEqual([
      { start: 0, end: 34, id: 'joSNxeswxuc74Juo8X', url, text: message },
    ])
  })
  it('keeps commas and query parameters in URLs while separating multiple GIF entries', () => {
    const firstUrl = url + '&values=a,b'
    expect(parseChatGifs('[a] text [b]', `0-2|a|${firstUrl},9-11|b|${url}`)).toMatchObject([
      { start: 0, end: 3, text: '[a]', url: firstUrl }, { start: 9, end: 12, text: '[b]', url },
    ])
  })
  it('maps character positions to string offsets after a non-BMP emoji', () => {
    expect(parseChatGifs('😀 [a]!', `2-4|a|${url}`)).toMatchObject([{ start: 3, end: 6, text: '[a]' }])
  })
  it('uses positions after the ACTION prefix', () => {
    expect(parseChatGifs('\u0001ACTION [a]\u0001', `0-2|a|${url}`)).toMatchObject([{ start: 8, end: 11, text: '[a]' }])
  })
  it.each(['javascript:alert(1)', 'data:image/gif;base64,AA', 'http://media.giphy.com/a.gif', 'https://media.giphy.com.evil.test/a.gif', 'https://127.0.0.1/a.gif', 'https://user:pass@media.giphy.com/a.gif', 'https://media.giphy.com:444/a.gif'])('does not auto-load untrusted media %s', untrusted => {
    expect(parseChatGifs('[a]', `0-2|a|${untrusted}`)).toEqual([])
  })
  it.each(['', undefined, `2-0|a|${url}`, `0-99|a|${url}`, `0-2|a|`, 'x'.repeat(32769)])('ignores malformed metadata', tag => {
    expect(parseChatGifs('[a]', tag)).toEqual([])
  })
  it('does not accept overlapping ranges', () => {
    expect(parseChatGifs('[a][b]', `0-2|a|${url},1-4|b|${url}`)).toHaveLength(1)
  })
})
