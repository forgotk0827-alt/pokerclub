const state = require('./utils/state')

App({
  onLaunch() {
    state.ensureSeed()
  },
  globalData: {
    brand: '德友酒吧'
  }
})
