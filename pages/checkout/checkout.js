const state = require('../../utils/state')

Page({
  data: {
    cart: [],
    member: {},
    voucherSettings: state.getVoucherSettings(),
    preview: {
      originalTotal: 0,
      voucherDiscount: 0,
      voucherCountUsed: 0,
      balanceUsed: 0,
      payableTotal: 0,
      cashTotal: 0,
      pointsUsed: 0,
      pointsEnough: true
    },
    useBalance: true,
    useVoucher: false,
    paying: false
  },
  onShow() {
    if (!state.requireLogin('去结算', () => this.refresh())) {
      this.setData({
        cart: [],
        member: {},
        preview: {
          originalTotal: 0,
          voucherDiscount: 0,
          voucherCountUsed: 0,
          balanceUsed: 0,
          payableTotal: 0,
          cashTotal: 0,
          pointsUsed: 0,
          pointsEnough: true
        }
      })
      return
    }
    this.refresh()
  },
  refresh() {
    const cart = state.getCart()
    const member = state.getMember()
    if (!cart.length) {
      this.setData({ cart, member, preview: {
        originalTotal: 0,
        voucherDiscount: 0,
        voucherCountUsed: 0,
        balanceUsed: 0,
        payableTotal: 0,
        cashTotal: 0,
        pointsUsed: 0,
        pointsEnough: true
      } })
      wx.showToast({ title: '购物车为空', icon: 'none' })
      return
    }
    const useBalance = Number(member.balance || 0) > 0
    this.setData({
      cart,
      member,
      voucherSettings: state.getVoucherSettings(),
      useBalance,
      useVoucher: false
    }, () => this.rebuildPreview())
  },
  rebuildPreview() {
    const preview = state.buildCheckoutPreview(this.data.cart, this.data.member, {
      useBalance: this.data.useBalance,
      useVoucher: this.data.useVoucher
    })
    this.setData({ preview })
  },
  toggleBalance(event) {
    this.setData({ useBalance: !!event.detail.value }, () => this.rebuildPreview())
  },
  toggleVoucher(event) {
    this.setData({ useVoucher: !!event.detail.value }, () => this.rebuildPreview())
  },
  switchPayType(event) {
    const { id, payType } = event.currentTarget.dataset
    const cart = state.updateCartItemPayType(id, payType)
    this.setData({ cart }, () => this.rebuildPreview())
  },
  submitOrder() {
    if (this.data.paying) return
    if (!this.data.cart.length) {
      wx.showToast({ title: '购物车为空', icon: 'none' })
      return
    }
    if (!this.data.preview.pointsEnough) {
      wx.showToast({ title: '积分不足', icon: 'none' })
      return
    }
    this.setData({ paying: true })
    state.createOrderWithWechatPay({
      mode: '堂食',
      useBalance: this.data.useBalance,
      useVoucher: false
    }, (order) => {
      this.setData({ paying: false })
      if (!order) return
      this.setData({
        cart: [],
        member: state.getMember(),
        preview: {
          originalTotal: 0,
          voucherDiscount: 0,
          voucherCountUsed: 0,
          balanceUsed: 0,
          payableTotal: 0,
          cashTotal: 0,
          pointsUsed: 0,
          pointsEnough: true
        }
      })
      wx.showModal({
        title: '订单已提交',
        content: `订单号 ${order.id} 已生成，支付信息已同步。`,
        confirmText: '查看订单',
        success: (res) => {
          if (res.confirm) {
            wx.reLaunch({ url: '/pages/profile-orders/profile-orders' })
          }
        }
      })
    })
  }
})
