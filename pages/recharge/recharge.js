const state = require('../../utils/state')

Page({
  data: {
    member: state.getMember(),
    settings: state.getRechargeSettings(),
    selectedIndex: 0,
    records: [],
    balanceAfter: 0
  },
  onShow() {
    if (!state.requireLogin('查看储值账户', () => this.refresh())) {
      this.setData({ member: state.getMember(), records: [], balanceAfter: 0 })
      return
    }
    this.refresh()
  },
  refresh() {
    const member = state.getMember()
    const settings = state.getRechargeSettings()
    const selectedIndex = Math.min(this.data.selectedIndex, Math.max(0, settings.packages.length - 1))
    const pack = settings.packages[selectedIndex] || settings.packages[0] || null
    const isLoggedIn = state.isLoggedIn()
    this.setData({
      member,
      settings,
      selectedIndex,
      records: isLoggedIn ? state.getRechargeRecords().filter((item) => item.memberId === member.id).slice(0, 20) : [],
      balanceAfter: pack ? Number(member.balance || 0) + Number(pack.creditAmount || 0) : Number(member.balance || 0)
    })
  },
  selectPackage(event) {
    const index = Number(event.currentTarget.dataset.index || 0)
    this.setData({ selectedIndex: index }, () => this.refresh())
  },
  rechargeNow() {
    if (!state.requireLogin('储值充值')) {
      return
    }
    const pack = this.data.settings.packages[this.data.selectedIndex]
    if (!pack) {
      wx.showToast({ title: '暂无充值套餐', icon: 'none' })
      return
    }
    state.rechargeWithWechatPay(pack, () => this.refresh())
  }
})
