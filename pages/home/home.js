const state = require('../../utils/state')

Page({
  data: {
    store: null,
    globalSettings: null,
    featured: [],
    leaderboardTabs: state.leaderboardTabs,
    activeRankType: 'weekly',
    leaderboardList: [],
    avatarList: ['客', '客', '客', '客', '客'],
    cartSummary: { count: 0, total: 0 },
    nearestStorePromptVisible: false,
    nearestStorePrompt: null,
    storePickerVisible: false,
    canCloseStorePicker: false,
    stores: []
  },
  onShow() {
    state.fetchStores(() => {
      const stores = state.getStores()
      this.setData({ stores })
      this.resolveInitialStore(() => {
        state.fetchProducts(() => {
          state.fetchGlobalSettings((globalSettings) => {
            state.fetchPublicLeaderboard(() => {
              this.setData({ globalSettings })
              this.loadHome()
            }, 'weekly')
          })
        })
      })
    })
  },
  resolveInitialStore(callback) {
    if (state.isStoreGuideDone()) {
      if (callback) callback()
      return
    }
    state.requestNearestStore((nearest) => {
      if (!nearest) {
        this.showStorePicker()
        if (callback) callback()
        return
      }
      const storeName = nearest.shortName || nearest.name
      const distanceText = state.formatDistance(nearest.distance)
      this.setData({
        nearestStorePromptVisible: true,
        nearestStorePrompt: {
          id: nearest.id,
          name: storeName,
          distanceText,
          message: `已为你定位到最近门店：${storeName}${distanceText ? `（距离 ${distanceText}）` : ''}`
        }
      })
      if (callback) callback()
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
    this.setData({
      leaderboardList: state.getLeaderboard(this.data.activeRankType).slice(0, 5)
    })
  },
  switchRankType(event) {
    const type = event.currentTarget.dataset.type || 'weekly'
    this.setData({ activeRankType: type, leaderboardList: [] }, () => this.loadLeaderboardPreview())
  },
  switchStore() {
    this.showStorePicker()
  },
  confirmNearestStore() {
    state.markStoreGuideDone()
    this.setData({
      nearestStorePromptVisible: false,
      nearestStorePrompt: null
    }, () => this.loadHome())
  },
  changeNearestStore() {
    this.setData({
      nearestStorePromptVisible: false,
      nearestStorePrompt: null
    }, () => this.showStorePicker())
  },
  showStorePicker() {
    const stores = state.getStores()
    this.setData({
      stores,
      storePickerVisible: true,
      canCloseStorePicker: state.isStoreGuideDone()
    })
  },
  hideStorePicker() {
    if (!state.isStoreGuideDone()) return
    this.setData({ storePickerVisible: false })
  },
  selectStore(event) {
    const store = this.data.stores.find((item) => item.id === event.currentTarget.dataset.id)
    if (!store) return
    state.clearTableContext()
    state.setStore(store.id)
    state.markStoreGuideDone()
    this.setData({ storePickerVisible: false }, () => this.loadHome())
  },
  goStoreSelect() {
    this.setData({ storePickerVisible: false })
    wx.navigateTo({ url: '/pages/store-select/store-select' })
  },
  noop() {},
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
