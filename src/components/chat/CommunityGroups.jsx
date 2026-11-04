import { useT } from '../../utils/i18n'
import { groupCommunityUsers } from '../../utils/communityUsers'

export default function CommunityGroups({ viewers, moderators, vips, broadcasterId, search = '', onInspectUser }) {
  const t = useT()
  const groups = groupCommunityUsers(viewers, moderators, vips, broadcasterId)
  const query = search.trim().toLowerCase()
  return <section className="space-y-3 p-2" aria-label={t('community.title')}>
    <p className="text-xs text-text-secondary">{t('community.scope')}</p>
    {Object.entries(groups).map(([role, users]) => {
      const visible = users.filter(user => `${user.user_login} ${user.user_name || ''}`.toLowerCase().includes(query))
      return <details key={role} open className="rounded-xl border border-white/10 p-2">
        <summary className="text-xs font-bold cursor-pointer">{t(`community.${role}`)} ({visible.length})</summary>
        <div className="space-y-1 mt-2">{visible.map(user => <button type="button" key={user.user_login} onClick={() => onInspectUser?.({ ...user, username: user.user_login, displayName: user.user_name || user.user_login, userId: user.userId || user.user_id || user.id })} className="block w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm text-text-primary cursor-pointer">{user.user_name || user.user_login}</button>)}</div>
      </details>
    })}
  </section>
}
