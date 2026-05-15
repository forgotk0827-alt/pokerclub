const state = require('../../utils/state')

Page({
  data: {
    globalSettings: state.getGlobalSettings()
  },
  onShow() {
    this.refresh()
    state.fetchGlobalSettings((globalSettings) => {
      this.setData({ globalSettings })
    })
  },
  refresh() {
    this.setData({ globalSettings: state.getGlobalSettings() })
  }
})
