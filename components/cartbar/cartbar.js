const state = require('../../utils/state')

Component({
  properties: {
    summary: {
      type: Object,
      value: { count: 0, total: 0 }
    }
  },
  data: {
    visible: false,
    cart: [],
    sheetSummary: { count: 0, total: 0 }
  },
  methods: {
    refreshCart() {
      const cart = state.getCart()
      const sheetSummary = state.getCartSummary(cart)
      this.setData({ cart, sheetSummary })
      this.triggerEvent('cartchange', { summary: sheetSummary })
      return { cart, sheetSummary }
    },
    openSheet() {
      state.requireLogin('查看购物车', () => {
        this.refreshCart()
        this.setData({ visible: true })
      })
    },
    closeSheet() {
      this.setData({ visible: false })
    },
    noop() {},
    changeCount(event) {
      const { id, delta } = event.currentTarget.dataset
      state.requireLogin('修改购物车', () => {
        const cart = state.updateCartItem(id, Number(delta))
        const sheetSummary = state.getCartSummary(cart)
        this.setData({
          cart,
          sheetSummary,
          visible: cart.length > 0
        })
        this.triggerEvent('cartchange', { summary: sheetSummary })
      })
    },
    clearCart() {
      state.requireLogin('清空购物车', () => {
        state.clearCart()
        const sheetSummary = { count: 0, total: 0 }
        this.setData({
          cart: [],
          sheetSummary,
          visible: false
        })
        this.triggerEvent('cartchange', { summary: sheetSummary })
        wx.showToast({ title: '已清空', icon: 'success' })
      })
    },
    goCheckout() {
      state.requireLogin('去结算', () => {
        wx.reLaunch({ url: '/pages/cart/cart' })
      })
    }
  }
})
