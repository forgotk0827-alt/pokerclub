const data = require('../../utils/data')
const state = require('../../utils/state')

Page({
  data: {
    globalSettings: state.getGlobalSettings(),
    videos: data.videos,
    activeId: ''
  },
  onShow() {
    this.refresh()
    state.fetchGlobalSettings((globalSettings) => {
      this.setData({
        globalSettings,
        videos: this.buildVideos(globalSettings)
      })
    })
  },
  refresh() {
    const globalSettings = state.getGlobalSettings()
    this.setData({
      globalSettings,
      videos: this.buildVideos(globalSettings)
    })
  },
  buildVideos(globalSettings) {
    const settings = globalSettings || state.getGlobalSettings()
    const current = settings.videoUrl
      ? [
          {
            id: 'merchant-video',
            type: '精彩呈现',
            title: settings.videoTitle || '精彩呈现',
            desc: settings.showcaseText || '',
            poster: '/assets/hero-bar.svg',
            src: settings.videoUrl
          }
        ]
      : []
    return current.concat(data.videos || [])
  },
  play(event) {
    this.setData({ activeId: event.currentTarget.dataset.id })
  },
  pause() {
    this.setData({ activeId: '' })
  }
})
