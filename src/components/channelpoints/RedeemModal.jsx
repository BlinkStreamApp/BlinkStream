import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../utils/i18n'
import { sanitizeChannelForGraphQL } from '../../utils/twitch'
import { openOfficialRewardsChat } from '../../utils/twitchPopout'
import { isDomElementVisible } from '../../utils/keyboard'

export function OfficialRewardsAccess({ channel, history = false }) {
  const t = useT()
  const [opening, setOpening] = useState(false)
  const [failed, setFailed] = useState(false)
  const inFlight = useRef(false)
  const login = sanitizeChannelForGraphQL(channel)
  const open = async () => {
    if (!login || inFlight.current) return
    inFlight.current = true
    setOpening(true)
    setFailed(false)
    try { await openOfficialRewardsChat(login) }
    catch { setFailed(true) }
    finally { inFlight.current = false; setOpening(false) }
  }
  return <div className="space-y-3 text-[13px] text-text-secondary">
    <p>{t(history ? 'cp.official.history' : 'cp.official.explanation')}</p>
    <p>{t('cp.official.instructions')}</p>
    {failed && <p role="alert" className="text-red-400">{t('cp.official.openFailed')}</p>}
    <button type="button" disabled={!login || opening} onClick={open}
      className="w-full rounded-lg bg-twitch px-4 py-2 text-white hover:bg-twitch-dark disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
      {t(opening ? 'cp.official.opening' : 'cp.official.open')}
    </button>
    {login && <a href={`https://www.twitch.tv/${login}`} target="_blank" rel="noopener noreferrer"
      className="block text-center text-twitch-light hover:underline">{t('cp.official.browser')}</a>}
  </div>
}

export default function RedeemModal({ reward, channel, onClose }) {
  const t = useT()
  const dialogRef = useRef(null)
  useEffect(() => {
    const opener = document.activeElement
    dialogRef.current?.querySelector('button')?.focus()
    return () => { if (opener?.isConnected) opener.focus() }
  }, [])
  if (!reward) return null
  const onKeyDown = event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose() }
    if (event.key !== 'Tab') return
    const items = [...dialogRef.current.querySelectorAll('button, a[href]')]
      .filter(item => !item.disabled && isDomElementVisible(item))
    const first = items[0], last = items.at(-1)
    if (!first) return
    if (!items.includes(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault()
      const target = event.shiftKey ? last : first
      target.focus()
    }
  }
  return createPortal(
    <div className="fixed inset-0 z-[200000] bg-black/70 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="official-reward-title" onKeyDown={onKeyDown}
        className="bg-bg-secondary border border-bg-tertiary/60 rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4"
        onClick={event => event.stopPropagation()}>
        <h3 id="official-reward-title" className="text-[17px] font-semibold text-text-primary">{reward.title || t('cp.official.reward')}</h3>
        {reward.prompt && <p className="text-[13px] text-text-secondary">{reward.prompt}</p>}
        <OfficialRewardsAccess channel={channel} />
        <button type="button" onClick={onClose} className="w-full rounded-lg px-4 py-2 text-text-secondary hover:bg-hover cursor-pointer">{t('cp.official.close')}</button>
      </div>
    </div>, document.body,
  )
}
