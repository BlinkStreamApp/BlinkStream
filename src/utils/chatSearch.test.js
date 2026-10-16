import { describe, expect, it } from 'vitest'
import { CHAT_URL_REGEX, createChatSearchMatcher } from './chatSearch'

const message = { channel: 'alpha', user_login: 'reader', user: 'Lector', message: '¡Qué canción! twitch.tv/alpha' }

describe('session chat search', () => {
  it('matches literal text with case and accent normalization without interpreting regex syntax', () => {
    expect(createChatSearchMatcher({ text: ' QUE CANCION ' })(message)).toBe(true)
    expect(createChatSearchMatcher({ text: '.*' })(message)).toBe(false)
    expect(createChatSearchMatcher({ text: '[x]' })({ message: 'literal [x]' })).toBe(true)
    expect(createChatSearchMatcher({ text: 'こんにちは' })({ message: 'こんにちは！' })).toBe(true)
  })

  it('combines text, sender, link and origin filters without using the send destination', () => {
    const matches = createChatSearchMatcher({ text: 'cancion', user: '@READER', channel: '#alpha', linksOnly: true })
    expect(matches(message)).toBe(true)
    expect(matches({ ...message, channel: 'beta' })).toBe(false)
    expect(matches({ ...message, user_login: 'someone', user: 'other' })).toBe(false)
    expect(createChatSearchMatcher({ user: 'lector' })(message)).toBe(true)
  })

  it.each(['https://example.com/path', 'http://example.com', 'www.example.com', 'twitch.tv/channel', 'DISCORD.GG/invite'])('detects a renderable link consistently: %s', text => {
    const matches = createChatSearchMatcher({ linksOnly: true })
    expect(matches({ message: text })).toBe(true)
    // Rendering uses the same global pattern; its previous position must not affect filtering.
    CHAT_URL_REGEX.lastIndex = 100
    expect(matches({ message: text })).toBe(true)
    expect(matches({ message: 'plain text' })).toBe(false)
    expect(matches({ message: text })).toBe(true)
  })

  it('handles notices and missing optional fields and searches event headers', () => {
    expect(createChatSearchMatcher({})({})).toBe(true)
    expect(createChatSearchMatcher({ text: 'reward' })({ eventHeader: 'Reward redeemed' })).toBe(true)
    expect(createChatSearchMatcher({ user: 'reader' })({})).toBe(false)
    expect(createChatSearchMatcher({ linksOnly: true })({})).toBe(false)
  })
})
