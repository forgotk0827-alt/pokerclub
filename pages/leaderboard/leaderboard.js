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
    this.setData({ activeType: type, list: [] })
    this.refresh()
  },
  refresh() {
    const type = this.data.activeType
    state.fetchStores(() => {
      const storeId = state.getStore().id
      state.fetchPublicLeaderboard(() => {
        this.setData({ list: state.getLeaderboard(type, storeId) })
      }, type)
    })
  }
})
