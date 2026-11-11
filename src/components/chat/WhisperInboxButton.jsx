import { useSyncExternalStore } from 'react'
import { getWhisperUnread, subscribeWhisperUnread, openWhisperInbox } from '../../utils/whispers'
import { useT } from '../../utils/i18n'
import PhosphorIcon from '../icons/PhosphorIcon'

export default function WhisperInboxButton({ account }) {
  const t = useT()
  const unread = useSyncExternalStore(subscribeWhisperUnread, () => getWhisperUnread(account), () => 0)
  return <button type="button" onClick={openWhisperInbox} aria-label={`${t('whisper.inbox')}${unread ? ` (${unread} ${t('whisper.unread')})` : ''}`} title={t('whisper.inbox')} className="relative p-2 rounded-lg text-text-secondary hover:text-white hover:bg-hover cursor-pointer focus-visible:outline-2 focus-visible:outline-purple-400">
    <PhosphorIcon name="ChatsCircle" size={20} />
    {unread > 0 && <span aria-hidden="true" className="absolute -top-1 -right-1 rounded-full bg-twitch px-1 text-[9px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
  </button>
}
