export function groupCommunityUsers(viewers = [], moderators = [], vips = [], broadcasterId = '') {
  const users = new Map()
  for (const [list, flag] of [[viewers, ''], [moderators, 'isMod'], [vips, 'isVip']]) {
    for (const user of list) {
      const login = String(user.user_login || user.name || user.user_name || '').toLowerCase()
      if (!login) continue
      const previous = users.get(login)
      users.set(login, { ...user, ...previous,
        user_login: login,
        isBroadcaster: Boolean(previous?.isBroadcaster || user.isBroadcaster || (broadcasterId && (user.userId || user.user_id || user.id) === broadcasterId)),
        isMod: Boolean(previous?.isMod || user.isMod || flag === 'isMod'),
        isVip: Boolean(previous?.isVip || user.isVip || flag === 'isVip'),
      })
    }
  }
  const groups = { broadcaster: [], moderators: [], vips: [], viewers: [] }
  for (const user of users.values()) groups[user.isBroadcaster ? 'broadcaster' : user.isMod ? 'moderators' : user.isVip ? 'vips' : 'viewers'].push(user)
  for (const list of Object.values(groups)) list.sort((a, b) => a.user_login.localeCompare(b.user_login))
  return groups
}
