const state = require('../../utils/state')

Page({
  data: {
    tabs: ['全部', '营业中', '已休息'],
    activeTab: '全部',
    stores: [],
    visibleStores: []
  },
  onShow() {
    this.refresh()
  },
  refresh() {
    state.fetchStores((latestStores) => {
      this.setData({ stores: latestStores || [] }, () => this.buildVisibleStores())
    })
  },
  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.tab }, () => this.buildVisibleStores())
  },
  buildVisibleStores() {
    const tab = this.data.activeTab
    const visibleStores = this.data.stores.filter((store) => {
      if (tab === '全部') return true
      if (tab === '营业中') return store.status === '营业中'
      if (tab === '已休息') return store.status !== '营业中'
      return true
    })
    this.setData({ visibleStores })
  },
  enterStore(event) {
    const store = this.data.stores.find((item) => item.id === event.currentTarget.dataset.id)
    if (!store) {
      return
    }
    state.clearTableContext()
    state.setStore(store.id)
    state.markStoreGuideDone()
    wx.reLaunch({ url: '/pages/home/home' })
  },
  openMap(event) {
    const store = this.data.stores.find((item) => item.id === event.currentTarget.dataset.id)
    if (!store) {
      return
    }
    state.openStoreLocation(store)
  }
})
