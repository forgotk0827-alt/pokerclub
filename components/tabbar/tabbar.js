const state = require('../../utils/state')

Component({
  properties: {
    active: {
      type: String,
      value: 'home'
    }
  },
  data: {
    items: [
      { key: 'home', label: '首页', icon: '⌂', url: '/pages/home/home' },
      { key: 'menu', label: '点餐', icon: '◒', url: '/pages/menu/menu' },
      { key: 'activity', label: '活动报名', icon: '▤', url: '/pages/activity/activity' },
      { key: 'cart', label: '购物车', icon: '▰', url: '/pages/cart/cart' },
      { key: 'profile', label: '我的', icon: '◉', url: '/pages/profile/profile' }
    ]
  },
  methods: {
    go(event) {
      const url = event.currentTarget.dataset.url
      const current = `/${getCurrentPages().slice(-1)[0].route}`
      if (url === current) {
        return
      }
      if (url === '/pages/cart/cart') {
        state.requireLogin('查看购物车', () => {
          wx.reLaunch({ url })
        })
        return
      }
      wx.reLaunch({ url })
    }
  }
})
