import { describe, expect, it } from 'vitest'
import { normalizeChatChannels, parseIrcEnvelope, chatChannelAccent } from './chatChannels'

describe('chat channel scoping', () => {
  it('normalizes, deduplicates and bounds subscriptions without accepting IRC injection', () => {
    expect(normalizeChatChannels(['#Alpha', 'alpha', ' BETA ', '', 'bad\r\nJOIN #other', 'gamma', 'delta', 'fifth'])).toEqual(['alpha', 'beta', 'gamma', 'delta'])
  })
  it('parses tagged and untagged messages with the actual room, not the send destination', () => {
    expect(parseIrcEnvelope('@id=1;badges=vip/1 :viewer!v@v PRIVMSG #beta :hello')).toMatchObject({ tags: 'id=1;badges=vip/1', command: 'PRIVMSG', channel: 'beta' })
    expect(parseIrcEnvelope(':tmi.twitch.tv CLEARCHAT #alpha')).toMatchObject({ tags: '', command: 'CLEARCHAT', channel: 'alpha' })
    expect(parseIrcEnvelope('@badges= :tmi.twitch.tv GLOBALUSERSTATE')).toMatchObject({ channel: '', command: 'GLOBALUSERSTATE' })
    expect(parseIrcEnvelope('@broken')).toBeNull()
  })
  it('keeps the same readable channel accent regardless of grid order', () => {
    expect(chatChannelAccent('alpha')).toBe(chatChannelAccent('alpha'))
    expect(chatChannelAccent('alpha')).toContain('text-')
    const names = ['alpha', 'beta', 'gamma', 'delta']
    expect(new Set(names.map(name => chatChannelAccent(name, names))).size).toBe(4)
    expect(chatChannelAccent('alpha', names)).toBe(chatChannelAccent('alpha', [...names].reverse()))
  })
})
