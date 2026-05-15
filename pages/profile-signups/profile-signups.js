const state = require('../../utils/state')

Page({
  data: {
    active: 'all',
    tabs: [
      { key: 'all', name: '全部' },
      { key: 'pending', name: '待核销' },
      { key: 'done', name: '已完成' },
      { key: 'expired', name: '已失效' }
    ],
    list: []
  },
  onShow() {
    if (!state.requireLogin('查看报名记录', () => this.filterList())) {
      this.setData({ list: [] })
      return
    }
    this.filterList()
  },
  selectTab(event) {
    this.setData({ active: event.currentTarget.dataset.key }, () => this.filterList())
  },
  filterList() {
    const signups = state.getSignups()
    const list = signups.filter((item) => {
      if (this.data.active === 'all') return true
      if (this.data.active === 'pending') return item.status === '已报名'
      if (this.data.active === 'done') return item.status === '已完成'
      return item.status === '已失效'
    })
    this.setData({ list })
  }
})
