const data = require('../../utils/data')
const state = require('../../utils/state')

Page({
  data: {
    stores: data.stores,
    storeIndex: 0,
    wineName: '',
    quantity: 1,
    months: 3,
    records: [],
    reminderShown: false
  },
  onShow() {
    state.requireLogin('查看存酒记录', () => {
      this.refresh()
    })
  },
  refresh() {
    const records = state.getCellar().map((item) =>
      Object.assign({}, item, {
        reminderText: state.cellarReminder(item)
      })
    )
    this.setData({ records })
    this.showDueReminder(records)
  },
  showDueReminder(records) {
    if (this.data.reminderShown) {
      return
    }
    const dueItems = records.filter((item) => item.status === '存放中' && item.reminderText && item.reminderText !== '到期前7天提醒')
    if (!dueItems.length) {
      return
    }
    this.setData({ reminderShown: true })
    wx.showModal({
      title: '存酒到期提醒',
      content: dueItems.map((item) => `${item.wineName}：${item.reminderText}`).join('\n'),
      showCancel: false,
      confirmText: '知道了'
    })
  },
  selectStore(event) {
    this.setData({ storeIndex: Number(event.detail.value || 0) })
  },
  inputWine(event) {
    this.setData({ wineName: event.detail.value })
  },
  inputQuantity(event) {
    this.setData({ quantity: event.detail.value })
  },
  inputMonths(event) {
    this.setData({ months: event.detail.value })
  },
  submit() {
    state.requireLogin('提交存酒申请', () => {
      const wineName = String(this.data.wineName || '').trim()
      const quantity = Number(this.data.quantity || 0)
      const months = Number(this.data.months || 0)
      if (!wineName) {
        wx.showToast({ title: '请输入酒品名称', icon: 'none' })
        return
      }
      if (!quantity || quantity < 1) {
        wx.showToast({ title: '请输入存酒数量', icon: 'none' })
        return
      }
      if (!months || months < 1) {
        wx.showToast({ title: '请输入续存月数', icon: 'none' })
        return
      }
      const store = this.data.stores[this.data.storeIndex]
      state.submitCellar({
        storeId: store.id,
        storeName: store.shortName,
        wineName,
        quantity,
        months
      })
      this.setData({ wineName: '', quantity: 1, months: 3 })
      this.refresh()
      wx.showToast({ title: '已提交申请', icon: 'success' })
    })
  },
  extract(event) {
    const id = event.currentTarget.dataset.id
    state.requireLogin('提取存酒', () => {
      state.updateCellarStatus(id, '已提取')
      this.refresh()
      wx.showToast({ title: '已提交提取', icon: 'success' })
    })
  },
  renew(event) {
    const id = event.currentTarget.dataset.id
    state.requireLogin('续存存酒', () => {
      state.renewCellar(id, 3)
      this.refresh()
      wx.showToast({ title: '已续存3个月', icon: 'success' })
    })
  }
})
