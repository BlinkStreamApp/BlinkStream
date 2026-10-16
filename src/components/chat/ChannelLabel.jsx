import { chatChannelAccent } from '../../utils/chatChannels'
import { useT } from '../../utils/i18n'

export default function ChannelLabel({ channel, channels }) {
  const t = useT()
  return <span className={`mr-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 align-middle text-[11px] font-semibold leading-snug ${chatChannelAccent(channel, channels)}`} title={`${t('chat.ui.channel', 'Canal')}: ${channel}`}>
    <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-current" />
    <span className="truncate">{channel}</span>
  </span>
}
