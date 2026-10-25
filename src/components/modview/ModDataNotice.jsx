import { useT } from '../../utils/i18n'

export function ModDataNotice({ error }) {
  const t = useT()
  if (!error) return null
  const status = error.context?.status ?? error.status
  const ownerOnly = error.context?.reason === 'broadcaster_only' || (status === 401 && /broadcaster_id.*must match.*(?:user id|token)/i.test(error.context?.twitchMsg || ''))
  const key = ownerOnly ? 'mod.data.broadcasterOnly' : status === 401 ? 'mod.data.authorization' : status === 403 ? 'mod.data.forbidden' : 'mod.data.failed'
  return <p role="alert" className="px-3 py-2 text-xs text-amber-300">{t(key)}{status ? ` (HTTP ${status})` : ''}</p>
}
