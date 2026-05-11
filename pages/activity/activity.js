const data = require('../../utils/data')
const state = require('../../utils/state')

Page({
  data: {
    dates: [
      { key: 'all', date: '', label: '全部' },
      { key: 'today', date: '05月11日', label: '今天' },
      { key: 'tomorrow', date: '12日（周二）', label: '明天' },
      { key: 'after', date: '13日（周三）', label: '后天' },
      { key: 'two', date: '05月14日', label: '2天后' }
    ],
    types: [{ name: '全部' }, { name: '国际扑克' }, { name: '掼蛋' }],
    activeDay: 'all',
    activeType: '全部',
    activities: data.activities,
    list: [],
    avatarList: ['帅', '帅', '帅', '帅'],
    modalVisible: false,
    selected: null
  },
  onLoad() {
    this.filterList()
  },
  filterList() {
    const list = this.data.activities.filter((item) => {
      const dayMatched = this.data.activeDay === 'all' || item.dayLabel === this.dayLabel(this.data.activeDay)
      const typeMatched = this.data.activeType === '全部' || item.type === this.data.activeType
      return dayMatched && typeMatched
    })
    this.setData({ list })
  },
  dayLabel(key) {
    return {
      today: '今天',
      tomorrow: '明天',
      after: '后天',
      two: '2天后'
    }[key]
  },
  selectDay(event) {
    this.setData({ activeDay: event.currentTarget.dataset.key }, () => this.filterList())
  },
  selectType(event) {
    this.setData({ activeType: event.currentTarget.dataset.name }, () => this.filterList())
  },
  openSignup(event) {
    const selected = data.activities.find((item) => item.id === event.currentTarget.dataset.id)
    if (selected.status !== 'open') {
      wx.showToast({ title: '活动已结束', icon: 'none' })
      return
    }
    this.setData({ selected, modalVisible: true })
  },
  closeModal() {
    this.setData({ modalVisible: false, selected: null })
  },
  noop() {},
  confirmSignup() {
    const selected = this.data.selected
    state.addToCart({
      id: `signup-${selected.id}`,
      name: selected.productName,
      desc: `${selected.title}｜${selected.date}`,
      price: selected.price,
      unit: '张',
      image: selected.image,
      categoryId: 'activity',
      points: 0
    })
    state.addSignup(selected)
    this.closeModal()
    wx.showModal({
      title: '报名已生成',
      content: '报名商品已加入购物车，完成订单支付后即可核销入场。',
      confirmText: '去购物车',
      success(res) {
        if (res.confirm) {
          wx.reLaunch({ url: '/pages/cart/cart' })
        }
      }
    })
  },
  showPartner() {
    wx.showModal({
      title: '共享合伙人',
      content: '合伙人权益入口已预留，可接入邀请返利、活动优先报名与专属优惠。',
      showCancel: false
    })
  },
  showCoupon() {
    wx.showModal({
      title: '优惠券',
      content: '当前暂无可用优惠券，后续可接入后台券包。',
      showCancel: false
    })
  }
})
