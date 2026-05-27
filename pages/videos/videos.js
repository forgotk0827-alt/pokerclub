const state = require('../../utils/state')

Page({
  data: {
    globalSettings: null,
    images: []
  },
  onShow() {
    state.fetchGlobalSettings((globalSettings) => {
      this.setData({
        globalSettings,
        images: this.buildImages(globalSettings)
      })
    })
  },
  refresh() {
    const globalSettings = state.getGlobalSettings()
    this.setData({
      globalSettings,
      images: this.buildImages(globalSettings)
    })
  },
  buildImages(globalSettings) {
    const settings = globalSettings || state.getGlobalSettings()
    return Array.isArray(settings.showcaseImages)
      ? settings.showcaseImages.filter(Boolean)
      : []
  }
})
