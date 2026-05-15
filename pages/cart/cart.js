const state = require('../../utils/state')

Page({
  data: {
    cart: [],
    store: null,
    tableContext: null,
    summary: { count: 0, total: 0 }
  },
  onShow() {
    if (!state.requireLogin('查看购物车', () => this.refresh())) {
      this.setData({
        cart: [],
        store: state.getStore(),
        tableContext: state.getTableContext(),
        summary: { count: 0, total: 0 }
      })
      return
    }
    this.refresh()
  },
  refresh() {
    const cart = state.getCart()
    this.setData({
      cart,
      store: state.getStore(),
      tableContext: state.getTableContext(),
      summary: state.getCartSummary(cart)
    })
  },
  changeCount(event) {
    const { id, delta } = event.currentTarget.dataset
    state.requireLogin('修改购物车', () => {
      const cart = state.updateCartItem(id, Number(delta))
      this.setData({
        cart,
        summary: state.getCartSummary(cart)
      })
    })
  },
  clearCart() {
    state.requireLogin('清空购物车', () => {
      if (!this.data.cart.length) {
        wx.showToast({ title: '购物车为空', icon: 'none' })
        return
      }
      state.clearCart()
      this.setData({
        cart: [],
        summary: { count: 0, total: 0 }
      })
      wx.showToast({ title: '已清空', icon: 'success' })
    })
  },
  checkout() {
    state.requireLogin('提交订单', () => {
      if (!this.data.cart.length) {
        wx.showToast({ title: '购物车为空', icon: 'none' })
        return
      }
      state.createOrderWithWechatPay({ mode: '堂食' }, (order) => {
        if (!order) return
        this.refresh()
        wx.showModal({
          title: '订单已支付',
          content: `订单号 ${order.id} 已生成，支付结果以微信支付通知为准。`,
          confirmText: '去我的',
          success(res) {
            if (res.confirm) {
              wx.reLaunch({ url: '/pages/profile/profile' })
            }
          }
        })
      })
    })
  }
})
