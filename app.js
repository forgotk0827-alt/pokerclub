const state = require('./utils/state')

App({
  onLaunch(options) {
    state.resetUserSession()
    state.ensureSeed()
    state.syncServerData()
    if (options && options.query) state.applyTablePayload(options.query, { toast: false })
  },
  onShow() {
    state.syncServerData()
  },
  globalData: {
    brand: '破壳派酒吧'
  }
})
