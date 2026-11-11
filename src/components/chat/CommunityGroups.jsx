import { useT } from '../../utils/i18n'
import { groupCommunityUsers } from '../../utils/communityUsers'
import CommunityUserRow from './CommunityUserRow'

export default function CommunityGroups({ viewers, moderators, vips, broadcasterId, search = '', onInspectUser }) {
  const t = useT()
  const groups = groupCommunityUsers(viewers, moderators, vips, broadcasterId)
  const query = search.trim().toLowerCase()
  return <div role="group" className="space-y-3 p-2" aria-label={t('community.title')}>
    <p className="text-xs text-text-secondary">{t('community.scope')}</p>
    {Object.entries(groups).map(([role, users]) => {
      const visible = users.filter(user => `${user.user_login} ${user.user_name || ''}`.toLowerCase().includes(query))
      return <details key={role} open={visible.length > 0} className="border-b border-white/5 pb-2">
        <summary className="px-2 py-2 text-xs font-semibold text-text-secondary cursor-pointer">{t(`community.${role}`)} <span className="ml-1 text-text-muted tabular-nums">{visible.length}</span></summary>
        <div className="mt-1">{visible.map(user => <CommunityUserRow key={user.user_login} user={user} onInspectUser={onInspectUser} />)}</div>
      </details>
    })}
  </div>
}
