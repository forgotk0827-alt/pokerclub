const state = require('../../utils/state')

Page({
  data: {
    active: 'all',
    tabs: [
      { key: 'all', name: '全部' },
      { key: 'paying', name: '待支付' },
      { key: 'done', name: '已完成' },
      { key: 'cancelled', name: '已取消' }
    ],
    list: []
  },
  onShow() {
    if (!state.requireLogin('查看订单', () => this.filterList())) {
      this.setData({ list: [] })
      return
    }
    this.filterList()
  },
  selectTab(event) {
    this.setData({ active: event.currentTarget.dataset.key }, () => this.filterList())
  },
  filterList() {
    const orders = state.getOrders()
    const list = orders.filter((item) => {
      if (this.data.active === 'all') return true
      if (this.data.active === 'paying') return item.status === '待支付'
      if (this.data.active === 'done') return item.status === '已完成'
      return item.status === '已取消'
    })
    this.setData({ list })
  }
})
