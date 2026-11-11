import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { getUserById, getUserByLogin } from '../../utils/twitch'
import { startRewardEventSub } from '../../utils/twitchEventSub'
import { clearWhisperUnread, getWhisperThreads, normalizeIncomingWhisper, openNativeWhisper, openWhisperInbox, publishWhisperUnread } from '../../utils/whispers'
import { useT } from '../../utils/i18n'
import PhosphorIcon from '../icons/PhosphorIcon'

export default function NativeWhispers({ account }) {
  const t = useT()
  const [peer, setPeer] = useState(null)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [events, setEvents] = useState([])
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState('connecting')
  const [authorizationRevision, setAuthorizationRevision] = useState(0)
  const [webSession, setWebSession] = useState(false)
  const [navigationRevision, setNavigationRevision] = useState(0)
  const draftRevision = useRef(0)
  const navigationControl = useRef(null)
  const sending = useRef(false)
  const peerVersion = useRef(0)
  const currentPeer = useRef(null)
  const lifecycle = useRef(null)
  const closeButton = useRef(null)
  const isOpen = Boolean(peer) || inboxOpen
  const threads = useMemo(() => getWhisperThreads(events, account), [events, account])
  const unreadCount = events.reduce((count, event) => count + Number(Boolean(event.unread)), 0)
  useEffect(() => { publishWhisperUnread(account, unreadCount) }, [account, unreadCount])
  useEffect(() => () => clearWhisperUnread(account), [account])

  useEffect(() => {
    let active = true
    const owner = {}
    lifecycle.current = owner
    const read = userId => {
      if (document.hidden || !document.hasFocus()) return
      setEvents(old => old.some(e => e.from === userId && e.unread)
        ? old.map(e => e.from === userId ? { ...e, unread: false } : e) : old)
    }
    const open = async event => {
      if (!/^[0-9]{1,32}$/.test(account)) return
      if (event.detail?.inbox === true) {
        peerVersion.current++; currentPeer.current = null; setPeer(null); setInboxOpen(true); setNotice('')
        setNavigationRevision(n => n + 1)
        return
      }
      const login = event.detail?.username
      if (!/^[a-z0-9_]{1,25}$/.test(login || '')) return
      const userId = event.detail?.userId || ''
      if (userId && (!/^[0-9]{1,32}$/.test(userId) || userId === account)) return
      const version = ++peerVersion.current
      const selected = { ...event.detail, userId }
      currentPeer.current = userId ? selected : null
      setPeer(selected); setInboxOpen(false); setDraft(''); setNotice('')
      draftRevision.current++
      setNavigationRevision(n => n + 1)
      if (userId) read(userId)
      try {
        const result = await (userId ? getUserById(userId) : getUserByLogin(login))
        if (!active || version !== peerVersion.current) return
        if (result?.success && /^[0-9]{1,32}$/.test(result.value?.id || '') && result.value.id !== account && (!userId || result.value.id === userId)) {
          const resolvedLogin = /^[a-z0-9_]{1,25}$/.test(result.value.login || '') ? result.value.login : login
          const selected = { username: resolvedLogin, userId: userId || result.value.id, displayName: result.value.display_name || resolvedLogin, avatar: result.value.profile_image_url }
          currentPeer.current = selected; setPeer(selected); read(selected.userId)
        } else setNotice('recipient')
      } catch { if (active && version === peerVersion.current) setNotice('recipient') }
    }
    const focus = () => { if (!document.hidden && document.hasFocus() && currentPeer.current) read(currentPeer.current.userId) }
    const authorized = () => { setStatus('connecting'); setAuthorizationRevision(n => n + 1) }
    window.addEventListener('bs:whisper:open', open)
    window.addEventListener('blinkstream_auth_updated', authorized)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', focus)
    return () => {
      active = false; lifecycle.current = null
      window.removeEventListener('bs:whisper:open', open)
      window.removeEventListener('blinkstream_auth_updated', authorized)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', focus)
    }
  }, [account])

  useEffect(() => {
    if (!/^[0-9]{1,32}$/.test(account)) return
    let active = true
    const stop = startRewardEventSub({ broadcasterId: account,
      onStatus: state => { if (active) setStatus(old => state.state === 'unavailable' && old === 'permission' ? old : state.state) },
      moderation: {
        userId: account, topics: [{ type: 'user.whisper.message', version: '1', condition: { user_id: String(account) } }],
        onTopics: topics => { if (active && topics.some(topic => topic.type === 'user.whisper.message' && [401, 403].includes(topic.status))) setStatus('permission') },
        onEvent: frame => {
          if (!active) return
          const message = normalizeIncomingWhisper(frame, account)
          if (!message) return
          const unread = currentPeer.current?.userId !== message.from || document.hidden || !document.hasFocus()
          setEvents(old => old.some(e => e.id === message.id) ? old : [...old, { ...message, unread }].slice(-200))
        },
      },
    })
    return () => { active = false; stop() }
  }, [account, authorizationRevision])

  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement
    window.dispatchEvent(new CustomEvent('bs:modal-state-change', { detail: { open: true } }))
    return () => {
      window.dispatchEvent(new CustomEvent('bs:modal-state-change', { detail: { open: false } }))
      if (previous?.isConnected) previous.focus()
    }
  }, [isOpen])
  useEffect(() => {
    if (isOpen) (navigationControl.current || closeButton.current)?.focus()
  }, [isOpen, navigationRevision])
  const close = () => { peerVersion.current++; currentPeer.current = null; setPeer(null); setInboxOpen(false) }
  const send = async event => {
    event.preventDefault()
    if (sending.current || !peer?.userId || !draft.trim()) return
    sending.current = true; setPending(true); setNotice('')
    const recipient = peer, text = draft, version = peerVersion.current, revision = draftRevision.current, owner = lifecycle.current
    try {
      const result = await invoke('send_native_whisper', { account: String(account), target: String(recipient.userId), message: text, webSession })
      if (result?.status !== 'accepted') throw new Error('unconfirmed')
      if (owner !== lifecycle.current) return
      setEvents(old => [...old, { id: crypto.randomUUID(), from: String(account), to: String(recipient.userId), username: recipient.username, displayName: recipient.displayName, text, status: 'accepted' }].slice(-200))
      if (version === peerVersion.current) {
        if (revision === draftRevision.current) setDraft('')
        setNotice('accepted')
      }
    } catch (error) { if (owner === lifecycle.current && version === peerVersion.current) { const reason = String(error?.message || error); setNotice(reason === 'permission' && webSession ? 'webPermission' : reason) } }
    finally { sending.current = false; if (owner === lifecycle.current) setPending(false) }
  }
  if (!isOpen) return null
  const messages = events.filter(e => e.from === String(peer?.userId) || e.to === String(peer?.userId))
  const noticeKey = ['permission', 'webPermission', 'account', 'accepted', 'recipient-policy', 'rate-limit', 'web-session', 'recipient'].includes(notice) ? notice : 'unconfirmed'
  const statusKey = status === 'connected' ? 'listening' : status === 'permission' ? 'receiveUnavailable' : status === 'connecting' || status === 'reconnecting' ? status : 'receiveError'
  return createPortal(<section className="native-whispers" role="dialog" aria-label={peer ? t('whisper.title') + ' · ' + peer.displayName : t('whisper.inbox')} onKeyDown={e => { if (e.key === 'Escape') close() }}>
    <header>{peer ? <><button ref={navigationControl} type="button" aria-label={t('whisper.inbox')} onClick={openWhisperInbox}><PhosphorIcon name="ArrowLeft" size={16} /></button>{peer.avatar && <img src={peer.avatar} alt="" />}<div><strong>{peer.displayName}</strong><small>@{peer.username}</small></div></> : <div><strong>{t('whisper.inbox')}</strong><small>{t('whisper.sessionOnly')}</small></div>}<button ref={closeButton} type="button" onClick={close} aria-label={t('whisper.close')}><PhosphorIcon name="X" size={18} /></button></header>
    <p className="native-whisper-status" role="status">{t('whisper.' + statusKey)}</p>
    {inboxOpen ? <>
      <form className="native-whisper-recipient" onSubmit={e => { e.preventDefault(); openNativeWhisper({ username: recipient }) }}><label htmlFor="whisper-recipient">{t('whisper.recipientLogin')}</label><div><input ref={navigationControl} id="whisper-recipient" value={recipient} maxLength={26} onChange={e => setRecipient(e.target.value)} autoComplete="off" /><button disabled={!/^@?[a-z0-9_]{1,25}$/i.test(recipient)}>{t('whisper.open')}</button></div></form>
      <div className="native-whisper-threads">{threads.length ? threads.map(thread => <button type="button" key={thread.userId} onClick={() => openNativeWhisper(thread)}><span className="native-whisper-initial" aria-hidden="true">{thread.displayName?.[0]?.toUpperCase()}</span><span><strong>{thread.displayName}</strong><small>{thread.text}</small></span>{thread.unread > 0 && <b aria-label={`${thread.unread} ${t('whisper.unread')}`}>{thread.unread}</b>}</button>) : <p>{t('whisper.inboxEmpty')}</p>}</div>
    </> : <>
      <div className="native-whisper-messages">{messages.length ? messages.map(m => <article key={m.id} className={m.from === String(account) ? 'own' : ''}><p>{m.text}</p><small>{t(m.status === 'accepted' ? 'whisper.acceptedShort' : 'whisper.received')}</small></article>) : <p>{t('whisper.empty')}</p>}</div>
      <form onSubmit={send}><label><input type="checkbox" checked={webSession} onChange={e => setWebSession(e.target.checked)} disabled={pending} />{t('whisper.webSession')}</label>
        {notice && <p role="status">{t('whisper.' + noticeKey)}</p>}
        <textarea aria-label={t('whisper.message')} maxLength={500} value={draft} onChange={e => { draftRevision.current++; setDraft(e.target.value) }} placeholder={t('whisper.message')} />
        <button disabled={pending || !peer.userId || !draft.trim()}>{t(pending ? 'whisper.sending' : 'whisper.send')}</button>
      </form>
    </>}
  </section>, document.body)
}
