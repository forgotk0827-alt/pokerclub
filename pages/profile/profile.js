const state = require('../../utils/state')
const qrcode = require('../../utils/qrcode')

Page({
  data: {
    member: {},
    isLoggedIn: false,
    signups: [],
    orders: [],
    qrVisible: false,
    qrTime: '',
    memberQr: [],
    globalSettings: state.getGlobalSettings(),
    profileEditorVisible: false,
    profileEditorMode: 'edit',
    privacyAgreed: false,
    nicknameTipVisible: false,
    profileForm: {
      nickname: '',
      avatarUrl: ''
    }
  },
  loginFromRoute: false,
  onLoad(options) {
    this.loginFromRoute = String(options && options.login || '') === '1'
  },
  onShow() {
    if (this.loginFromRoute && !state.isLoggedIn()) {
      this.startLoginProfile()
    }
    if (state.isLoggedIn()) {
      state.fetchMyProfile(() => {
        state.fetchMyOrders(() => {
          state.fetchMySignups(() => this.refresh())
        })
      })
      state.fetchGlobalSettings((settings) => {
        if (settings) this.setData({ globalSettings: settings })
      })
      return
    }
    this.refresh()
    state.fetchGlobalSettings((settings) => {
      if (settings) this.setData({ globalSettings: settings })
    })
  },
  onUnload() {
    this.clearNicknameTipTimer()
  },
  refresh() {
    const member = state.getMember()
    const isLoggedIn = state.isLoggedIn()
    this.setData({
      member,
      isLoggedIn,
      signups: isLoggedIn ? state.getSignups() : [],
      orders: isLoggedIn ? state.getOrders().slice(0, 3) : [],
      memberQr: this.buildMemberQr(member),
      globalSettings: state.getGlobalSettings()
    })
  },
  buildMemberQr(member) {
    const isLoggedIn = state.isLoggedIn()
    const orders = isLoggedIn ? state.getOrders() : []
    const signups = isLoggedIn ? state.getSignups() : []
    const shortId = String(member.id || 'guest').slice(-8)
    const shortName = String(member.nickname || '游客').slice(0, 4)
    const payload = `DY;U=${shortName};P=${member.points || 0};B=${member.balance || 0};O=${orders.length};S=${signups.length};I=${shortId}`
    return qrcode.generate(payload)
  },
  oneTapLogin(event) {
    this.startLoginProfile()
  },
  startLoginProfile() {
    this.setData({
      profileEditorVisible: true,
      profileEditorMode: 'login',
      privacyAgreed: false,
      nicknameTipVisible: false,
      profileForm: {
        nickname: '',
        avatarUrl: ''
      }
    })
  },
  confirmProfileLogin(event) {
    const code = event && event.detail && event.detail.code
    if (!code) {
      wx.showToast({ title: '未获取到手机号授权', icon: 'none' })
      return
    }
    if (!this.data.privacyAgreed) {
      wx.showToast({ title: '请先阅读并同意隐私协议', icon: 'none' })
      return
    }
    this.resolveProfileForm((profile) => {
      if (!profile) return
      state.loginWithPhoneNumber(code, (member) => {
        if (!member) return
        this.setData({ profileEditorVisible: false })
        this.refresh()
        state.resolvePendingWechatLogin(member)
        if (this.loginFromRoute && wx.navigateBack) {
          this.loginFromRoute = false
          wx.navigateBack()
        }
      }, {
        profile,
        profileProvided: true
      })
    })
  },
  openProfileEditor() {
    const member = state.getMember()
    this.setData({
      profileEditorVisible: true,
      profileEditorMode: 'edit',
      nicknameTipVisible: false,
      profileForm: {
        nickname: member.nickname || '',
        avatarUrl: member.avatarUrl || ''
      }
    })
  },
  closeProfileEditor() {
    this.clearNicknameTipTimer()
    this.setData({ profileEditorVisible: false, privacyAgreed: false, nicknameTipVisible: false })
  },
  chooseProfileAvatar(event) {
    const avatarUrl = event && event.detail && event.detail.avatarUrl
    if (!avatarUrl) return
    this.setData({ 'profileForm.avatarUrl': avatarUrl })
  },
  inputProfileNickname(event) {
    this.setData({ 'profileForm.nickname': event.detail.value })
  },
  showNicknameTip() {
    this.setData({ nicknameTipVisible: true })
    this.clearNicknameTipTimer()
    this.nicknameTipTimer = setTimeout(() => {
      this.setData({ nicknameTipVisible: false })
    }, 1500)
  },
  clearNicknameTipTimer() {
    if (this.nicknameTipTimer) {
      clearTimeout(this.nicknameTipTimer)
      this.nicknameTipTimer = null
    }
  },
  togglePrivacyAgreement(event) {
    const value = event.detail.value || []
    this.setData({ privacyAgreed: value.indexOf('agree') > -1 })
  },
  openPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' })
  },
  resolveProfileForm(callback) {
    const nickname = String(this.data.profileForm.nickname || '').trim()
    const avatarUrl = String(this.data.profileForm.avatarUrl || '').trim()
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      if (callback) callback(null)
      return
    }
    if (!avatarUrl) {
      wx.showToast({ title: '请选择头像', icon: 'none' })
      if (callback) callback(null)
      return
    }
    const done = (finalAvatarUrl) => {
      if (!finalAvatarUrl) {
        if (callback) callback(null)
        return
      }
      if (callback) callback({ nickname, avatarUrl: finalAvatarUrl })
    }
    if (/^https?:\/\//i.test(avatarUrl)) {
      done(avatarUrl)
      return
    }
    state.uploadMerchantMedia(avatarUrl, 'image', done)
  },
  saveProfileEditor() {
    this.resolveProfileForm((profile) => {
      if (!profile) return
      state.updateMyProfile(profile, (member) => {
        if (!member) return
        this.setData({ profileEditorVisible: false })
        this.refresh()
        wx.showToast({ title: '资料已同步', icon: 'success' })
      })
    })
  },
  showMemberQr() {
    state.requireLogin('查看会员二维码', () => {
      const member = state.getMember()
      this.setData({
        member,
        memberQr: this.buildMemberQr(member),
        qrTime: this.formatQrTime(new Date()),
        qrVisible: true
      })
    })
  },
  closeMemberQr() {
    this.setData({ qrVisible: false })
  },
  previewGroupQr() {
    const url = this.data.globalSettings && this.data.globalSettings.groupQrImage
    if (!url || !wx.previewImage) return
    wx.previewImage({
      urls: [url],
      current: url
    })
  },
  formatQrTime(date) {
    const pad = (value) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  },
  noop() {},
  editNickname() {
    if (!state.requireLogin('修改昵称')) {
      return
    }
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入新的昵称',
      confirmText: '保存',
      success: (res) => {
        if (res.confirm) {
          const member = state.updateNickname(res.content)
          this.setData({ member })
          wx.showToast({ title: '已保存', icon: 'success' })
        }
      }
    })
  },
  openVip() {
    state.requireLogin('开通会员', () => {
      wx.navigateTo({ url: '/pages/vip-upgrade/vip-upgrade' })
    })
  },
  goSignups() {
    state.requireLogin('查看报名记录', () => {
      wx.navigateTo({ url: '/pages/profile-signups/profile-signups' })
    })
  },
  goPoints() {
    state.requireLogin('查看积分', () => {
      wx.navigateTo({ url: '/pages/profile-points/profile-points?tab=points' })
    })
  },
  goFragments() {
    state.requireLogin('查看碎片', () => {
      wx.navigateTo({ url: '/pages/profile-points/profile-points?tab=fragments' })
    })
  },
  goVoucher() {
    state.requireLogin('查看酒水券', () => {
      wx.navigateTo({ url: '/pages/profile-points/profile-points?tab=voucher' })
    })
  },
  goRecharge() {
    state.requireLogin('查看储值账户', () => {
      wx.navigateTo({ url: '/pages/recharge/recharge' })
    })
  },
  goOrders() {
    state.requireLogin('查看订单', () => {
      wx.navigateTo({ url: '/pages/profile-orders/profile-orders' })
    })
  },
  goFavorites() {
    state.requireLogin('查看收藏', () => {
      wx.navigateTo({ url: '/pages/profile-favorites/profile-favorites' })
    })
  },
  goCellar() {
    state.requireLogin('查看存酒', () => {
      wx.navigateTo({ url: '/pages/cellar/cellar' })
    })
  },
  goMerchant() {
    wx.navigateTo({ url: state.isMerchantLoggedIn() ? '/pages/merchant/merchant' : '/pages/merchant-login/merchant-login' })
  },
  goInfo() {
    state.requireLogin('查看个人资料', () => {
      wx.navigateTo({ url: '/pages/profile-info/profile-info' })
    })
  },
  goFaq() {
    wx.navigateTo({ url: '/pages/profile-faq/profile-faq' })
  },
  goAbout() {
    wx.navigateTo({ url: '/pages/profile-about/profile-about' })
  },
  goJoinUs() {
    wx.navigateTo({ url: '/pages/join-us/join-us' })
  },
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出当前账号？',
      confirmText: '确认退出',
      success: (res) => {
        if (!res.confirm) return
        state.logoutUser((ok) => {
          if (!ok) return
          wx.reLaunch({ url: '/pages/profile/profile?login=1' })
        })
      }
    })
  }
})
