const assert = require('assert')
const { buildActivitySignupAvatars } = require('../utils/activity-signup-avatars')

const signups = [
  { id: 'SU1', memberKey: 'M001', avatarUrl: '/a.png', displayName: '帅哥' },
  { id: 'SU2', memberKey: 'M001', avatarUrl: '/a.png', displayName: '帅哥' },
  { id: 'SU3', memberKey: 'M002', avatarUrl: '/b.png', displayName: '美女' }
]

assert.deepStrictEqual(buildActivitySignupAvatars(signups, 10), [
  { id: 'SU1', avatarUrl: '/a.png', avatarText: '帅', displayName: '帅哥' },
  { id: 'SU3', avatarUrl: '/b.png', avatarText: '美', displayName: '美女' }
])
