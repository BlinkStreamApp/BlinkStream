import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { moderationOperation } from '../../utils/moderationApi'
import { MOD_SCOPES } from '../../utils/moderationSession'
import { useT } from '../../utils/i18n'

export function ToolFallback({ onOpenOfficial, children }) {
  const t = useT()
  return <div className="native-mod-notice"><span>{children}</span><button type="button" onClick={onOpenOfficial}>{t('mod.native.openOfficial')}</button></div>
}

export function NativeHistory({ account, channelId, targetId, enabled, onOpenOfficial }) {
  const t = useT()
  const [result, setResult] = useState(null)
  const [revision, setRevision] = useState(0)
  const key = `${account}:${channelId}:${targetId}:${revision}`
  useEffect(() => {
    if (!enabled || !targetId || !account || !channelId) return
    let cancelled = false
    invoke('read_moderation_tool', { account, channelId, targetId: String(targetId), operation: 'history' })
      .then(data => { if (!cancelled) setResult({ key, data }) })
      .catch(() => { if (!cancelled) setResult({ key, error: true }) })
    return () => { cancelled = true }
  }, [enabled, account, channelId, targetId, key])
  if (!targetId) return null
  const data = result?.key === key ? result.data : null
  return <section className="native-history">
    <header><strong>{t('mod.native.history')}</strong><button type="button" onClick={() => setRevision(r => r + 1)}>{t('mod.native.refresh')}</button></header>
    {!enabled ? <ToolFallback onOpenOfficial={onOpenOfficial}>{t('mod.native.connectHint')}</ToolFallback>
      : result?.key === key && result.error ? <ToolFallback onOpenOfficial={onOpenOfficial}>{t('mod.native.unavailable')}</ToolFallback>
        : !data ? <p role="status">{t('mod.native.loading')}</p> : ['actions', 'messages', 'comments'].map(kind => <details key={kind} open={kind === 'actions'}>
          <summary>{t(`mod.native.${kind}`)} ({data[kind]?.available ? data[kind].items.length : '—'})</summary>
          {!data[kind]?.available ? <ToolFallback onOpenOfficial={onOpenOfficial}>{t('mod.native.unavailable')}</ToolFallback> : data[kind].items.map(item => <article key={item.id}>
            <small>{item.author} {item.timestamp} {item.deleted ? t('mod.native.deleted') : ''}</small><p>{item.label || item.text}</p>
          </article>)}
        </details>)}
  </section>
}

