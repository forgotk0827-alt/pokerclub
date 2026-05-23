const state = require('../../utils/state')

Page({
  data: {
    member: {},
    settings: { packages: [] },
    selectedIndex: 0,
    useCustomRecharge: false,
    customPayAmount: '',
    selectedRechargeAmount: 0
  },
  onShow() {
    if (!state.requireLogin('查看储值账户', () => this.refreshFromServer())) {
      this.setData({ member: state.getMember(), selectedRechargeAmount: 0 })
      return
    }
    this.refreshFromServer()
  },
  refreshFromServer() {
    state.fetchMyProfile(() => {
      state.fetchRechargeSettings(() => {
        state.fetchMyRechargeRecords(() => this.refresh())
      })
    })
  },
  refresh() {
    const member = state.getMember()
    const settings = state.getRechargeSettings()
    const selectedIndex = this.data.useCustomRecharge ? -1 : Math.min(Math.max(this.data.selectedIndex, 0), Math.max(0, settings.packages.length - 1))
    const pack = settings.packages[selectedIndex] || settings.packages[0] || null
    const customPayAmount = Number(this.data.customPayAmount || 0)
    const selectedRechargeAmount = this.data.useCustomRecharge ? customPayAmount : Number(pack && pack.payAmount || 0)
    this.setData({
      member,
      settings,
      selectedIndex,
      selectedRechargeAmount,
      useCustomRecharge: this.data.useCustomRecharge,
      customPayAmount: String(this.data.customPayAmount || '')
    })
  },
  selectPackage(event) {
    const index = Number(event.currentTarget.dataset.index || 0)
    this.setData({ selectedIndex: index, useCustomRecharge: false }, () => this.refresh())
  },
  selectCustomRecharge() {
    this.setData({ useCustomRecharge: true, selectedIndex: -1 }, () => this.refresh())
  },
  rechargeNow() {
    if (!state.requireLogin('储值充值')) {
      return
    }
    if (this.data.useCustomRecharge) {
      this.rechargeCustom()
      return
    }
    const pack = this.data.settings.packages[this.data.selectedIndex]
    if (!pack) {
      wx.showToast({ title: '暂无充值套餐', icon: 'none' })
      return
    }
    state.rechargeWithWechatPay(pack, () => this.refreshFromServer())
  },
  inputCustomPayAmount(event) {
    this.setData({ customPayAmount: event.detail.value, useCustomRecharge: true, selectedIndex: -1 }, () => this.refresh())
  },
  rechargeCustom() {
    if (!state.requireLogin('自定义充值')) {
      return
    }
    const payAmount = Number(this.data.customPayAmount || 0)
    if (!payAmount || payAmount <= 0) {
      wx.showToast({ title: '请输入充值金额', icon: 'none' })
      return
    }
    state.rechargeWithWechatPay({
      id: `custom-${Date.now()}`,
      label: `充${payAmount}元`,
      subLabel: `得${payAmount}元`,
      payAmount,
      creditAmount: payAmount,
      tip: '自定义充值'
    }, () => this.refreshFromServer())
  }
})
