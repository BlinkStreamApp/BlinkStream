import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTwitchDrops } from '../../hooks/useTwitchDrops'
import { useT } from '../../utils/i18n'
import { NativePointsSummary } from './NativePointsSummary'
import { recordConfirmedViewerRedemption } from '../../utils/channelActivity'

export default function ViewerRewardsPanel({ account, userId, channel, onOpenOfficial }) {
  const connection = useTwitchDrops(account)
  return <ViewerRewardsContent key={JSON.stringify([account, userId, channel, connection.session])} {...{ account, userId, channel, onOpenOfficial, connection }} />
}

function ViewerRewardsContent({ account, userId, channel, onOpenOfficial, connection }) {
  const t = useT()
  const [revision, setRevision] = useState(0)
  const [snapshot, setSnapshot] = useState(null)
  const [authorized, setAuthorized] = useState(false)
  const [selected, setSelected] = useState(null)
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [blocked, setBlocked] = useState(() => new Set())
  const sending = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const confirmation = useRef(null)
  const selectedId = selected?.requestId
  useEffect(() => {
    if (!selectedId) return
    confirmation.current?.scrollIntoView?.({ block: 'nearest' })
    confirmation.current?.querySelector('textarea,button')?.focus()
  }, [selectedId])
  const ready = Boolean(connection.session && connection.accountId && String(connection.accountId) === String(userId))
  const scope = JSON.stringify([connection.session, userId, channel, revision])
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    invoke('read_connected_channel_rewards', { session: connection.session, channel })
      .then(data => {
        if (cancelled) return
        if (data?.accountId !== String(userId) || data?.channel !== channel.toLowerCase() || !Array.isArray(data.items)) throw new Error('account')
        setSnapshot({ scope, data })
      }).catch(error => { if (!cancelled) setSnapshot({ scope, error: String(error?.message || error) }) })
    return () => { cancelled = true }
  }, [connection.session, ready, userId, channel, scope])
  const current = snapshot?.scope === scope ? snapshot : null
  const choose = item => { setSelected({ ...item, channelId: current.data.channelId, requestId: crypto.randomUUID().replaceAll('-', '') }); setText(''); setNotice('') }
  const redeem = async event => {
    event.preventDefault()
    if (sending.current || !selected || !authorized || !ready) return
    sending.current = true; setPending(true); setNotice('')
    const item = selected
    try {
      const result = await invoke('redeem_connected_channel_reward', { intent: {
        session: connection.session, channel, rewardId: item.id, expectedCost: item.cost,
        expectedTitle: item.title, text, requestId: item.requestId, confirmed: true,
      } })
      if (result?.status !== 'accepted' || result.requestId !== item.requestId) throw new Error('unconfirmed')
      if (!active.current) return
      recordConfirmedViewerRedemption({ accountId: String(userId), account, channel, channelId: item.channelId }, item, item.requestId, text)
      setSelected(null); setNotice('accepted'); setRevision(n => n + 1)
    } catch (error) {
      const reason = String(error?.message || error)
      const known = ['busy', 'input', 'changed', 'rejected', 'unavailable', 'authorization', 'account', 'storage', 'integrity', 'insufficient-points', 'limit', 'cooldown']
      const code = known.includes(reason) ? reason : 'unconfirmed'
      setNotice(code)
      if (code === 'unconfirmed' || code === 'storage') setBlocked(old => new Set([...old, item.id]))
    } finally { sending.current = false; setPending(false) }
  }
  return <section className="viewer-rewards-panel" aria-label={t('points.viewer.title')}>
    <NativePointsSummary account={account} channel={channel} onOpenOfficial={onOpenOfficial} refreshKey={revision} showObserved={false} />
    <header><strong>{t('points.viewer.catalog')}</strong><button type="button" onClick={() => setRevision(n => n + 1)} disabled={!ready || pending}>{t('mod.native.refresh')}</button></header>
    <label className="points-redeem-consent"><input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} disabled={pending} />{t('points.viewer.consent')}</label>
    {notice && <p role="status" className="native-mod-notice">{t(`points.viewer.${notice}`)}</p>}
    {!ready ? <p className="native-mod-notice">{t('points.viewer.connect')}</p>
      : !current ? <p role="status" className="native-mod-notice">{t('mod.native.loading')}</p>
        : current.error ? <p role="alert" className="native-mod-notice">{t('points.viewer.readError')}</p>
          : <div className="viewer-reward-cards">{current.data.items.length === 0 && <p>{t('points.viewer.empty')}</p>}{current.data.items.map(item => <article key={item.id}>
            {item.image && /^https:\/\//i.test(item.image) && <img src={item.image} alt="" loading="lazy" />}
            <div><strong>{item.title}</strong><span>{Number.isSafeInteger(item.cost) ? item.cost.toLocaleString() : '—'} pts</span>{item.prompt && <p>{item.prompt}</p>}</div>
            <button type="button" disabled={!authorized || pending || blocked.has(item.id) || !Number.isSafeInteger(item.cost) || item.cost <= 0 || item.enabled !== true || item.paused !== false || item.inStock !== true || typeof item.inputRequired !== 'boolean'} onClick={() => choose(item)}>{t('points.viewer.redeem')}</button>
          </article>)}</div>}
    {selected && <form ref={confirmation} className="viewer-reward-confirm" onSubmit={redeem} aria-label={t('points.viewer.confirm')}>
      <strong>{selected.title} · {selected.cost.toLocaleString()} pts</strong><p>{t('points.viewer.review')}</p>
      {selected.inputRequired && <label>{selected.prompt || t('points.viewer.answer')}<textarea maxLength={500} value={text} onChange={e => setText(e.target.value)} required /></label>}
      <div><button type="button" disabled={pending} onClick={() => setSelected(null)}>{t('points.viewer.cancel')}</button><button disabled={pending || !authorized || blocked.has(selected.id) || selected.inputRequired && !text.trim()}>{t(pending ? 'points.viewer.sending' : 'points.viewer.confirm')}</button></div>
    </form>}
  </section>
}
