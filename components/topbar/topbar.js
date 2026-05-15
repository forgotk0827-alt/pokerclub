Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    showBack: {
      type: Boolean,
      value: false
    }
  },
  data: {
    statusBarHeight: 28,
    navHeight: 48,
    topbarHeight: 76
  },
  lifetimes: {
    attached() {
      let statusBarHeight = 28
      if (wx.getWindowInfo) {
        statusBarHeight = wx.getWindowInfo().statusBarHeight || statusBarHeight
      } else if (wx.getSystemInfoSync) {
        statusBarHeight = wx.getSystemInfoSync().statusBarHeight || statusBarHeight
      }
      this.setData({
        statusBarHeight,
        topbarHeight: statusBarHeight + this.data.navHeight
      })
    }
  },
  methods: {
    goBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
        return
      }
      wx.reLaunch({ url: '/pages/home/home' })
    }
  }
})
