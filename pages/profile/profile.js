const state = require('../../utils/state')
const qrcode = require('../../utils/qrcode')

Page({
  data: {
    member: state.getMember(),
    isLoggedIn: false,
    signups: [],
    orders: [],
    qrVisible: false,
    qrTime: '',
    memberQr: []
  },
  onShow() {
    this.refresh()
  },
  refresh() {
    const member = state.getMember()
    const isLoggedIn = state.isLoggedIn()
    this.setData({
      member,
      isLoggedIn,
      signups: isLoggedIn ? state.getSignups() : [],
      orders: isLoggedIn ? state.getOrders().slice(0, 3) : [],
      memberQr: this.buildMemberQr(member)
    })
  },
  buildMemberQr(member) {
    const isLoggedIn = state.isLoggedIn()
    const orders = isLoggedIn ? state.getOrders() : []
    const signups = isLoggedIn ? state.getSignups() : []
    const shortId = String(member.id || 'guest').slice(-8)
    const shortName = String(member.nickname || '游客').slice(0, 4)
    const payload = `DY;U=${shortName};P=${member.points || 0};B=${member.balance || 0};O=${orders.length};S=${signups.length};I=${shortId}`
    return qrcode.generate(payload)
  },
  login() {
    state.loginWithWeChat(() => this.refresh())
  },
  showMemberQr() {
    state.requireLogin('查看会员二维码', () => {
      const member = state.getMember()
      this.setData({
        member,
        memberQr: this.buildMemberQr(member),
        qrTime: this.formatQrTime(new Date()),
        qrVisible: true
      })
    })
  },
  closeMemberQr() {
    this.setData({ qrVisible: false })
  },
  formatQrTime(date) {
    const pad = (value) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  },
  noop() {},
  editNickname() {
    if (!state.requireLogin('修改昵称')) {
      return
    }
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入新的昵称',
      confirmText: '保存',
      success: (res) => {
        if (res.confirm) {
          const member = state.updateNickname(res.content)
          this.setData({ member })
          wx.showToast({ title: '已保存', icon: 'success' })
        }
      }
    })
  },
  openVip() {
    state.requireLogin('开通会员', () => {
      wx.navigateTo({ url: '/pages/vip-upgrade/vip-upgrade' })
    })
  },
  contact() {
    if (!state.requireLogin('联系顾问')) {
      return
    }
    wx.showToast({ title: '已联系顾问', icon: 'success' })
  },
  goSignups() {
    state.requireLogin('查看报名记录', () => {
      wx.navigateTo({ url: '/pages/profile-signups/profile-signups' })
    })
  },
  goPoints() {
    state.requireLogin('查看积分', () => {
      wx.navigateTo({ url: '/pages/profile-points/profile-points' })
    })
  },
  goRecharge() {
    state.requireLogin('查看储值账户', () => {
      wx.navigateTo({ url: '/pages/recharge/recharge' })
    })
  },
  goOrders() {
    state.requireLogin('查看订单', () => {
      wx.navigateTo({ url: '/pages/profile-orders/profile-orders' })
    })
  },
  goFavorites() {
    state.requireLogin('查看收藏', () => {
      wx.navigateTo({ url: '/pages/profile-favorites/profile-favorites' })
    })
  },
  goCellar() {
    state.requireLogin('查看存酒', () => {
      wx.navigateTo({ url: '/pages/cellar/cellar' })
    })
  },
  goMerchant() {
    wx.navigateTo({ url: state.isMerchantLoggedIn() ? '/pages/merchant/merchant' : '/pages/merchant-login/merchant-login' })
  },
  goInfo() {
    state.requireLogin('查看个人资料', () => {
      wx.navigateTo({ url: '/pages/profile-info/profile-info' })
    })
  },
  goFaq() {
    wx.navigateTo({ url: '/pages/profile-faq/profile-faq' })
  },
  goAbout() {
    wx.navigateTo({ url: '/pages/profile-about/profile-about' })
  }
})
