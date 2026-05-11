const data = require('../../utils/data')
const state = require('../../utils/state')

Page({
  data: {
    store: data.stores[0],
    featured: []
  },
  onShow() {
    this.setData({
      store: state.getStore(),
      featured: data.products.filter((item) => item.categoryId === 'packages').slice(0, 3)
    })
  },
  switchStore() {
    wx.showActionSheet({
      itemList: data.stores.map((item) => item.shortName),
      success: (res) => {
        const store = data.stores[res.tapIndex]
        state.setStore(store.id)
        this.setData({ store })
        wx.showToast({ title: '已切换门店', icon: 'success' })
      }
    })
  },
  copyAddress() {
    wx.setClipboardData({
      data: this.data.store.address,
      success() {
        wx.showToast({ title: '地址已复制' })
      }
    })
  },
  scanOrder() {
    wx.showToast({ title: '已进入点餐', icon: 'success' })
    wx.reLaunch({ url: '/pages/menu/menu' })
  },
  go(event) {
    wx.reLaunch({ url: event.currentTarget.dataset.url })
  },
  showPartner() {
    wx.showModal({
      title: '共享合伙人',
      content: '合伙人权益可由后台配置，包含邀请返利、活动优先报名与专属酒水优惠。',
      showCancel: false
    })
  },
  showCoupon() {
    wx.showModal({
      title: '优惠券',
      content: '当前暂无可用优惠券，后续可接入后台券包。',
      showCancel: false
    })
  },
  addCart(event) {
    const product = data.products.find((item) => item.id === event.currentTarget.dataset.id)
    state.addToCart(product)
    wx.showToast({ title: '已加入购物车' })
  }
})
