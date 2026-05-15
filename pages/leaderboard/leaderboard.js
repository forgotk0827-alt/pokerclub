const state = require('../../utils/state')

Page({
  data: {
    tabs: state.leaderboardTabs,
    activeType: 'weekly',
    list: []
  },
  onShow() {
    this.refresh()
  },
  selectType(event) {
    const type = event.currentTarget.dataset.type || 'weekly'
    this.setData({ activeType: type, list: state.getLeaderboard(type) })
    this.refresh()
  },
  refresh() {
    const type = this.data.activeType
    this.setData({ list: state.getLeaderboard(type) })
    state.fetchPublicLeaderboard((list) => {
      this.setData({ list: list || state.getLeaderboard(type) })
    }, type)
  }
})
