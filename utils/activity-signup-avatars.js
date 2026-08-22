function buildActivitySignupAvatars(signups, limit = 10) {
  const avatars = []
  ;(signups || []).forEach((signup, index) => {
    const key = String((signup && signup.id) || `signup-${index}`)
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
