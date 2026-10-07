import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import script from '../../src-tauri/src/drops_claim.js?raw'

const marker = 'DropsCampaignInProgressRewardPresentation-claim-button'
let page
function card(name, attributes = '') {
  const container = document.createElement('div')
  container.innerHTML = `<img alt=""><span>${name}</span><button data-test-selector="${marker}" ${attributes}>Reclamar</button>`
  document.body.append(container)
  const button = container.querySelector('button')
  vi.spyOn(button, 'click')
  return button
}
function run() { Function(script)() }

beforeEach(() => {
  vi.useFakeTimers()
  document.body.replaceChildren()
  page = { location: { origin: 'https://www.twitch.tv', pathname: '/drops/inventory' },
    __blinkstreamDropClaimRequest: { id: 'instance', names: ['Voucher'], deadline: Date.now() + 30000 } }
  vi.stubGlobal('window', page)
})
afterEach(() => { page.__blinkstreamDropClaimJob?.stop(); vi.unstubAllGlobals(); vi.useRealTimers(); document.body.replaceChildren() })

describe('official Drops page claim controller', () => {
  it('recognizes the localized official claim control using the exact reward name and cached image', () => {
    const button = card('Appearance Change x1')
    button.removeAttribute('data-test-selector')
    button.textContent = 'Reclamar ahora'
    button.parentElement.querySelector('img').src = 'https://static-cdn.jtvnw.net/reward.png'
    page.__blinkstreamDropClaimRequest.names = ['Appearance Change x1']
    page.__blinkstreamDropClaimRequest.images = ['https://static-cdn.jtvnw.net/reward.png']
    run(); run()
    expect(button.click).toHaveBeenCalledTimes(1)
  })
  it('never falls back to generic claim text without matching the cached reward image', () => {
    const button = card('Voucher')
    button.removeAttribute('data-test-selector')
    button.textContent = 'Claim now'
    button.parentElement.querySelector('img').src = 'https://static-cdn.jtvnw.net/other.png'
    page.__blinkstreamDropClaimRequest.images = ['https://static-cdn.jtvnw.net/reward.png']
    run()
    expect(button.click).not.toHaveBeenCalled()
  })
  it('does not click a hidden official claim control', () => {
    const button = card('Voucher')
    button.parentElement.setAttribute('aria-hidden', 'true')
    run()
    expect(button.click).not.toHaveBeenCalled()
  })
  it('fails closed if two localized reward cards match the same cached name and image', () => {
    const first = card('Voucher')
    const second = card('Voucher')
    for (const button of [first, second]) {
      button.removeAttribute('data-test-selector')
      button.textContent = 'Claim now'
      button.parentElement.querySelector('img').src = 'https://static-cdn.jtvnw.net/reward.png'
    }
    page.__blinkstreamDropClaimRequest.images = ['https://static-cdn.jtvnw.net/reward.png']
    run()
    expect(first.click).not.toHaveBeenCalled()
    expect(second.click).not.toHaveBeenCalled()
  })
  it('clicks only the matching official Drop button, once, even on repeated native evaluation', () => {
    const matching = card('Voucher')
    const other = card('Other drop')
    run(); run()
    vi.advanceTimersByTime(10000)
    expect(matching.click).toHaveBeenCalledTimes(1)
    expect(other.click).not.toHaveBeenCalled()
  })
  it('does nothing on login pages or unrelated origins', () => {
    const button = card('Voucher')
    page.location.pathname = '/login'
    run()
    page.location.pathname = '/drops/inventory'
    page.location.origin = 'https://example.com'
    run()
    expect(button.click).not.toHaveBeenCalled()
  })
  it('waits for page rendering without clicking disabled or generic commercial controls', () => {
    const disabled = card('Voucher', 'disabled')
    const generic = document.createElement('button')
    generic.textContent = 'Claim Prime reward'
    document.body.append(generic)
    vi.spyOn(generic, 'click')
    run()
    vi.advanceTimersByTime(1000)
    expect(disabled.click).not.toHaveBeenCalled()
    expect(generic.click).not.toHaveBeenCalled()
    disabled.disabled = false
    vi.advanceTimersByTime(500)
    expect(disabled.click).toHaveBeenCalledTimes(1)
  })
  it('fails closed on ambiguous cards and stops after its deadline', () => {
    const first = card('Voucher')
    const second = card('Voucher')
    run()
    vi.advanceTimersByTime(31000)
    expect(first.click).not.toHaveBeenCalled()
    expect(second.click).not.toHaveBeenCalled()
    second.parentElement.remove()
    vi.advanceTimersByTime(1000)
    expect(first.click).not.toHaveBeenCalled()
    expect(page.__blinkstreamDropClaimJob.stopped).toBe(true)
  })
  it('cancels a pending job when another request replaces it', () => {
    run()
    const previous = page.__blinkstreamDropClaimJob
    page.__blinkstreamDropClaimRequest = { id: 'new', names: ['Other'], deadline: Date.now() + 10000 }
    run()
    const oldButton = card('Voucher')
    const newButton = card('Other')
    vi.advanceTimersByTime(500)
    expect(previous.stopped).toBe(true)
    expect(oldButton.click).not.toHaveBeenCalled()
    expect(newButton.click).toHaveBeenCalledTimes(1)
  })
  it('does not match an old claimed reward name elsewhere in the campaign', () => {
    const claimed = document.createElement('div')
    claimed.innerHTML = '<img alt=""><span>Voucher</span>'
    document.body.append(claimed)
    const other = card('Next reward')
    run()
    vi.advanceTimersByTime(1000)
    expect(other.click).not.toHaveBeenCalled()
  })
})
