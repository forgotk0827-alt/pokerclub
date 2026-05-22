const state = require('../../utils/state')

Page({
  data: {
    dates: [],
    types: [{ name: '全部' }, { name: '国际扑克' }, { name: '掼蛋' }],
    activeDay: 'all',
    activeType: '全部',
    activities: [],
    list: [],
    avatarList: ['帅', '帅', '帅', '帅']
  },
  onLoad() {
    this.refreshDates()
  },
  onShow() {
    this.refreshDates()
    state.fetchActivities(() => {
      state.fetchMySignups(() => this.refreshActivityList())
    })
  },
  refreshActivityList() {
    const store = state.getStore()
    this.setData({ activities: state.getActivities().filter((item) => !item.storeId || item.storeId === store.id) }, () => this.filterList())
  },
  refreshDates() {
    const labels = [
      { key: 'today', label: '今天', offset: 0 },
      { key: 'tomorrow', label: '明天', offset: 1 },
      { key: 'after', label: '后天', offset: 2 },
      { key: 'two', label: '2天后', offset: 3 }
    ]
    const dates = [
      { key: 'all', date: '', label: '全部' },
      ...labels.map((item) => ({
        key: item.key,
        date: this.formatDateText(item.offset),
        weekday: this.formatWeekdayText(item.offset),
        label: item.label
      }))
    ]
    this.setData({ dates })
  },
  formatDateText(offset) {
    const date = new Date()
    date.setDate(date.getDate() + offset)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${month}月${day}日`
  },
  formatWeekdayText(offset) {
    const date = new Date()
    date.setDate(date.getDate() + offset)
    return this.weekdayText(date)
  },
  weekdayText(date) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  },
  filterList() {
    const signups = state.getSignups()
    const list = this.data.activities.filter((item) => {
      const dayMatched = this.data.activeDay === 'all' || item.dayLabel === this.dayLabel(this.data.activeDay)
      const typeMatched = this.data.activeType === '全部' || item.type === this.data.activeType
      return dayMatched && typeMatched
    }).map((item) => Object.assign({}, item, {
      signupClosed: state.isActivitySignupClosed(item),
      statusText: state.isActivitySignupClosed(item) ? '已截止' : '报名中',
      avatars: signups
        .filter((signup) => signup.activityId === item.id)
        .slice(0, 4)
        .map((signup) => ({
          avatarUrl: signup.avatarUrl || '',
          avatarText: signup.avatarText || (signup.nickname || '').slice(0, 1) || '人'
        }))
    }))
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
  openDetail(event) {
    wx.navigateTo({ url: `/pages/activity-detail/activity-detail?id=${event.currentTarget.dataset.id}` })
  }
})
