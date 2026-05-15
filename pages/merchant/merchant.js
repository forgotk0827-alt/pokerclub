const state = require('../../utils/state')
const fallbackReminderAudio = '/assets/new-order.wav'

let speechPlugin = null
try {
  speechPlugin = requirePlugin('WechatSI')
} catch (error) {
  speechPlugin = null
}

const emptyMenuForm = {
  id: '',
  categoryIndex: 0,
  name: '',
  desc: '',
  price: '',
  points: '',
  unit: '份',
  image: '',
  sale: true
}

const emptyActivityForm = {
  id: '',
  title: '',
  type: '国际扑克',
  date: '',
  dayLabel: '今天',
  location: '',
  latitude: '',
  longitude: '',
  deadline: '',
  price: '',
  pointsPrice: '',
  quota: '',
  joined: '',
  status: 'open',
  productName: '',
  image: '/assets/activity-card.svg',
  detailImage: '/assets/activity-card.svg',
  environmentImage: '/assets/hero-bar.svg',
  resultImage: '/assets/activity-card.svg'
}

Page({
  data: {
    session: null,
    selectedStoreId: 'all',
    selectedStoreName: '全部门店',
    storeScopeOptions: [],
    tabs: ['订单', '菜单管理', '活动管理', '充值', '数据管理', '桌码', '轮播条', '精彩呈现', '加入我们', '通用设置', '门店管理', '积分', '基础', '库存', '排行'],
    activeTab: '订单',
    orderStatuses: ['全部', '待支付', '已确认', '已完成', '已取消'],
    activeStatus: '全部',
    orders: [],
    orderCount: 0,
    lastOrderIds: [],
    member: {},
    pointsMemberKey: '',
    pointsDelta: '',
    pointsReason: '',
    pointLogs: [],
    cellar: [],
    reservations: [],
    signups: [],
    categories: [],
    products: [],
    activities: [],
    activityForm: Object.assign({}, emptyActivityForm),
    menuCategoryName: '',
    menuForm: Object.assign({}, emptyMenuForm),
    rechargeSettings: state.getRechargeSettings(),
    rechargeRecords: [],
    rechargeForm: {
      memberKey: '',
      delta: '',
      note: ''
    },
    overview: {},
    allOrders: [],
    allMembers: [],
    allCellar: [],
    allSignups: [],
    globalSettings: state.getGlobalSettings(),
    stores: state.getStores(),
    tableQrcodes: [],
    tableQrcodeCount: 0,
    storeForm: {
      id: '',
      name: '',
      shortName: '',
      address: '',
      status: '营业中',
      phone: '',
      latitude: '',
      longitude: '',
      printerSn: '',
      printerName: '',
      printerCopies: '1'
    },
    inventory: [],
    rankTabs: state.leaderboardTabs,
    activeRankType: 'weekly',
    leaderboard: [],
    rankUsername: '',
    rankScore: '',
    lastReminderAt: 0
  },
  onShow() {
    state.requireMerchantLogin((session) => {
      const tabs = this.data.tabs.includes('活动管理') ? this.data.tabs : this.data.tabs.slice(0, 2).concat('活动管理', this.data.tabs.slice(2))
      this.setData({
        session,
        tabs,
        selectedStoreId: session.role === 'super_admin' ? 'all' : session.storeId
      }, () => {
        this.refreshStoreScopeOptions()
        this.refreshAll()
        this.startOrderListener()
      })
    })
  },
  onHide() {
    this.stopOrderListener()
  },
  onUnload() {
    this.stopOrderListener()
  },
  refreshAll() {
    this.refreshOrders(false)
    this.refreshProducts()
    this.refreshActivities()
    this.refreshRecharge()
    this.refreshDataManagement()
    this.refreshTableQrcodes()
    this.refreshGlobalSettings()
    this.refreshPoints()
    this.refreshBasics()
    this.refreshInventory()
    this.refreshLeaderboard()
  },
  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.tab })
  },
  isSuperAdmin() {
    const session = this.data.session || state.getMerchantSession()
    return !!(session && session.role === 'super_admin')
  },
  activeStoreId() {
    if (this.isSuperAdmin()) return this.data.selectedStoreId === 'all' ? '' : this.data.selectedStoreId
    const session = this.data.session || state.getMerchantSession()
    return session ? session.storeId : ''
  },
  filterByActiveStore(list) {
    const storeId = this.activeStoreId()
    if (!storeId) return list || []
    return (list || []).filter((item) => !item.storeId || item.storeId === storeId)
  },
  filterStores(stores) {
    const storeId = this.activeStoreId()
    if (!storeId) return stores || []
    return (stores || []).filter((item) => item.id === storeId)
  },
  refreshStoreScopeOptions() {
    const stores = state.getStores()
    const options = this.isSuperAdmin()
      ? [{ id: 'all', name: '全部门店' }].concat(stores.map((item) => ({ id: item.id, name: item.shortName || item.name })))
      : stores.filter((item) => item.id === this.data.session.storeId).map((item) => ({ id: item.id, name: item.shortName || item.name }))
    const selected = options.find((item) => item.id === this.data.selectedStoreId) || options[0] || { id: 'all', name: '全部门店' }
    this.setData({ storeScopeOptions: options, selectedStoreId: selected.id, selectedStoreName: selected.name })
  },
  selectStoreScope(event) {
    const index = Number(event.detail.value || 0)
    const option = this.data.storeScopeOptions[index] || this.data.storeScopeOptions[0]
    if (!option) return
    this.setData({ selectedStoreId: option.id, selectedStoreName: option.name, activeStatus: '全部' }, () => this.refreshAll())
  },
  selectStatus(event) {
    this.setData({ activeStatus: event.currentTarget.dataset.status }, () => this.refreshOrders(false))
  },
  refreshOrders(showNotice = true) {
    const session = this.data.session || state.getMerchantSession()
    if (!session) return
    const render = () => {
      const storeId = this.activeStoreId()
      const orders = state.getStoreOrders(storeId, this.data.activeStatus)
      const allOrders = state.getStoreOrders(storeId, '\u5168\u90e8')
      const allIds = allOrders.map((item) => item.id)
      const newOrders = allOrders.filter((item) => this.data.lastOrderIds.length && !this.data.lastOrderIds.includes(item.id))
      this.setData({
        orders,
        orderCount: allOrders.length,
        lastOrderIds: allIds
      })
      if (showNotice && newOrders.length) this.notifyNewOrders(newOrders)
    }
    state.fetchMerchantOrders(render)
  },
  notifyNewOrders(newOrders) {
    const settings = state.getGlobalSettings()
    const rule = String(settings.newOrderReminder || 'voice,vibrate,modal')
    if (rule.indexOf('off') > -1) return
    const now = Date.now()
    const minInterval = Math.max(0, Number(settings.reminderInterval || 0)) * 60 * 1000
    if (minInterval && this.data.lastReminderAt && now - this.data.lastReminderAt < minInterval) return
    this.setData({ lastReminderAt: now })
    const message = this.buildNewOrderMessage(newOrders, settings)
    if (rule.indexOf('vibrate') > -1 && wx.vibrateLong) wx.vibrateLong()
    if (rule.indexOf('voice') > -1) this.speakNewOrder(message, settings)
    const showVisualReminder = () => {
      if (rule.indexOf('modal') > -1) {
        wx.showModal({ title: '\u65b0\u8ba2\u5355\u63d0\u9192', content: message, showCancel: false })
      } else {
        wx.showToast({ title: '\u6536\u5230' + newOrders.length + '\u4e2a\u65b0\u8ba2\u5355', icon: 'none' })
      }
    }
    if (rule.indexOf('voice') > -1) {
      setTimeout(showVisualReminder, 800)
    } else {
      showVisualReminder()
    }
  },
  buildNewOrderMessage(newOrders, settings) {
    const template = String(settings.newOrderReminderText || '\u6536\u5230{count}\u4e2a\u65b0\u8ba2\u5355\uff0c\u8bf7\u53ca\u65f6\u5904\u7406')
    const first = newOrders[0] || {}
    return template
      .replace(/\{count\}/g, String(newOrders.length))
      .replace(/\{orderId\}/g, first.id || '')
      .replace(/\{amount\}/g, String(first.total || ''))
  },
  speakNewOrder(message, settings, options = {}) {
    const fallbackSrc = String(settings.newOrderVoiceUrl || fallbackReminderAudio)
    if (speechPlugin && speechPlugin.textToSpeech) {
      speechPlugin.textToSpeech({
        lang: 'zh_CN',
        tts: true,
        content: message,
        success: (res) => {
          const src = res && (res.filename || res.filePath || res.tempFilePath || res.path)
          this.playReminderAudio(src || fallbackSrc, Object.assign({}, options, { fallbackSrc }))
        },
        fail: () => {
          if (options.debug) wx.showToast({ title: '\u8bed\u97f3\u751f\u6210\u5931\u8d25\uff0c\u64ad\u653e\u63d0\u793a\u97f3', icon: 'none' })
          this.playReminderAudio(fallbackSrc, options)
        }
      })
      return
    }
    if (options.debug) wx.showToast({ title: '\u8bed\u97f3\u63d2\u4ef6\u4e0d\u53ef\u7528\uff0c\u64ad\u653e\u63d0\u793a\u97f3', icon: 'none' })
    this.playReminderAudio(fallbackSrc, options)
  },
  playReminderAudio(src, options = {}) {
    if (!src || !wx.createInnerAudioContext) {
      if (options.debug) wx.showToast({ title: '\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u97f3\u9891\u64ad\u653e', icon: 'none' })
      return false
    }
    if (this.reminderAudio) {
      this.reminderAudio.destroy()
      this.reminderAudio = null
    }
    const audio = wx.createInnerAudioContext()
    this.reminderAudio = audio
    audio.obeyMuteSwitch = false
    audio.volume = 1
    let started = false
    const play = () => {
      if (started) return
      started = true
      audio.play()
    }
    audio.onCanplay(play)
    audio.onEnded(() => {
      if (this.reminderAudio === audio) this.reminderAudio = null
      audio.destroy()
    })
    audio.onError(() => {
      if (this.reminderAudio === audio) this.reminderAudio = null
      audio.destroy()
      if (options.fallbackSrc && src !== options.fallbackSrc) {
        this.playReminderAudio(options.fallbackSrc, options)
        return
      }
      if (options.debug) wx.showToast({ title: '\u63d0\u9192\u97f3\u64ad\u653e\u5931\u8d25', icon: 'none' })
    })
    audio.src = src
    setTimeout(play, 300)
    return true
  },
  startOrderListener() {
    this.stopOrderListener()
    this.orderTimer = setInterval(() => {
      this.refreshOrders(true)
    }, 5000)
  },
  stopOrderListener() {
    if (this.orderTimer) {
      clearInterval(this.orderTimer)
      this.orderTimer = null
    }
  },
  confirmOrder(event) {
    const id = event.currentTarget.dataset.id
    const order = state.updateOrderStatus(id, '已确认')
    if (order) {
      state.printOrderBluetooth(order, (result) => {
        wx.showToast({ title: result.status === 'sent' ? '已确认并发送打印' : result.message || '已确认，打印失败', icon: 'none' })
        this.refreshOrders(false)
      })
    }
    this.refreshOrders(false)
  },
  cancelOrder(event) {
    state.updateOrderStatus(event.currentTarget.dataset.id, '已取消')
    this.refreshOrders(false)
    wx.showToast({ title: '已取消订单', icon: 'success' })
  },
  finishOrder(event) {
    state.updateOrderStatus(event.currentTarget.dataset.id, '已完成')
    this.refreshOrders(false)
    wx.showToast({ title: '已完成订单', icon: 'success' })
  },
  reprint(event) {
    const order = this.data.orders.find((item) => item.id === event.currentTarget.dataset.id)
    if (!order) return
    state.printOrderBluetooth(order, (result) => {
      wx.showToast({ title: result.message, icon: 'none' })
      this.refreshOrders(false)
    })
  },
  refreshPoints() {
    this.setData({
      member: state.getMember(),
      pointLogs: state.getPointLogs().slice(0, 8)
    })
    state.fetchPointLogs((logs) => {
      this.setData({ pointLogs: (logs || state.getPointLogs()).slice(0, 8) })
    })
  },
  inputPointsMemberKey(event) {
    this.setData({ pointsMemberKey: event.detail.value })
  },
  inputPointsDelta(event) {
    this.setData({ pointsDelta: event.detail.value })
  },
  inputPointsReason(event) {
    this.setData({ pointsReason: event.detail.value })
  },
  addPoints() {
    this.changePoints(1)
  },
  deductPoints() {
    this.changePoints(-1)
  },
  changePoints(sign) {
    const amount = Number(this.data.pointsDelta || 0)
    if (!amount || amount < 0) {
      wx.showToast({ title: '请输入积分数量', icon: 'none' })
      return
    }
    const memberKey = String(this.data.pointsMemberKey || '').trim()
    if (!memberKey) {
      wx.showToast({ title: '请填写会员ID或昵称', icon: 'none' })
      return
    }
    if (!String(this.data.pointsReason || '').trim()) {
      wx.showToast({ title: '请填写操作原因', icon: 'none' })
      return
    }
    state.adjustMemberPoints(memberKey, sign * amount, this.data.pointsReason, this.data.session.name, (payload) => {
      if (!payload) return
      this.setData({ pointsMemberKey: '', pointsDelta: '', pointsReason: '' })
      this.refreshPoints()
      this.refreshDataManagement()
      wx.showToast({ title: '积分已更新', icon: 'success' })
    })
  },
  refreshBasics() {
    const render = () => {
      const storeId = this.activeStoreId()
      this.setData({
        cellar: state.getStoreCellar(storeId),
        reservations: state.getBoardGameReservations(storeId),
        signups: storeId ? state.getStoreSignups(storeId) : state.getSignups()
      })
    }
    render()
    state.fetchMerchantBasics(render)
  },
  handleCellar(event) {
    const { id, status } = event.currentTarget.dataset
    state.updateCellarStatus(id, status, () => {
      this.refreshBasics()
      this.refreshDataManagement()
      wx.showToast({ title: '已处理', icon: 'success' })
    })
  },
  handleSignup(event) {
    const { id, status } = event.currentTarget.dataset
    state.updateSignupStatus(id, status, () => {
      this.refreshBasics()
      this.refreshDataManagement()
      wx.showToast({ title: '已更新报名', icon: 'success' })
    })
  },
  refreshInventory() {
    this.setData({ inventory: state.getInventory() })
    state.fetchInventory((items) => {
      this.setData({ inventory: items || state.getInventory() })
    })
  },
  changeStock(event) {
    const { id, delta } = event.currentTarget.dataset
    state.updateProductStock(id, Number(delta), (items) => {
      this.setData({ inventory: items || state.getInventory() })
    })
  },
  refreshProducts() {
    const render = (list) => {
    const storeId = this.activeStoreId()
    const sourceProducts = list || state.getProducts()
    const rawProducts = storeId
      ? sourceProducts.filter((item) => state.isProductVisibleInStore(item, storeId))
      : sourceProducts
    const categories = state.getProductCategories(rawProducts, { includeEmpty: true })
    const products = rawProducts.map((product) => {
      const category = categories.find((item) => item.id === product.categoryId)
      return Object.assign({}, product, {
        categoryName: product.categoryName || (category ? category.name : product.categoryId)
      })
    })
    const currentCategory = categories[this.data.menuForm.categoryIndex] || categories[0] || null
    this.setData({
      categories,
      products,
      menuCategoryName: currentCategory ? currentCategory.name : ''
    })
    }
    render()
    state.fetchMerchantProducts(render)
  },
  refreshActivities() {
    const render = (list) => this.setData({ activities: this.filterByActiveStore(list || state.getActivities()) })
    render()
    state.fetchMerchantActivities(render)
  },
  newActivity() {
    this.setData({ activityForm: Object.assign({}, emptyActivityForm) })
  },
  editActivity(event) {
    const activity = this.data.activities.find((item) => item.id === event.currentTarget.dataset.id)
    if (!activity) return
    this.setData({
      activityForm: Object.assign({}, emptyActivityForm, activity, {
        price: String(activity.price || 0),
        pointsPrice: String(activity.pointsPrice || 0),
        quota: String(activity.quota || 0),
        joined: String(activity.joined || 0),
        latitude: String(activity.latitude || ''),
        longitude: String(activity.longitude || '')
      })
    })
  },
  inputActivityField(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`activityForm.${field}`]: event.detail.value })
  },
  chooseActivityLocation() {
    if (!wx.chooseLocation) {
      wx.showToast({ title: '当前环境不支持地图选点', icon: 'none' })
      return
    }
    wx.chooseLocation({
      latitude: Number(this.data.activityForm.latitude || 0) || undefined,
      longitude: Number(this.data.activityForm.longitude || 0) || undefined,
      success: (res) => {
        this.setData({
          'activityForm.location': res.address || res.name,
          'activityForm.latitude': res.latitude,
          'activityForm.longitude': res.longitude
        })
      }
    })
  },
  chooseActivityImage(event) {
    const field = event.currentTarget.dataset.field
    const setImage = (path) => {
      state.uploadMerchantMedia(path, 'image', (url) => {
        if (url) this.setData({ [`activityForm.${field}`]: url })
      })
    }
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        success: (res) => {
          const file = res.tempFiles && res.tempFiles[0]
          if (file) setImage(file.tempFilePath)
        }
      })
      return
    }
    if (wx.chooseImage) {
      wx.chooseImage({
        count: 1,
        success: (res) => {
          if (res.tempFilePaths && res.tempFilePaths[0]) setImage(res.tempFilePaths[0])
        }
      })
    }
  },
  chooseProductImage() {
    const setImage = (path) => {
      state.uploadMerchantMedia(path, 'image', (url) => {
        if (url) this.setData({ 'menuForm.image': url })
      })
    }
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        success: (res) => {
          const file = res.tempFiles && res.tempFiles[0]
          if (file) setImage(file.tempFilePath)
        }
      })
      return
    }
    if (wx.chooseImage) {
      wx.chooseImage({
        count: 1,
        success: (res) => {
          if (res.tempFilePaths && res.tempFilePaths[0]) setImage(res.tempFilePaths[0])
        }
      })
    }
  },
  chooseGlobalVideo() {
    if (!wx.chooseMedia) {
      wx.showToast({ title: '当前环境不支持视频上传', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        state.uploadMerchantMedia(file.tempFilePath, 'video', (url) => {
          if (url) this.setData({ 'globalSettings.videoUrl': url })
        })
      }
    })
  },
  saveActivity() {
    const form = this.data.activityForm
    const title = String(form.title || '').trim()
    if (!title) {
      wx.showToast({ title: '请填写比赛名称', icon: 'none' })
      return
    }
    if (!String(form.date || '').trim()) {
      wx.showToast({ title: '请填写比赛时间', icon: 'none' })
      return
    }
    if (!String(form.location || '').trim()) {
      wx.showToast({ title: '请添加比赛地点', icon: 'none' })
      return
    }
    if (this.isSuperAdmin() && !this.activeStoreId()) {
      wx.showToast({ title: '请先选择活动所属门店', icon: 'none' })
      return
    }
    state.updateActivity({
      id: form.id,
      title,
      type: String(form.type || '国际扑克').trim(),
      date: String(form.date || '').trim(),
      dayLabel: String(form.dayLabel || '').trim(),
      location: String(form.location || '').trim(),
      latitude: Number(form.latitude || 0),
      longitude: Number(form.longitude || 0),
      deadline: String(form.deadline || '').trim(),
      price: Number(form.price || 0),
      pointsPrice: Number(form.pointsPrice || 0),
      quota: Number(form.quota || 0),
      joined: Number(form.joined || 0),
      status: String(form.status || 'open').trim(),
      productName: String(form.productName || title).trim(),
      image: form.image || '/assets/activity-card.svg',
      detailImage: form.detailImage || form.image || '/assets/activity-card.svg',
      environmentImage: form.environmentImage || '/assets/hero-bar.svg',
      resultImage: form.resultImage || '/assets/activity-card.svg',
      storeId: this.activeStoreId() || (this.data.session ? this.data.session.storeId : '')
    })
    this.newActivity()
    this.refreshActivities()
    wx.showToast({ title: '活动已保存', icon: 'success' })
  },
  refreshRecharge() {
    this.setData({
      rechargeSettings: state.getRechargeSettings(),
      rechargeRecords: state.getRechargeRecords()
    })
    state.fetchRechargeSettings((settings) => {
      if (settings) this.setData({ rechargeSettings: settings })
    })
    state.fetchRechargeRecords((records) => {
      this.setData({ rechargeRecords: records || state.getRechargeRecords() })
    })
  },
  refreshDataManagement() {
    state.fetchMerchantStores((stores) => {
      this.setData({ stores: this.filterStores(stores) })
      this.refreshStoreScopeOptions()
    })
    const render = () => {
      const orders = this.filterByActiveStore(state.getOrders())
      const cellar = this.filterByActiveStore(state.getCellar())
      const signups = this.filterByActiveStore(state.getSignups())
      const rechargeRecords = this.filterByActiveStore(state.getRechargeRecords())
      this.setData({
        overview: {
          storeCount: this.filterStores(state.getStores()).length,
          orderCount: orders.length,
          memberCount: state.getMemberList().length,
          cellarCount: cellar.length,
          signupCount: signups.length,
          totalSales: orders.reduce((sum, order) => sum + Number(order.total || 0), 0),
          totalRecharge: rechargeRecords.reduce((sum, record) => sum + Number(record.creditAmount || 0), 0)
        },
        stores: this.filterStores(state.getStores()),
        allOrders: orders,
        allMembers: state.getMemberList(),
        allCellar: cellar,
        allSignups: signups
      })
    }
    render()
    state.fetchMerchantOrders(() => {
      state.fetchMerchantBasics(() => {
        render()
      })
    })
    state.fetchDataOverview((overview) => {
      if (overview) this.setData({ overview })
    })
  },
  refreshTableQrcodes() {
    state.fetchTableQrcodes((items) => {
      const storeId = this.activeStoreId()
      const list = storeId ? items.filter((item) => item.storeId === storeId) : items
      this.setData({
        tableQrcodes: list,
        tableQrcodeCount: list.filter((item) => item.exists).length
      })
    })
  },
  generateTableQrcodes() {
    wx.showLoading({ title: '生成中' })
    state.generateTableQrcodes((payload) => {
      wx.hideLoading()
      if (!payload) return
      this.refreshTableQrcodes()
      wx.showToast({ title: '桌码已生成', icon: 'success' })
    })
  },
  refreshGlobalSettings() {
    this.setData({ globalSettings: state.getGlobalSettings() })
  },
  editProduct(event) {
    const product = this.data.products.find((item) => item.id === event.currentTarget.dataset.id)
    if (!product) return
    const categoryIndex = Math.max(0, this.data.categories.findIndex((item) => item.id === product.categoryId))
    this.setData({
      menuForm: {
        id: product.id,
        categoryIndex,
        name: product.name,
        desc: product.desc,
        price: String(product.price),
        points: String(product.points || 0),
        unit: product.unit,
        image: product.image || '',
        sale: !!product.sale
      },
      menuCategoryName: this.data.categories[categoryIndex] ? this.data.categories[categoryIndex].name : this.data.categories[0].name
    })
  },
  newProduct() {
    this.setData({
      menuForm: Object.assign({}, emptyMenuForm),
      menuCategoryName: this.data.categories[0] ? this.data.categories[0].name : ''
    })
  },
  inputMenuField(event) {
    const field = event.currentTarget.dataset.field
    const value = event.detail.value
    this.setData({ [`menuForm.${field}`]: value })
  },
  selectMenuCategory(event) {
    const categoryIndex = Number(event.detail.value || 0)
    this.setData({
      'menuForm.categoryIndex': categoryIndex,
      menuCategoryName: this.data.categories[categoryIndex] ? this.data.categories[categoryIndex].name : (this.data.categories[0] ? this.data.categories[0].name : '')
    })
  },
  toggleMenuSale(event) {
    this.setData({ 'menuForm.sale': event.detail.value })
  },
  saveProduct() {
    const form = this.data.menuForm
    const name = String(form.name || '').trim()
    const price = Number(form.price || 0)
    if (!name) {
      wx.showToast({ title: '请输入餐品名称', icon: 'none' })
      return
    }
    if (!price || price < 0) {
      wx.showToast({ title: '请输入餐品价格', icon: 'none' })
      return
    }
    const category = this.data.categories[form.categoryIndex] || this.data.categories[0]
    if (!category) {
      wx.showToast({ title: '暂无可用分类', icon: 'none' })
      return
    }
    const storeId = this.activeStoreId()
    if (this.isSuperAdmin() && !storeId) {
      wx.showToast({ title: '请先选择菜品所属门店', icon: 'none' })
      return
    }
    state.updateProduct({
      id: form.id,
      categoryId: category.id,
      name,
      desc: form.desc,
      price,
      points: Number(form.points || 0),
      unit: form.unit || '份',
      sale: form.sale,
      image: form.image || this.imageByCategory(category.id),
      storeId
    })
    this.newProduct()
    this.refreshProducts()
    this.refreshInventory()
    wx.showToast({ title: '菜单已保存', icon: 'success' })
  },
  inputRechargeSetting(event) {
    const field = event.currentTarget.dataset.field
    const value = event.detail.value
    this.setData({ [`rechargeSettings.${field}`]: value })
  },
  inputRechargePackage(event) {
    const index = Number(event.currentTarget.dataset.index)
    const field = event.currentTarget.dataset.field
    const value = event.detail.value
    const packages = (this.data.rechargeSettings.packages || []).map((item, i) => {
      if (i !== index) return item
      return Object.assign({}, item, {
        [field]: field === 'payAmount' || field === 'creditAmount' ? Number(value || 0) : value
      })
    })
    this.setData({ 'rechargeSettings.packages': packages })
  },
  addRechargePackage() {
    const packages = (this.data.rechargeSettings.packages || []).concat({
      id: `pkg-${Date.now()}`,
      payAmount: 0,
      creditAmount: 0,
      label: '新套餐',
      subLabel: '',
      tip: ''
    })
    this.setData({ 'rechargeSettings.packages': packages })
  },
  removeRechargePackage(event) {
    const index = Number(event.currentTarget.dataset.index)
    const packages = (this.data.rechargeSettings.packages || []).filter((_, i) => i !== index)
    this.setData({ 'rechargeSettings.packages': packages })
  },
  saveRechargeSettings() {
    const settings = this.data.rechargeSettings
    if (!settings.packages || !settings.packages.length) {
      wx.showToast({ title: '请至少保留一个套餐', icon: 'none' })
      return
    }
    const packages = settings.packages
      .map((item, index) =>
        Object.assign({}, item, {
          id: item.id || `pkg-${index + 1}`,
          payAmount: Number(item.payAmount || 0),
          creditAmount: Number(item.creditAmount || 0),
          label: String(item.label || '').trim() || `套餐${index + 1}`,
          subLabel: String(item.subLabel || '').trim(),
          tip: String(item.tip || '').trim()
        })
      )
      .filter((item) => item.payAmount > 0 && item.creditAmount > 0)
    if (!packages.length) {
      wx.showToast({ title: '套餐金额不能为空', icon: 'none' })
      return
    }
    const next = state.saveRechargeSettings(
      Object.assign({}, settings, {
        packages
      }),
      (saved) => {
        if (!saved) return
        this.setData({ rechargeSettings: saved })
        wx.showToast({ title: '充值设置已保存', icon: 'success' })
      }
    )
    this.setData({ rechargeSettings: next })
  },
  inputRechargeForm(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`rechargeForm.${field}`]: event.detail.value })
  },
  adjustRechargeBalance() {
    const key = String(this.data.rechargeForm.memberKey || '').trim()
    const delta = Number(this.data.rechargeForm.delta || 0)
    const note = String(this.data.rechargeForm.note || '').trim()
    if (!key) {
      wx.showToast({ title: '请填写会员ID或昵称', icon: 'none' })
      return
    }
    if (!delta) {
      wx.showToast({ title: '请输入调整金额', icon: 'none' })
      return
    }
    state.adjustMemberBalance(key, delta, {
      operator: this.data.session.name,
      note: note || '手动调整余额',
      storeId: this.activeStoreId()
    }, (payload) => {
      if (!payload) return
      this.setData({
        rechargeForm: { memberKey: '', delta: '', note: '' }
      })
      this.refreshRecharge()
      this.refreshPoints()
      this.refreshDataManagement()
      wx.showToast({ title: '余额已调整', icon: 'success' })
    })
  },
  exportStats() {
    state.fetchDataExport((content) => {
      const text = content || state.exportDataSummary()
      if (wx.setClipboardData) {
        wx.setClipboardData({
          data: text,
          success: () => wx.showToast({ title: '统计已复制', icon: 'success' })
        })
        return
      }
      wx.showModal({ title: '统计导出', content: text, showCancel: false })
    })
  },
  inputGlobalSetting(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`globalSettings.${field}`]: event.detail.value })
  },
  saveGlobalSettings() {
    const next = state.saveGlobalSettings({
      videoTitle: this.data.globalSettings.videoTitle,
      videoUrl: this.data.globalSettings.videoUrl,
      printTemplate: this.data.globalSettings.printTemplate,
      leaderboardRule: this.data.globalSettings.leaderboardRule,
      newOrderReminder: this.data.globalSettings.newOrderReminder,
      newOrderReminderText: this.data.globalSettings.newOrderReminderText,
      newOrderVoiceUrl: this.data.globalSettings.newOrderVoiceUrl,
      reminderInterval: Number(this.data.globalSettings.reminderInterval || 5),
      homeNotice: this.data.globalSettings.homeNotice,
      showcaseText: this.data.globalSettings.showcaseText,
      joinUsTitle: this.data.globalSettings.joinUsTitle,
      joinUsText: this.data.globalSettings.joinUsText,
      joinUsImage: this.data.globalSettings.joinUsImage
    })
    this.setData({ globalSettings: next })
    wx.showToast({ title: '通用设置已保存', icon: 'success' })
  },
  saveNoticeSettings() {
    const next = state.saveGlobalSettings({
      homeNotice: this.data.globalSettings.homeNotice
    })
    this.setData({ globalSettings: next })
    wx.showToast({ title: '\u8f6e\u64ad\u6761\u5df2\u53d1\u5e03', icon: 'success' })
  },
  saveShowcaseSettings() {
    const next = state.saveGlobalSettings({
      videoTitle: this.data.globalSettings.videoTitle,
      videoUrl: this.data.globalSettings.videoUrl,
      showcaseText: this.data.globalSettings.showcaseText
    })
    this.setData({ globalSettings: next })
    wx.showToast({ title: '\u7cbe\u5f69\u5448\u73b0\u5df2\u53d1\u5e03', icon: 'success' })
  },
  saveJoinUsSettings() {
    const next = state.saveGlobalSettings({
      joinUsTitle: this.data.globalSettings.joinUsTitle,
      joinUsText: this.data.globalSettings.joinUsText,
      joinUsImage: this.data.globalSettings.joinUsImage
    })
    this.setData({ globalSettings: next })
    wx.showToast({ title: '\u52a0\u5165\u6211\u4eec\u5df2\u53d1\u5e03', icon: 'success' })
  },
  chooseJoinUsImage() {
    const setImage = (path) => {
      state.uploadMerchantMedia(path, 'image', (url) => {
        if (url) this.setData({ 'globalSettings.joinUsImage': url })
      })
    }
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        success: (res) => {
          const file = res.tempFiles && res.tempFiles[0]
          if (file) setImage(file.tempFilePath)
        }
      })
      return
    }
    if (wx.chooseImage) {
      wx.chooseImage({
        count: 1,
        success: (res) => {
          if (res.tempFilePaths && res.tempFilePaths[0]) setImage(res.tempFilePaths[0])
        }
      })
    }
  },
  testNewOrderReminder() {
    const settings = state.getGlobalSettings()
    if (String(settings.newOrderReminder || '').indexOf('off') > -1) {
      wx.showToast({ title: '\u65b0\u8ba2\u5355\u63d0\u9192\u5df2\u5173\u95ed', icon: 'none' })
      return
    }
    this.setData({ lastReminderAt: 0 })
    const message = this.buildNewOrderMessage([{ id: `TEST${Date.now()}`, total: 0, status: '\u6d4b\u8bd5\u8ba2\u5355' }], settings)
    if (String(settings.newOrderReminder || '').indexOf('vibrate') > -1 && wx.vibrateLong) wx.vibrateLong()
    this.speakNewOrder(message, settings, { debug: true })
    wx.showToast({ title: '\u5df2\u53d1\u8d77\u8bed\u97f3\u6d4b\u8bd5', icon: 'none' })
  },
  editStore(event) {
    const store = this.data.stores.find((item) => item.id === event.currentTarget.dataset.id)
    if (!store) return
    this.setData({
      storeForm: Object.assign(
        {
          id: '',
          name: '',
          shortName: '',
          address: '',
          status: '营业中',
          phone: '',
          latitude: '',
          longitude: '',
          printerSn: '',
          printerName: '',
          printerCopies: '1'
        },
        store
      )
    })
  },
  newStore() {
    this.setData({
      storeForm: {
        id: '',
        name: '',
        shortName: '',
        address: '',
        status: '营业中',
        phone: '',
        latitude: '',
        longitude: '',
        printerSn: '',
        printerName: '',
        printerCopies: '1'
      }
    })
  },
  inputStoreField(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`storeForm.${field}`]: event.detail.value })
  },
  chooseStoreLocation() {
    if (!wx.chooseLocation) {
      wx.showToast({ title: '当前环境不支持地图选点', icon: 'none' })
      return
    }
    wx.chooseLocation({
      latitude: Number(this.data.storeForm.latitude || 0) || undefined,
      longitude: Number(this.data.storeForm.longitude || 0) || undefined,
      success: (res) => {
        this.setData({
          'storeForm.name': this.data.storeForm.name || res.name,
          'storeForm.address': res.address || res.name,
          'storeForm.latitude': res.latitude,
          'storeForm.longitude': res.longitude
        })
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') > -1) {
          return
        }
        wx.showToast({ title: '地图选点失败', icon: 'none' })
      }
    })
  },
  saveStore() {
    const form = this.data.storeForm
    if (!String(form.name || '').trim() || !String(form.shortName || '').trim()) {
      wx.showToast({ title: '请填写门店名称', icon: 'none' })
      return
    }
    const stores = state.updateStore(form, (serverStore) => {
      if (!serverStore) {
        state.fetchMerchantStores((latestStores) => {
          this.setData({ stores: this.filterStores(latestStores) })
        })
        return
      }
      this.setData({ stores: this.filterStores(state.getStores()) })
      this.newStore()
      this.refreshDataManagement()
      wx.showToast({ title: '门店已保存并同步', icon: 'success' })
    })
    this.setData({ stores: this.filterStores(stores) })
  },
  imageByCategory(categoryId) {
    if (categoryId === 'dishes') return '/assets/product-dish.svg'
    if (categoryId === 'packages') return '/assets/product-pack.svg'
    if (categoryId === 'special' || categoryId === 'ktv') return '/assets/product-special.svg'
    return '/assets/product-drink.svg'
  },
  refreshLeaderboard() {
    const type = this.data.activeRankType || 'weekly'
    this.setData({ leaderboard: state.getLeaderboard(type) })
    state.fetchLeaderboard((list) => {
      this.setData({ leaderboard: list || state.getLeaderboard(type) })
    }, type)
  },
  selectRankType(event) {
    const type = event.currentTarget.dataset.type || 'weekly'
    this.setData({ activeRankType: type, leaderboard: state.getLeaderboard(type) })
    this.refreshLeaderboard()
  },
  inputRankUsername(event) {
    this.setData({ rankUsername: event.detail.value })
  },
  inputRankScore(event) {
    this.setData({ rankScore: event.detail.value })
  },
  addRankUser() {
    const username = String(this.data.rankUsername || '').trim()
    const scoreText = String(this.data.rankScore || '').trim()
    const score = Number(scoreText)
    if (!username || !scoreText || Number.isNaN(score)) {
      wx.showToast({ title: '请填写用户名和分数', icon: 'none' })
      return
    }
    state.addLeaderboardUser({ username, score }, () => {
      this.setData({ rankUsername: '', rankScore: '' })
      this.refreshLeaderboard()
    }, this.data.activeRankType || 'weekly')
  },
  moveRank(event) {
    const { id, direction } = event.currentTarget.dataset
    state.updateLeaderboardRank(id, direction, () => {
      this.refreshLeaderboard()
    }, this.data.activeRankType || 'weekly')
  },
  logout() {
    state.merchantLogout()
    wx.redirectTo({ url: '/pages/merchant-login/merchant-login' })
  }
})
