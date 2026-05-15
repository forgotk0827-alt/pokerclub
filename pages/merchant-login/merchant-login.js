const state = require('../../utils/state')

Page({
  data: {
    username: '',
    password: ''
  },
  onShow() {
    if (state.isMerchantLoggedIn()) {
      wx.redirectTo({ url: '/pages/merchant/merchant' })
    }
  },
  inputUsername(event) {
    this.setData({ username: event.detail.value })
  },
  inputPassword(event) {
    this.setData({ password: event.detail.value })
  },
  login() {
    state.merchantLogin(String(this.data.username || '').trim(), String(this.data.password || '').trim(), (session) => {
      if (!session) return
      wx.showToast({ title: '登录成功', icon: 'success' })
      wx.redirectTo({ url: '/pages/merchant/merchant' })
    })
  }
})
