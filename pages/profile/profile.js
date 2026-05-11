const state = require('../../utils/state')

Page({
  data: {
    member: state.getMember(),
    signups: [],
    orders: []
  },
  onShow() {
    this.setData({
      member: state.getMember(),
      signups: state.getSignups(),
      orders: state.getOrders().slice(0, 3)
    })
  },
  openVip() {
    wx.showModal({
      title: '会员开通',
      content: '会员开通、储值与积分规则后续可对接真实后台。',
      confirmText: '知道了',
      showCancel: false
    })
  },
  contact() {
    wx.showToast({ title: '已联系顾问', icon: 'success' })
  },
  goSignups() {
    wx.showToast({ title: '报名记录已在当前页展示', icon: 'none' })
  },
  goPoints() {
    wx.showModal({
      title: '我的积分',
      content: `当前积分：${this.data.member.points}。可在后台对接积分明细页面。`,
      showCancel: false
    })
  },
  goOrders() {
    wx.reLaunch({ url: '/pages/cart/cart' })
  },
  goFavorites() {
    wx.showModal({
      title: '我的收藏',
      content: '收藏入口已预留，后续可接入商品和活动收藏逻辑。',
      showCancel: false
    })
  }
})
