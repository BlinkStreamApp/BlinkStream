import { useState } from 'react'
import { useT } from '../../utils/i18n'

export default function TwitchChatGif({ url, text }) {
  const t = useT()
  const [failed, setFailed] = useState(false)
  if (failed) return <span className="inline-block rounded-lg bg-white/5 p-2 text-xs align-middle">
    <span>{text}</span>
    <span role="status" className="block text-text-muted">{t('chat.gif.failed')}</span>
    <button type="button" onClick={() => setFailed(false)} className="mt-1 text-twitch-light hover:underline cursor-pointer">{t('retry', 'Reintentar')}</button>
  </span>
  return <img src={url} alt={text} title={text} loading="lazy" decoding="async" referrerPolicy="no-referrer"
    className="inline-block max-w-full max-h-40 w-auto rounded-lg align-middle my-1" style={{ maxWidth: 'min(100%, 240px)' }}
    onError={() => setFailed(true)} />
}
