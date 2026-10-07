(() => {
  const request = window.__blinkstreamDropClaimRequest
  if (!request || window.location.origin !== 'https://www.twitch.tv'
    || window.location.pathname !== '/drops/inventory') return

  const previous = window.__blinkstreamDropClaimJob
  if (previous?.id === request.id) return
  previous?.stop()
  const selector = [
    'button[data-test-selector="DropsCampaignInProgressRewardPresentation-claim-button"]',
    'button[data-test-selector="DropsCampaignInProgressRewardPresentation-claimButton"]',
    'button[data-test-selector="drops-claim-button"]',
    'button[data-a-target="drops-claim-button"]',
  ].join(',')
  const normalize = text => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase()
  const names = request.names.map(normalize).filter(Boolean)
  const images = (request.images || []).filter(url => typeof url === 'string' && url.startsWith('https://'))
  const claimLabels = new Set(['reclamar ahora', 'claim now'])
  let timer
  const job = { id: request.id, clicked: false, stopped: false,
    stop() { job.stopped = true; clearTimeout(timer) },
  }
  window.__blinkstreamDropClaimJob = job

  function check() {
    if (job.stopped || Date.now() >= request.deadline
      || window.location.origin !== 'https://www.twitch.tv'
      || window.location.pathname !== '/drops/inventory') { job.stop(); return }
    const candidates = [...document.querySelectorAll('button')].filter(button =>
      button.matches(selector) || (images.length > 0 && claimLabels.has(normalize(button.textContent))))
    const matches = candidates.filter(button => {
      if (button.disabled || button.getAttribute('aria-disabled') === 'true'
        || button.closest('[hidden],[aria-hidden="true"],[inert]')) return false
      for (let element = button; element && element !== document.body; element = element.parentElement) {
        const style = getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') return false
      }
      // A label alone is insufficient: the fallback also requires the cached reward image.
      const knownSelector = button.matches(selector)
      let container = button.parentElement
      for (let depth = 0; container && depth < 8; depth++, container = container.parentElement) {
        if (candidates.filter(candidate => container.contains(candidate)).length !== 1) break
        const cardImages = [...container.querySelectorAll('img')]
        if (cardImages.length > 1) break
        if (cardImages.length === 1 && (knownSelector || images.includes(cardImages[0].src))
          && [...container.querySelectorAll('p,span,h1,h2,h3,h4,h5')]
          .some(element => names.includes(normalize(element.textContent)))) return true
      }
      return false
    })
    // Ambiguous cards require the user's intervention, not a guessed click.
    if (matches.length === 1) {
      job.clicked = true
      job.stop()
      matches[0].click()
      return
    }
    timer = setTimeout(check, 500)
  }
  check()
})()
