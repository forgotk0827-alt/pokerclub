const state = require('../../utils/state')

Page({
  data: {
    member: state.getMember()
  },
  onShow() {
    if (!state.requireLogin('查看积分', () => this.setData({ member: state.getMember() }))) {
      this.setData({ member: state.getMember() })
      return
    }
    this.setData({ member: state.getMember() })
  }
})