export function NativeExtraTools({ type, channelId, userId, token, scopes = [], suspicious = [], messages = [], onInspectUser, onOpenOfficial }) {
  const t = useT()
  const [text, setText] = useState('')
  const [level, setLevel] = useState('1')
  const [items, setItems] = useState([])
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [loaded, setLoaded] = useState(false)
  const run = async (kind, args = {}) => {
    if (pending) return
    setPending(true); setNotice('')
    try {
      const result = await moderationOperation(kind, { channel: channelId, moderator: userId, text, value: level, ...args }, token)
      if (!result.success) { setNotice(result.error?.message || t('mod.native.unavailable')); return }
      if (kind === 'terms' || kind === 'pinned') { setItems(result.value?.data || []); setLoaded(true) }
      else if (kind === 'automodSettings') { setLevel(String(result.value?.data?.[0]?.overall_level ?? 1)); setLoaded(true) }
      else { setNotice(t('mod.native.confirmed')); if (kind === 'addTerm' || kind === 'removeTerm') { setItems([]); setLoaded(false) } }
    } catch { setNotice(t('mod.native.unconfirmed')) } finally { setPending(false) }
  }
  if (type === 'suspicious') return <div className="native-tool-content">
    <ToolFallback onOpenOfficial={onOpenOfficial}>{t('mod.native.sessionEvents')}</ToolFallback>
    {suspicious.map(user => <article key={user.user_id}>
      <button onClick={() => onInspectUser({ userId: user.user_id, username: user.user_name || user.user_login })}>{user.user_name || user.user_login}</button>
      <p>{user.low_trust_status} · {user.message}</p>
      {scopes.includes(MOD_SCOPES.suspicious) && <div className="native-tool-actions">{['ACTIVE_MONITORING', 'RESTRICTED'].map(status => <button disabled={pending} key={status} onClick={() => run('suspicious', { target: user.user_id, value: status })}>{status === 'RESTRICTED' ? t('mod.native.restrict') : t('mod.native.monitor')}</button>)}<button disabled={pending} onClick={() => run('removeSuspicious', { target: user.user_id })}>{t('mod.native.remove')}</button></div>}
    </article>)}{notice && <p role="status">{notice}</p>}
  </div>
  if (type === 'chatTools') return <div className="native-tool-content">
    <form onSubmit={e => { e.preventDefault(); run('announcement') }}><label>{t('mod.native.announcement')}<input maxLength={500} value={text} onChange={e => setText(e.target.value)} /></label><button disabled={pending || !text.trim() || !scopes.includes(MOD_SCOPES.announcements)}>{t('mod.native.send')}</button></form>
    <h3>{t('mod.native.pinned')}</h3><button disabled={pending} onClick={() => run('pinned')}>{t('mod.native.refresh')}</button>
    {items.map(item => <article key={item.message_id}><p>{item.message?.text}</p><button disabled={pending || !scopes.includes(MOD_SCOPES.messages)} onClick={() => run('unpin', { id: item.message_id })}>{t('mod.native.unpin')}</button></article>)}
    <label>{t('mod.native.recentMessage')}<select value={level} onChange={e => setLevel(e.target.value)}><option value="">—</option>{messages.slice(-40).filter(m => /^[a-zA-Z0-9_-]{1,100}$/.test(m.id || '')).map(m => <option key={m.id} value={m.id}>{m.user}: {(m.text || m.message || '').slice(0,70)}</option>)}</select></label>
    <button disabled={pending || !scopes.includes(MOD_SCOPES.messages) || !messages.some(m => m.id === level)} onClick={() => run('pin', { id: level })}>{t('mod.native.pin')}</button>
    {notice && <p role="status">{notice}</p>}
  </div>
  const permitted = type === 'terms' ? scopes.includes(MOD_SCOPES.terms) : scopes.includes('moderator:manage:automod_settings')
  return <div className="native-tool-content">
    {!permitted && <ToolFallback onOpenOfficial={onOpenOfficial}>{t('mod.native.permissions')}</ToolFallback>}
    {type === 'terms' ? <>
      <button disabled={pending || !permitted} onClick={() => run('terms')}>{t('mod.native.refresh')}</button>
      <form onSubmit={e => { e.preventDefault(); run('addTerm') }}><label>{t('mod.native.terms')}<input maxLength={500} value={text} onChange={e => setText(e.target.value)} /></label><button disabled={!permitted || pending || !text.trim()}>{t('mod.native.add')}</button></form>
      {loaded && !items.length && <p>{t('mod.native.empty')}</p>}
      {items.map(item => <article key={item.id}><span>{item.text}</span><button disabled={pending || !permitted} onClick={() => run('removeTerm', { id: item.id })}>{t('mod.native.remove')}</button></article>)}
    </> : <><button disabled={pending} onClick={() => run('automodSettings')}>{t('mod.native.refresh')}</button><form onSubmit={e => { e.preventDefault(); run('updateAutomod') }}><label>AutoMod<select value={level} onChange={e => setLevel(e.target.value)}>{[0, 1, 2, 3, 4].map(n => <option key={n}>{n}</option>)}</select></label><button disabled={!permitted || pending || !loaded}>{t('mod.native.apply')}</button></form></>}
    {notice && <p role="status">{notice}</p>}
  </div>
}

export function NativeUserActions({ channelId, userId, targetId, token, scopes }) {
  const t = useT()
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const warn = async e => {
    e.preventDefault()
    if (pending) return
    setPending(true)
    try {
      const result = await moderationOperation('warn', { channel: channelId, moderator: userId, target: targetId, text: reason }, token)
      setNotice(result.success ? t('mod.native.confirmed') : result.error?.message || t('mod.native.unavailable'))
    } catch { setNotice(t('mod.native.unconfirmed')) } finally { setPending(false) }
  }
  return <form className="native-tool-content" onSubmit={warn}><label>{t('mod.native.warning')}<input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label><button disabled={pending || !reason.trim() || !targetId || !scopes.includes(MOD_SCOPES.warn)}>{t('mod.native.sendWarning')}</button>{notice && <p role="status">{notice}</p>}</form>
}
