const state = require('../../utils/state')

Page({
  data: {
    member: {},
    activeTab: 'points',
    voucherSummary: {},
    globalSettings: state.getGlobalSettings()
  },
  onLoad(options) {
    this.setData({ activeTab: options && ['fragments', 'voucher'].includes(options.tab) ? options.tab : 'points' })
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
      const nextMember = member || state.getMember()
      state.fetchGlobalSettings((globalSettings) => {
        state.fetchVoucherSettings(() => {
          this.setData({
            member: nextMember,
            globalSettings: globalSettings || state.getGlobalSettings(),
            voucherSummary: this.buildVoucherSummary(nextMember)
          })
        })
      })
    })
  },
  switchTab(event) {
    const activeTab = event.currentTarget.dataset.key || 'points'
    this.setData({ activeTab }, () => {
      if (activeTab === 'voucher') {
        this.setData({ voucherSummary: this.buildVoucherSummary(this.data.member) })
      }
    })
  },
  buildVoucherSummary(member) {
    const settings = state.getVoucherSettings()
    const count = Number(member && member.drinkVoucherCount || 0)
    return {
      count,
      title: settings.title || '我的酒水券',
      note: settings.note || '可兑换一瓶啤酒或一箱啤酒，由门店自行决定。',
      expireText: settings.expireText || '长期有效'
    }
  },
  goUseVoucher() {
    wx.showToast({ title: '到店消费后请联系工作人员核销', icon: 'none' })
  }
})
