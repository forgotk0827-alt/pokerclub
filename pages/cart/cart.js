const state = require('../../utils/state')

Page({
  data: {
    cart: [],
    summary: { count: 0, total: 0 }
  },
  onShow() {
    this.refresh()
  },
  refresh() {
    const cart = state.getCart()
    this.setData({
      cart,
      summary: state.getCartSummary(cart)
    })
  },
  changeCount(event) {
    const { id, delta } = event.currentTarget.dataset
    const cart = state.updateCartItem(id, Number(delta))
    this.setData({
      cart,
      summary: state.getCartSummary(cart)
    })
  },
  clearCart() {
    if (!this.data.cart.length) {
      return
    }
    wx.showModal({
      title: '清空购物车',
      content: '确认要清空当前购物车吗？',
      success: (res) => {
        if (res.confirm) {
          state.clearCart()
          this.refresh()
        }
      }
    })
  },
  checkout() {
    if (!this.data.cart.length) {
      wx.showToast({ title: '购物车为空', icon: 'none' })
      return
    }
    const order = state.createOrder({ mode: '堂食' })
    if (!order) {
      wx.showToast({ title: '下单失败', icon: 'none' })
      return
    }
    wx.showModal({
      title: '订单已创建',
      content: `订单号 ${order.id} 已生成，当前为待支付状态。`,
      confirmText: '去我的',
      success(res) {
        if (res.confirm) {
          wx.reLaunch({ url: '/pages/profile/profile' })
        }
      }
    })
  }
})
