import { expect, it } from 'vitest'
import { groupCommunityUsers } from './communityUsers'

it('deduplicates roles, gives creator/mod precedence and never invents a role', () => {
  const grouped = groupCommunityUsers([
    { user_login: 'Owner', user_id: 'owner-id' },
    { user_login: 'ALICE', isVip: true }, { user_login: 'viewer' },
  ], [{ user_login: 'alice', user_id: 'alice-id' }], [{ user_login: 'alice' }], 'owner-id')
  expect(grouped.broadcaster.map(user => user.user_login)).toEqual(['owner'])
  expect(grouped.moderators.map(user => user.user_login)).toEqual(['alice'])
  expect(grouped.vips).toEqual([])
  expect(grouped.viewers.map(user => user.user_login)).toEqual(['viewer'])
})
