const state = require('../../utils/state')

Page({
  data: {
    member: {},
    activeTab: 'points'
  },
  onLoad(options) {
    this.setData({ activeTab: options && options.tab === 'fragments' ? 'fragments' : 'points' })
  },
  onShow() {
    if (!state.requireLogin('查看积分', () => this.refreshMemberFromServer())) {
      this.setData({ member: state.getMember() })
      return
    }
    this.refreshMemberFromServer()
  },
  refreshMemberFromServer() {
    state.fetchMyProfile((member) => {
      this.setData({ member: member || state.getMember() })
    })
  },
  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.key || 'points' })
  }
})
