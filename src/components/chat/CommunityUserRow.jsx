import { useT } from '../../utils/i18n'
import { adjustColorContrast } from '../../utils/format'
import PhosphorIcon from '../icons/PhosphorIcon'
import { openNativeWhisper } from '../../utils/whispers'

export default function CommunityUserRow({ user, onInspectUser }) {
  const t = useT()
  const login = user.user_login || user.name || user.user_name || ''
  const displayName = user.user_name || login
  const role = user.isBroadcaster ? 'broadcaster' : user.isMod ? 'moderators' : user.isVip ? 'vips' : 'viewers'
  const icons = { broadcaster: 'Broadcast', moderators: 'ShieldCheck', vips: 'Sparkle', viewers: 'User' }
  const colors = { broadcaster: 'text-red-400', moderators: 'text-emerald-400', vips: 'text-pink-400', viewers: 'text-text-muted/60' }
  const color = /^#[\da-f]{6}$/i.test(user.color || '') ? adjustColorContrast(user.color) : undefined
  return <div className="flex min-w-0 items-center gap-1 group"><button type="button" aria-label={`${displayName} @${login}`} title={`${t('community.inspect')} · @${login}`}
    onClick={() => onInspectUser?.({ ...user, username: login, displayName, userId: user.userId || user.user_id || user.id })}
    className="flex min-h-8 w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-purple-400 cursor-pointer">
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${colors[role]}`} title={t(`community.${role}`)}><PhosphorIcon name={icons[role]} size={16} /></span>
    <span className="truncate font-medium" style={color ? { color } : undefined}>{displayName}</span>
  </button><button type="button" onClick={() => openNativeWhisper({ ...user, username: login, displayName })} aria-label={`${t('whisper.open')} @${login}`} title={t('whisper.open')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-purple-400 cursor-pointer"><PhosphorIcon name="ChatCircleDots" size={16} /></button></div>
}
