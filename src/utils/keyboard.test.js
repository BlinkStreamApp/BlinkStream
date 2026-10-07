import { describe, it, expect } from 'vitest'
import { getPlayerShortcut } from './keyboard'
describe('player keyboard isolation', () => {
  it.each(['KeyM', 'KeyK', 'KeyP', 'KeyF', 'KeyJ', 'KeyL', 'ArrowUp', 'Space'])(
    'does not capture modified application/browser shortcut %s', code => {
      for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
        expect(getPlayerShortcut({ code, [modifier]: true })).toBeNull()
      }
    },
  )
  it('keeps screenshot and stats combinations distinct', () => {
    expect(getPlayerShortcut({ code: 'KeyS', ctrlKey: true, shiftKey: true })).toBe('snapshot')
    expect(getPlayerShortcut({ code: 'KeyD', metaKey: true })).toBe('stats')
    expect(getPlayerShortcut({ code: 'KeyS', ctrlKey: true })).toBeNull()
  })
  it.each(['input', 'textarea', 'select', 'contenteditable', 'textbox'])('does not act while typing in %s', type => {
    const element = document.createElement(['contenteditable', 'textbox'].includes(type) ? 'div' : type)
    if (type === 'contenteditable') element.setAttribute('contenteditable', 'true')
    if (type === 'textbox') element.setAttribute('role', 'textbox')
    expect(getPlayerShortcut({ code: 'Space', target: element })).toBeNull()
  })
  it('ignores repeated or consumed events', () => {
    expect(getPlayerShortcut({ code: 'KeyM', repeat: true })).toBeNull()
    expect(getPlayerShortcut({ code: 'KeyM', defaultPrevented: true })).toBeNull()
  })
  it('keeps K for playback and J/L for seeking', () => {
    expect(getPlayerShortcut({ code: 'KeyK' })).toBe('play')
    expect(getPlayerShortcut({ code: 'KeyJ' })).toBe('rewind')
    expect(getPlayerShortcut({ code: 'KeyL' })).toBe('forward')
  })
  it('leaves keyboard activation to buttons and links', () => {
    const button = document.createElement('button')
    const icon = button.appendChild(document.createElement('span'))
    const link = document.createElement('a')
    link.href = '#inventory'
    expect(getPlayerShortcut({ code: 'Space', target: icon })).toBeNull()
    expect(getPlayerShortcut({ code: 'KeyK', target: link })).toBeNull()
  })
  it('blocks background player shortcuts while a modal is visible, then resumes', () => {
    const modal = document.createElement('div')
    modal.setAttribute('aria-modal', 'true')
    document.body.appendChild(modal)
    try {
      expect(getPlayerShortcut({ code: 'KeyK', target: document.body })).toBeNull()
      expect(getPlayerShortcut({ code: 'KeyS', ctrlKey: true, shiftKey: true })).toBeNull()
      modal.hidden = true
      expect(getPlayerShortcut({ code: 'KeyK', target: document.body })).toBe('play')
      modal.hidden = false
      modal.style.display = 'none'
      expect(getPlayerShortcut({ code: 'KeyK', target: document.body })).toBe('play')
    } finally { modal.remove() }
  })
})
