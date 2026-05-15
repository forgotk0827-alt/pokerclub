const state = require('./utils/state')

App({
  onLaunch(options) {
    state.resetUserSession()
    state.ensureSeed()
    if (options && options.query) state.applyTablePayload(options.query, { toast: false })
  },
  globalData: {
    brand: '破壳派酒吧'
  }
})
