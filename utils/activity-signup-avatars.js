function signupIdentity(signup, index = 0) {
  if (!signup) return `signup-${index}`
  return String(signup.memberKey || signup.memberId || signup.userId || signup.openid || signup.id || `signup-${index}`)
}

function buildActivitySignupAvatars(signups, limit = 10) {
  const seen = new Set()
  const avatars = []
  ;(signups || []).forEach((signup, index) => {
    const key = signupIdentity(signup, index)
    if (seen.has(key)) return
    seen.add(key)
    avatars.push({
      id: signup.id || key,
      avatarUrl: signup.avatarUrl || '',
      avatarText: signup.avatarText || (signup.displayName || signup.nickname || '').slice(0, 1) || '人',
      displayName: signup.displayName || signup.nickname || ''
    })
  })
  return avatars.slice(0, limit)
}

module.exports = {
  buildActivitySignupAvatars
}
