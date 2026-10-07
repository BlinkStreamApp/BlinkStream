export function isEditingText(target) {
  return Boolean(target?.isContentEditable ||
    target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]'))
}

export function isDomElementVisible(element) {
  if (!element?.isConnected) return false
  for (let node = element; node; node = node.parentElement) {
    if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true') return false
    const style = node.ownerDocument.defaultView.getComputedStyle(node)
    if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility)) return false
  }
  return true
}

export function getPlayerShortcut(event) {
  if (event.defaultPrevented || event.repeat || isEditingText(event.target) || event.altKey) return null
  if (event.target?.closest?.('button, a[href], [role="button"], [role="dialog"], [data-modal="true"]')) return null
  if (typeof document !== 'undefined' &&
    [...document.querySelectorAll('[aria-modal="true"], [data-modal="true"]')].some(isDomElementVisible)) return null
  if (event.ctrlKey || event.metaKey) {
    if (event.code === 'KeyS' && event.shiftKey) return 'snapshot'
    if (event.code === 'KeyD' && !event.shiftKey) return 'stats'
    return null
  }
  if (event.shiftKey) return null
  return {
    Space: 'play', KeyK: 'play', KeyM: 'mute', KeyF: 'fullscreen',
    KeyT: 'theatre', KeyC: 'chat', KeyS: 'snapshot',
    KeyJ: 'rewind', KeyL: 'forward', Home: 'live', Digit0: 'live',
    ArrowUp: 'volumeUp', ArrowDown: 'volumeDown',
  }[event.code] || null
}
