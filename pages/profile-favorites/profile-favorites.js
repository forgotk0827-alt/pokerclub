const state = require('../../utils/state')

Page({
  onShow() {
    state.requireLogin('查看收藏')
  }
})
