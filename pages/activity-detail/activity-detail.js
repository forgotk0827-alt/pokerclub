const state = require('../../utils/state')
const { buildActivitySignupAvatars } = require('../../utils/activity-signup-avatars')

Page({
  data: {
    activity: null,
    activeTab: 'detail',
    tabs: [
      { key: 'detail', name: '活动详情' },
      { key: 'environment', name: '环境详情' },
      { key: 'result', name: '赛事结果' }
    ],
    avatars: []
  },
  onLoad(options) {
    this.loadActivityFromServer(options.id)
  },
  onShow() {
    if (this.data.activity) {
      this.loadActivityFromServer(this.data.activity.id)
    }
  },
  loadActivityFromServer(id) {
    state.fetchActivities(() => {
      state.fetchMySignups(() => this.loadActivity(id))
    })
  },
  loadActivity(id) {
    const activity = state.getActivity(id)
    if (!activity) {
      wx.showToast({ title: '活动不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }
    this.setData({
      activity: Object.assign({}, activity, {
        remaining: Math.max(0, Number(activity.quota || 0) - Number(activity.joined || 0)),
        signupClosed: state.isActivitySignupClosed(activity),
        signupText: state.isActivitySignupClosed(activity) ? '已截止' : '立即报名'
      }),
      avatars: []
    })
    state.fetchActivitySignups(activity.id, (list) => {
      this.setData({
        avatars: buildActivitySignupAvatars(list || [], 12).map((item) => Object.assign({}, item, {
          displayName: item.displayName || '会员'
        }))
      })
    })
  },
  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.key })
  },
  openLocation() {
    state.openActivityLocation(this.data.activity)
  },
  signup() {
    const activity = this.data.activity
    if (!activity || activity.signupClosed || state.isActivitySignupClosed(activity)) {
      wx.showToast({ title: '报名已截止', icon: 'none' })
      return
    }
    if (Number(activity.joined || 0) >= Number(activity.quota || 0)) {
      wx.showToast({ title: '名额已满', icon: 'none' })
      return
    }
    state.requireLogin('活动报名', () => {
      state.ensureMemberAvatar((member) => {
        if (!member || !member.avatarUrl) return
        state.addToCart({
          id: `signup-${activity.id}`,
          activityId: activity.id,
          name: activity.productName || activity.title,
          desc: `${activity.title} - ${activity.date}`,
          price: Number(activity.price || 0),
          unit: '张',
          image: activity.image,
          categoryId: 'activity',
          points: Number(activity.pointsPrice || 0)
        })
        wx.showModal({
          title: '报名已加入购物车',
          content: '请到购物车完成结算，支付完成后即可核销入场。',
          confirmText: '去结算',
          success(res) {
            if (res.confirm) {
              wx.reLaunch({ url: '/pages/cart/cart' })
            }
          }
        })
      })
    })
  }
})
