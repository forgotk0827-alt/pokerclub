const state = require('../../utils/state')

Page({
  data: {
    globalSettings: null
  },
  onShow() {
    state.fetchGlobalSettings((globalSettings) => {
      this.setData({ globalSettings })
    })
  },
  refresh() {
    this.setData({ globalSettings: state.getGlobalSettings() })
  }
})
