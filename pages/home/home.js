const state = require('../../utils/state')

Page({
  data: {
    store: null,
    globalSettings: null,
    featured: [],
    leaderboardTabs: state.leaderboardTabs,
    activeRankType: 'weekly',
    weeklyLeaderboard: [],
    monthlyLeaderboard: [],
    yearlyLeaderboard: [],
    avatarList: ['客', '客', '客', '客', '客'],
    cartSummary: { count: 0, total: 0 }
  },
  onShow() {
    state.fetchStores(() => {
      state.fetchProducts(() => {
        state.fetchGlobalSettings((globalSettings) => {
          state.fetchPublicLeaderboard(() => {
            this.setData({ globalSettings })
            this.loadHome()
          }, 'weekly')
        })
      })
    })
  },
  loadHome() {
    const store = state.getStore()
    const products = state.getProducts()
    const storeProducts = products.filter((item) => state.isProductVisibleInStore(item, store.id))
    this.setData({
      store,
      featured: storeProducts.filter((item) => item.categoryId === 'packages' && item.sale).slice(0, 3),
      cartSummary: state.getCartSummary()
    }, () => this.loadLeaderboardPreview())
  },
  loadLeaderboardPreview() {
    const store = state.getStore()
    this.setData({
      weeklyLeaderboard: state.getLeaderboard('weekly', store.id).slice(0, 3),
      monthlyLeaderboard: state.getLeaderboard('monthly', store.id).slice(0, 3),
      yearlyLeaderboard: state.getLeaderboard('yearly', store.id).slice(0, 3)
    })
  },
  switchStore() {
    wx.navigateTo({ url: '/pages/store-select/store-select' })
  },
  openNavigation() {
    state.openStoreLocation(this.data.store)
  },
  scanOrder() {
    state.requireLogin('扫码点餐', () => {
      wx.scanCode({
        onlyFromCamera: true,
        success(res) {
          const context = state.applyTablePayload(res.path || res.result)
          if (!context) {
            wx.showToast({ title: '未识别到桌台二维码', icon: 'none' })
            return
          }
          wx.reLaunch({ url: `/pages/menu/menu?tableNo=${context.tableNo}` })
        },
        fail(err) {
          if (err && err.errMsg && err.errMsg.includes('cancel')) {
            wx.showToast({ title: '已取消扫码', icon: 'none' })
            return
          }
          wx.showToast({ title: '扫码失败，请重试', icon: 'none' })
        }
      })
    })
  },
  go(event) {
    wx.reLaunch({ url: event.currentTarget.dataset.url })
  },
  goActivity() {
    wx.navigateTo({ url: '/pages/activity/activity' })
  },
  goRecharge() {
    wx.navigateTo({ url: '/pages/profile-points/profile-points?tab=points' })
  },
  goLeaderboard() {
    wx.navigateTo({ url: '/pages/leaderboard/leaderboard' })
  },
  goVideos() {
    wx.navigateTo({ url: '/pages/videos/videos' })
  },
  showPartner() {
    if (!state.requireLogin('查看共享合伙人', () => this.showPartner())) {
      return
    }
    wx.showModal({
      title: '共享合伙人',
      content: '合伙人权益可由后台配置，包含邀请返利、活动优先报名与专属酒水优惠。',
      showCancel: false
    })
  },
  showCoupon() {
    if (!state.requireLogin('进入活动报名', () => this.showCoupon())) {
      return
    }
    wx.navigateTo({ url: '/pages/activity/activity' })
  },
  addCart(event) {
    const product = state.getProducts().find((item) => {
      const matchedId = item.id === event.currentTarget.dataset.id
      const matchedStore = state.isProductVisibleInStore(item, this.data.store.id)
      return matchedId && matchedStore
    })
    if (!product) {
      return
    }
    if (!product.sale) {
      wx.showToast({ title: '当前不可售', icon: 'none' })
      return
    }
    state.requireLogin('加入购物车', () => {
      const cart = state.addToCart(product)
      this.setData({ cartSummary: state.getCartSummary(cart) })
    })
  },
  handleCartChange(event) {
    this.setData({ cartSummary: event.detail.summary })
  }
})
