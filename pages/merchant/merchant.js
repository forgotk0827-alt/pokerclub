const state = require('../../utils/state')
const config = require('../../utils/config')
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
  storeId: '',
  title: '',
  type: '国际扑克',
  date: '',
  dateDate: '',
  dateTime: '',
  dayLabel: '今天',
  location: '',
  latitude: '',
  longitude: '',
  deadline: '',
  deadlineDate: '',
  deadlineTime: '',
  price: '',
  pointsPrice: '',
  quota: '',
  joined: '',
  remainingQuota: '',
  status: 'open',
  productName: '',
  image: '/assets/activity-card.svg',
  detailImage: '/assets/activity-card.svg',
  environmentImage: '/assets/hero-bar.svg',
  resultImage: '/assets/activity-card.svg'
}

function swapSortOrder(list, id, direction) {
  const items = (list || []).map((item, index) => Object.assign({}, item, {
    sortOrder: Number(item.sortOrder || index + 1)
  }))
  const index = items.findIndex((item) => item.id === id)
  const target = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || target < 0 || target >= items.length) return null
  const current = Object.assign({}, items[index])
  const swapped = Object.assign({}, items[target])
  const currentOrder = current.sortOrder
  current.sortOrder = swapped.sortOrder
  swapped.sortOrder = currentOrder
  return { current, swapped }
}
Page({
  data: {
    session: null,
    selectedStoreId: 'all',
    selectedStoreName: '全部门店',
    storeScopeOptions: [],
    tabs: ['订单', '菜单管理', '活动管理', '充值', '数据管理', '会员管理', '桌码', '轮播条', '精彩呈现', '加入我们', '通用设置', '门店管理', '基础', '库存', '排行'],
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
    activityStoreOptions: [],
    activityStoreIndex: 0,
    activityForm: Object.assign({}, emptyActivityForm),
    menuCategoryName: '',
    menuCategoryDraft: '',
    menuSortDirty: false,
    menuSortSaving: false,
    menuForm: Object.assign({}, emptyMenuForm),
    rechargeSettings: state.getRechargeSettings(),
    voucherSettings: state.getVoucherSettings(),
    rechargeRecords: [],
    voucherForm: {
      memberKey: '',
      count: '',
      note: ''
    },
    rechargeForm: {
      memberKey: '',
      delta: '',
      note: ''
    },
    overview: {},
    allOrders: [],
    allMembers: [],
    filteredMembers: [],
    memberSearchKeyword: '',
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
    memberDetailVisible: false,
    selectedMember: {
      orders: [],
      signups: [],
      cellar: [],
      logs: [],
      rechargeRecords: [],
      voucherLogs: []
    },
    rankTabs: state.leaderboardTabs,
    activeRankType: 'weekly',
    leaderboard: [],
    selectedRankUser: null,
    rankUsername: '',
    rankScore: '',
    rankDeltaScore: '',
    lastReminderAt: 0,
    memberPickerVisible: false,
    memberPickerTitle: '选择会员',
    memberPickerHint: '先确认会员身份，再执行操作',
    memberPickerCandidates: [],
    memberPickerSelectedId: '',
    memberPickerSelectedMember: null,
    memberPickerSelectedName: '',
    memberPickerConfirmText: '确认执行'
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
  merchantApi(path, method, data, callback) {
    const base = String(config.apiBaseUrl || '').replace(/\/+$/, '')
    const session = this.data.session || state.getMerchantSession()
    if (!base || !session || !session.token) {
      if (callback) callback(null)
      return false
    }
    wx.request({
      url: `${base}${path}`,
      method,
      timeout: 15000,
      header: {
        'content-type': 'application/json',
        Authorization: `Bearer ${session.token}`
      },
      data: data || {},
      success(res) {
        const body = res.data || {}
        const payload = body.data || body
        if (res.statusCode < 200 || res.statusCode >= 300 || body.ok === false) {
          wx.showToast({ title: body.message || payload.message || '商家接口请求失败', icon: 'none' })
          if (callback) callback(null)
          return
        }
        if (callback) callback(payload)
      },
      fail() {
        wx.showToast({ title: '商家接口请求失败', icon: 'none' })
        if (callback) callback(null)
      }
    })
    return true
  },
  saveSortPair(path, first, second, callback) {
    this.merchantApi(path, 'POST', first, (savedFirst) => {
      if (!savedFirst) {
        if (callback) callback(false)
        return
      }
      this.merchantApi(path, 'POST', second, (savedSecond) => {
        if (callback) callback(!!savedSecond)
      })
    })
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
    }, () => this.syncSelectedMemberDetail())
    state.fetchPointLogs((logs) => {
      this.setData({ pointLogs: (logs || state.getPointLogs()).slice(0, 8) }, () => this.syncSelectedMemberDetail())
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
      wx.showToast({ title: '请填写会员ID', icon: 'none' })
      return
    }
    this.openMemberPicker({
      memberKey,
      title: '选择会员',
      hint: '请先核对会员ID和昵称，再确认积分调整',
      confirmText: '确认调整',
      action: (member) => {
        state.adjustMemberPoints(member.id, sign * amount, String(this.data.pointsReason || '').trim(), this.data.session.name, (payload) => {
          if (!payload) return
          this.setData({ pointsMemberKey: '', pointsDelta: '', pointsReason: '' })
          this.refreshPoints()
          this.refreshDataManagement()
          wx.showToast({ title: '积分已更新', icon: 'success' })
        })
      }
    })
  },
  addMemberPoints() {
    this.changePoints(1)
  },
  deductMemberPoints() {
    this.changePoints(-1)
  },
  changePieces(sign) {
    const amount = Number(this.data.pointsDelta || 0)
    if (!amount || amount < 0) {
      wx.showToast({ title: '请输入碎片数量', icon: 'none' })
      return
    }
    const memberKey = String(this.data.pointsMemberKey || '').trim()
    if (!memberKey) {
      wx.showToast({ title: '请填写会员ID', icon: 'none' })
      return
    }
    this.openMemberPicker({
      memberKey,
      title: '选择会员',
      hint: '请先核对会员ID和昵称，再确认碎片调整',
      confirmText: '确认调整',
      action: (member) => {
        state.adjustMemberPieces(member.id, sign * amount, String(this.data.pointsReason || '').trim(), this.data.session.name, (payload) => {
          if (!payload) return
          this.setData({ pointsMemberKey: '', pointsDelta: '', pointsReason: '' })
          this.refreshPoints()
          this.refreshDataManagement()
          wx.showToast({ title: '碎片已更新', icon: 'success' })
        })
      }
    })
  },
  addMemberPieces() {
    this.changePieces(1)
  },
  deductMemberPieces() {
    this.changePieces(-1)
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
    const render = (items) => {
      const list = (items || state.getInventory()).map((item) => Object.assign({}, item, { draftStock: String(item.stock || 0) }))
      this.setData({ inventory: list })
    }
    render()
    state.fetchInventory((items) => {
      render(items || state.getInventory())
    })
  },
  inputStock(event) {
    const id = event.currentTarget.dataset.id
    const value = event.detail.value
    const inventory = this.data.inventory.map((item) => (item.id === id ? Object.assign({}, item, { draftStock: value }) : item))
    this.setData({ inventory })
  },
  saveStock(event) {
    const id = event.currentTarget.dataset.id
    const item = this.data.inventory.find((entry) => entry.id === id)
    if (!item) return
    const nextStock = Number(item.draftStock)
    if (Number.isNaN(nextStock) || nextStock < 0) {
      wx.showToast({ title: '请输入正确库存数量', icon: 'none' })
      return
    }
    const delta = nextStock - Number(item.stock || 0)
    state.updateProductStock(id, delta, (items) => {
      this.setData({
        inventory: (items || state.getInventory()).map((entry) => Object.assign({}, entry, { draftStock: String(entry.stock || 0) }))
      })
      wx.showToast({ title: '库存已保存', icon: 'success' })
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
      const categories = state.getProductCategories(rawProducts, { includeEmpty: true, storeId })
      const categoryIndex = new Map(categories.map((item, index) => [item.id, index]))
      const products = rawProducts.map((product) => {
        const category = categories.find((item) => item.id === product.categoryId)
        return Object.assign({}, product, {
          categoryName: product.categoryName || (category ? category.name : product.categoryId)
        })
      }).sort((left, right) => {
        const leftCategory = categoryIndex.has(left.categoryId) ? categoryIndex.get(left.categoryId) : 9999
        const rightCategory = categoryIndex.has(right.categoryId) ? categoryIndex.get(right.categoryId) : 9999
        if (leftCategory !== rightCategory) return leftCategory - rightCategory
        return String(left.name || '').localeCompare(String(right.name || ''))
      })
      const currentCategory = categories[this.data.menuForm.categoryIndex] || categories[0] || null
      this.setData({
        categories,
        products,
        menuCategoryName: currentCategory ? currentCategory.name : '',
        menuSortDirty: false
      })
    }
    state.fetchMerchantCategories(() => {
      state.fetchMerchantProducts((list) => render(list || []))
    })
  },
  refreshActivities() {
    const stores = state.getStores().map((item) => ({
      id: item.id,
      name: item.shortName || item.name
    }))
    const render = (list) => this.setData({
      activityStoreOptions: stores,
      activityStoreIndex: this.getActivityStoreIndex(this.data.activityForm.storeId, stores),
      activities: this.filterByActiveStore(list || state.getActivities())
    })
    render()
    state.fetchMerchantActivities(render)
  },
  getActivityStoreIndex(storeId, options = this.data.activityStoreOptions) {
    const scopedId = String(storeId || '').trim()
    const index = (options || []).findIndex((item) => item.id === scopedId)
    return index > -1 ? index : 0
  },
  getDefaultActivityStoreId() {
    const options = this.data.activityStoreOptions.length ? this.data.activityStoreOptions : state.getStores().map((item) => ({
      id: item.id,
      name: item.shortName || item.name
    }))
    const scoped = this.activeStoreId()
    if (scoped && scoped !== 'all' && options.some((item) => item.id === scoped)) return scoped
    return (options[0] && options[0].id) || ''
  },
  newActivity() {
    const storeId = this.getDefaultActivityStoreId()
    const store = state.getStores().find((item) => item.id === storeId)
    this.setData({
      activityForm: Object.assign({}, emptyActivityForm, {
        storeId,
        location: store ? (store.address || store.shortName || store.name || '') : ''
      }),
      activityStoreIndex: this.getActivityStoreIndex(storeId)
    })
  },
  editActivity(event) {
    const activity = this.data.activities.find((item) => item.id === event.currentTarget.dataset.id)
    if (!activity) return
    const date = this.splitDateTime(activity.date || activity.dateTime || '')
    const deadline = this.splitDateTime(activity.deadlineAt || activity.deadline || '')
    this.setData({
      activityForm: Object.assign({}, emptyActivityForm, activity, {
        storeId: activity.storeId || this.getDefaultActivityStoreId(),
        price: String(activity.price || 0),
        pointsPrice: String(activity.pointsPrice || 0),
        quota: String(activity.quota || 0),
        joined: String(activity.joined || 0),
        remainingQuota: String(Math.max(0, Number(activity.quota || 0) - Number(activity.joined || 0))),
        latitude: String(activity.latitude || ''),
        longitude: String(activity.longitude || ''),
        dateDate: date.dateDate,
        dateTime: date.dateTime,
        deadlineDate: deadline.dateDate,
        deadlineTime: deadline.dateTime
      }),
      activityStoreIndex: this.getActivityStoreIndex(activity.storeId || this.getDefaultActivityStoreId())
    })
  },
  duplicateActivity(event) {
    const activity = this.data.activities.find((item) => item.id === event.currentTarget.dataset.id)
    if (!activity) return
    const date = this.splitDateTime(activity.date || activity.dateTime || '')
    const deadline = this.splitDateTime(activity.deadlineAt || activity.deadline || '')
    this.setData({
      activityForm: Object.assign({}, emptyActivityForm, activity, {
        id: '',
        storeId: activity.storeId || this.getDefaultActivityStoreId(),
        price: String(activity.price || 0),
        pointsPrice: String(activity.pointsPrice || 0),
        quota: String(activity.quota || 0),
        joined: '0',
        remainingQuota: String(Math.max(0, Number(activity.quota || 0) - Number(activity.joined || 0))),
        latitude: String(activity.latitude || ''),
        longitude: String(activity.longitude || ''),
        dateDate: date.dateDate,
        dateTime: date.dateTime,
        deadlineDate: deadline.dateDate,
        deadlineTime: deadline.dateTime
      }),
      activityStoreIndex: this.getActivityStoreIndex(activity.storeId || this.getDefaultActivityStoreId())
    })
  },
  deleteActivity(event) {
    const id = event.currentTarget.dataset.id
    const activity = this.data.activities.find((item) => item.id === id)
    if (!activity) return
    wx.showModal({
      title: '删除活动',
      content: `确认删除 ${activity.title} ?`,
      success: (res) => {
        if (!res.confirm) return
        state.deleteActivity(id, (list, synced) => {
          if (!synced) {
            wx.showToast({ title: '活动删除失败', icon: 'none' })
            return
          }
          if (this.data.activityForm.id === id) this.newActivity()
          this.refreshActivities()
          wx.showToast({ title: '活动已删除', icon: 'success' })
        })
      }
    })
  },
  inputActivityField(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`activityForm.${field}`]: event.detail.value })
  },
  selectActivityStore(event) {
    const index = Number(event.detail.value || 0)
    const option = this.data.activityStoreOptions[index] || this.data.activityStoreOptions[0]
    if (!option) return
    const store = state.getStores().find((item) => item.id === option.id) || {}
    this.setData({
      activityStoreIndex: index,
      'activityForm.storeId': option.id,
      'activityForm.location': store.address || store.shortName || store.name || '',
      'activityForm.latitude': String(store.latitude || ''),
      'activityForm.longitude': String(store.longitude || '')
    })
  },
  selectActivityDateTime(event) {
    const prefix = event.currentTarget.dataset.prefix
    const part = event.currentTarget.dataset.part
    const value = event.detail.value
    const dateField = `${prefix}Date`
    const timeField = `${prefix}Time`
    const nextDate = part === 'date' ? value : this.data.activityForm[dateField]
    const nextTime = part === 'time' ? value : this.data.activityForm[timeField]
    this.setData({
      [`activityForm.${dateField}`]: nextDate,
      [`activityForm.${timeField}`]: nextTime,
      [`activityForm.${prefix}`]: this.composeDateTime(nextDate, nextTime)
    })
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
    const storeId = String(form.storeId || '').trim()
    const store = state.getStores().find((item) => item.id === storeId)
    if (!store) {
      wx.showToast({ title: '请选择比赛门店', icon: 'none' })
      return
    }
    const date = this.composeDateTime(form.dateDate || '', form.dateTime || '') || String(form.date || '').trim()
    const deadline = this.composeDateTime(form.deadlineDate || '', form.deadlineTime || '') || String(form.deadline || '').trim()
    if (!date) {
      wx.showToast({ title: '请填写比赛时间', icon: 'none' })
      return
    }
    const joined = Number(form.joined || 0)
    const remainingQuotaText = String(form.remainingQuota || '').trim()
    const remainingQuota = remainingQuotaText === '' ? null : Number(remainingQuotaText)
    const quota = remainingQuota === null || Number.isNaN(remainingQuota) ? Number(form.quota || 0) : joined + remainingQuota
    state.updateActivity({
      id: form.id,
      title,
      type: String(form.type || '国际扑克').trim(),
      date,
      dayLabel: String(form.dayLabel || '').trim(),
      storeId,
      storeName: store.shortName || store.name || '',
      location: String(form.location || store.address || store.shortName || store.name || '').trim(),
      latitude: Number(form.latitude || 0),
      longitude: Number(form.longitude || 0),
      deadline,
      price: Number(form.price || 0),
      pointsPrice: Number(form.pointsPrice || 0),
      quota,
      joined,
      status: String(form.status || 'open').trim(),
      productName: String(form.productName || title).trim(),
      image: form.image || '/assets/activity-card.svg',
      detailImage: form.detailImage || form.image || '/assets/activity-card.svg',
      environmentImage: form.environmentImage || '/assets/hero-bar.svg',
      resultImage: form.resultImage || '/assets/activity-card.svg',
      storeId
    })
    this.newActivity()
    this.refreshActivities()
    wx.showToast({ title: '活动已保存', icon: 'success' })
  },
  refreshRecharge() {
    this.setData({
      rechargeSettings: state.getRechargeSettings(),
      voucherSettings: state.getVoucherSettings(),
      rechargeRecords: state.getRechargeRecords()
    })
    state.fetchRechargeSettings((settings) => {
      if (settings) this.setData({ rechargeSettings: settings })
    })
    state.fetchVoucherSettings((settings) => {
      if (settings) this.setData({ voucherSettings: settings })
    })
    state.fetchRechargeRecords((records) => {
      this.setData({ rechargeRecords: records || state.getRechargeRecords() })
    })
  },
  getMemberCandidates(memberKey) {
    const keyword = String(memberKey || '').trim().toLowerCase()
    if (!keyword) return []
    const digits = keyword.replace(/\D/g, '')
    const list = (this.data.allMembers && this.data.allMembers.length ? this.data.allMembers : state.getMemberList()).filter((item) => {
      const id = String(item.id || '').trim().toLowerCase()
      const phoneDigits = String(item.phone || '').replace(/\D/g, '')
      const idDigits = String(item.id || '').replace(/\D/g, '')
      if (id === keyword) return true
      if (digits && (idDigits === digits || String(item.id || '').trim().replace(/^会员/, '') === digits || phoneDigits.slice(-digits.length) === digits)) return true
      return false
    })
    return list.sort((a, b) => String(a.nickname || '').localeCompare(String(b.nickname || '')))
  },
  openMemberPicker(options = {}) {
    const memberKey = String(options.memberKey || '').trim()
    const candidates = this.getMemberCandidates(memberKey)
    if (!memberKey) {
      wx.showToast({ title: '请填写会员ID', icon: 'none' })
      return false
    }
    if (!candidates.length) {
      wx.showToast({ title: '未找到匹配会员', icon: 'none' })
      return false
    }
    this.pendingMemberAction = {
      action: typeof options.action === 'function' ? options.action : null
    }
    this.setData({
      memberPickerVisible: true,
      memberPickerTitle: options.title || '选择会员',
      memberPickerHint: options.hint || '请先核对会员身份',
      memberPickerCandidates: candidates,
      memberPickerSelectedId: candidates.length === 1 ? candidates[0].id : '',
      memberPickerSelectedMember: candidates.length === 1 ? candidates[0] : null,
      memberPickerSelectedName: candidates.length === 1 ? (candidates[0].nickname || candidates[0].id || '已选会员') : '',
      memberPickerConfirmText: options.confirmText || '确认执行'
    })
    return true
  },
  selectMemberCandidate(event) {
    const id = event.currentTarget.dataset.id
    const selectedMember = this.data.memberPickerCandidates.find((item) => item.id === id) || null
    this.setData({
      memberPickerSelectedId: id,
      memberPickerSelectedMember: selectedMember,
      memberPickerSelectedName: selectedMember ? (selectedMember.nickname || selectedMember.id || '已选会员') : ''
    })
  },
  closeMemberPicker() {
    this.pendingMemberAction = null
    this.setData({
      memberPickerVisible: false,
      memberPickerCandidates: [],
      memberPickerSelectedId: '',
      memberPickerSelectedMember: null,
      memberPickerSelectedName: ''
    })
  },
  confirmMemberPicker() {
    const selectedId = String(this.data.memberPickerSelectedId || '').trim()
    const member = this.data.memberPickerCandidates.find((item) => item.id === selectedId)
    if (!member) {
      wx.showToast({ title: '请先选择会员', icon: 'none' })
      return
    }
    const action = this.pendingMemberAction && this.pendingMemberAction.action
    if (!action) {
      this.closeMemberPicker()
      return
    }
    this.closeMemberPicker()
    action(member)
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
        filteredMembers: this.filterMembers(state.getMemberList()),
        allCellar: cellar,
        allSignups: signups
      })
    }
    render()
    state.fetchMerchantOrders(() => {
      state.fetchMerchantBasics(() => {
        render()
        this.syncSelectedMemberDetail()
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
  filterMembers(list) {
    const keyword = String(this.data.memberSearchKeyword || '').trim().toLowerCase()
    const source = Array.isArray(list) ? list : []
    if (!keyword) return source
    return source.filter((item) => {
      const values = [item.id, item.nickname, item.phone, item.openid]
        .map((value) => String(value || '').trim().toLowerCase())
      return values.some((value) => value && value.indexOf(keyword) > -1)
    })
  },
  inputMemberSearch(event) {
    this.setData({
      memberSearchKeyword: event.detail.value,
      filteredMembers: this.filterMembers(state.getMemberList())
    })
  },
  refreshMemberManagement() {
    this.refreshDataManagement()
  },
  splitDateTime(value) {
    const text = String(value || '').trim()
    if (!text) return { dateDate: '', dateTime: '' }
    const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/)
    if (!match) return { dateDate: '', dateTime: '' }
    return {
      dateDate: match[1] || '',
      dateTime: match[2] || ''
    }
  },
  composeDateTime(dateDate, dateTime) {
    const day = String(dateDate || '').trim()
    const time = String(dateTime || '').trim()
    if (!day) return ''
    if (!time) return day
    return `${day} ${time}`
  },
  buildMemberDetail(member) {
    const source = member || {}
    const memberKeys = [source.id, source.openid, source.phone, source.nickname]
      .map((item) => String(item || '').trim())
      .filter(Boolean)
    const matches = (item) => {
      const keys = [item && item.memberId, item && item.memberKey, item && item.openid, item && item.phone, item && item.nickname, item && item.userId]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
      return memberKeys.some((key) => keys.includes(key))
    }
    const orders = state.getOrders().filter(matches)
    const signups = state.getSignups().filter(matches)
    const cellar = state.getCellar().filter(matches)
    const rechargeRecords = state.getRechargeRecords()
      .filter(matches)
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    const voucherLogs = state.getVoucherLogs()
      .filter(matches)
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    const logs = state.getPointLogs()
      .filter(matches)
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    return Object.assign({}, source, { orders, signups, cellar, logs, rechargeRecords, voucherLogs })
  },
  syncSelectedMemberDetail() {
    if (!this.data.memberDetailVisible || !this.data.selectedMember || !this.data.selectedMember.id) return
    const member = this.data.allMembers.find((item) => item.id === this.data.selectedMember.id) || state.getMemberList().find((item) => item.id === this.data.selectedMember.id)
    if (!member) return
    this.setData({ selectedMember: this.buildMemberDetail(member) })
  },
  selectMember(event) {
    const id = event.currentTarget.dataset.id
    const member = this.data.allMembers.find((item) => item.id === id) || state.getMemberList().find((item) => item.id === id)
    if (!member) return
    this.setData({
      pointsMemberKey: member.id || '',
      'voucherForm.memberKey': member.id || '',
      selectedMember: this.buildMemberDetail(member),
      memberDetailVisible: true
    })
  },
  closeMemberDetail() {
    this.setData({ memberDetailVisible: false })
  },
  noop() {},
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
  inputMenuCategoryDraft(event) {
    this.setData({ menuCategoryDraft: event.detail.value })
  },
  addMenuCategory() {
    const name = String(this.data.menuCategoryDraft || '').trim()
    if (!name) {
      wx.showToast({ title: '请填写类目名称', icon: 'none' })
      return
    }
    const storeId = this.activeStoreId()
    if (this.isSuperAdmin() && !storeId) {
      wx.showToast({ title: '请先选择类目所属门店', icon: 'none' })
      return
    }
    state.saveProductCategory(name, (category) => {
      if (!category) {
        wx.showToast({ title: '类目保存失败', icon: 'none' })
        return
      }
      this.setData({ menuCategoryDraft: '' })
      this.refreshProducts()
      wx.showToast({ title: '类目已添加', icon: 'success' })
    }, { storeId })
  },
  deleteMenuCategory(event) {
    const id = event.currentTarget.dataset.id
    const category = this.data.categories.find((item) => item.id === id)
    if (!category) return
    wx.showModal({
      title: '删除类目',
      content: `确认删除 ${category.name} ?`,
      success: (res) => {
        if (!res.confirm) return
        state.deleteProductCategory(id, (payload, synced) => {
          if (!payload) {
            wx.showToast({ title: '类目删除失败', icon: 'none' })
            return
          }
          this.refreshProducts()
          wx.showToast({ title: synced ? '类目已删除' : '类目同步失败', icon: synced ? 'success' : 'none' })
        }, this.activeStoreId())
      }
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
  deleteProduct(event) {
    const id = event.currentTarget.dataset.id
    const product = this.data.products.find((item) => item.id === id)
    if (!product) return
    wx.showModal({
      title: '删除餐品',
      content: `确认删除 ${product.name} ?`,
      success: (res) => {
        if (!res.confirm) return
        state.deleteProduct(id, (payload, synced) => {
          if (!payload) {
            wx.showToast({ title: '餐品删除失败', icon: 'none' })
            return
          }
          this.refreshProducts()
          this.refreshInventory()
          wx.showToast({ title: synced ? '餐品已删除' : '餐品同步失败', icon: synced ? 'success' : 'none' })
        })
      }
    })
  },
  moveMenuCategory(event) {
    const { id, direction } = event.currentTarget.dataset
    const currentCategories = this.data.categories || []
    const selectedCategoryId = currentCategories[this.data.menuForm.categoryIndex]
      ? currentCategories[this.data.menuForm.categoryIndex].id
      : ''
    const categories = state.moveItemByDirection(currentCategories, id, direction)
    if (!categories) return
    const nextSelectedIndex = selectedCategoryId ? categories.findIndex((item) => item.id === selectedCategoryId) : 0
    this.setData({
      categories,
      menuForm: Object.assign({}, this.data.menuForm, {
        categoryIndex: nextSelectedIndex > -1 ? nextSelectedIndex : 0
      }),
      menuCategoryName: categories[nextSelectedIndex] ? categories[nextSelectedIndex].name : (categories[0] ? categories[0].name : ''),
      menuSortDirty: true
    })
  },
  moveMenuProduct(event) {
  },
  saveMenuSort() {
    if (this.data.menuSortSaving) return
    const storeId = this.activeStoreId()
    if (this.isSuperAdmin() && !storeId) {
      wx.showToast({ title: '请先选择门店', icon: 'none' })
      return
    }
    this.setData({ menuSortSaving: true })
    wx.showLoading({ title: '保存中' })
    state.saveCategoryOrder(this.data.categories, (categories, ok1) => {
      if (!ok1) {
        wx.hideLoading()
        this.setData({ menuSortSaving: false })
        wx.showToast({ title: '类目排序保存失败', icon: 'none' })
        return
      }
      wx.hideLoading()
      this.setData({ menuSortSaving: false, menuSortDirty: false })
      this.refreshProducts()
      wx.showToast({ title: '类目排序已保存', icon: 'success' })
    }, storeId)
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
        [field]: field === 'payAmount' || field === 'creditAmount' || field === 'voucherCount' ? Number(value || 0) : value
      })
    })
    this.setData({ 'rechargeSettings.packages': packages })
  },
  addRechargePackage() {
    const packages = (this.data.rechargeSettings.packages || []).concat({
      id: `pkg-${Date.now()}`,
      payAmount: 0,
      creditAmount: 0,
      voucherCount: 0,
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
          voucherCount: Number(item.voucherCount || 0),
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
  inputVoucherSetting(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`voucherSettings.${field}`]: event.detail.value })
  },
  saveVoucherSettings() {
    const settings = this.data.voucherSettings
    const next = state.saveVoucherSettings(
      {
        title: String(settings.title || '').trim(),
        ruleName: String(settings.ruleName || '').trim(),
        buyCount: Number(settings.buyCount || 0),
        freeCount: Number(settings.freeCount || 0),
        note: String(settings.note || '').trim()
      },
      (saved) => {
        if (!saved) return
        this.setData({ voucherSettings: saved })
        wx.showToast({ title: '酒水券规则已保存', icon: 'success' })
      }
    )
    this.setData({ voucherSettings: next })
  },
  inputVoucherForm(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`voucherForm.${field}`]: event.detail.value })
  },
  adjustDrinkVoucher(sign = 1) {
    const memberKey = String(this.data.voucherForm.memberKey || '').trim()
    const amount = Math.abs(Number(this.data.voucherForm.count || 0))
    const note = String(this.data.voucherForm.note || '').trim()
    if (!memberKey || !amount) {
      wx.showToast({ title: '请填写会员和数量', icon: 'none' })
      return
    }
    const count = sign * amount
    this.openMemberPicker({
      memberKey,
      title: '选择会员',
      hint: '请先核对会员ID和昵称，再确认酒水券增减',
      confirmText: '确认调整',
      action: (member) => {
        state.grantDrinkVoucher(member.id, count, note, (payload) => {
          if (!payload) return
          this.setData({
            voucherForm: { memberKey: '', count: '', note: '' }
          })
          wx.showToast({ title: '酒水券已调整', icon: 'success' })
          this.refreshDataManagement()
        })
      }
    })
  },
  grantDrinkVoucher() {
    this.adjustDrinkVoucher(1)
  },
  deductDrinkVoucher() {
    this.adjustDrinkVoucher(-1)
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
      wx.showToast({ title: '请填写会员ID', icon: 'none' })
      return
    }
    if (!delta) {
      wx.showToast({ title: '请输入调整金额', icon: 'none' })
      return
    }
    this.openMemberPicker({
      memberKey: key,
      title: '选择会员',
      hint: '请先核对会员ID和昵称，再确认余额调整',
      confirmText: '确认调整',
      action: (member) => {
        state.adjustMemberBalance(member.id, delta, {
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
      }
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
  deleteStore(event) {
    const id = event.currentTarget.dataset.id
    const store = this.data.stores.find((item) => item.id === id)
    if (!store) return
    wx.showModal({
      title: '删除门店',
      content: `确认删除 ${store.shortName || store.name} ?`,
      success: (res) => {
        if (!res.confirm) return
        state.deleteStore(id, (ok) => {
          if (!ok) {
            wx.showToast({ title: '门店删除失败', icon: 'none' })
            return
          }
          this.refreshDataManagement()
          wx.showToast({ title: '门店已删除', icon: 'success' })
        })
      }
    })
  },
  imageByCategory(categoryId) {
    if (categoryId === 'dishes') return '/assets/product-dish.svg'
    if (categoryId === 'packages') return '/assets/product-pack.svg'
    if (categoryId === 'special' || categoryId === 'ktv') return '/assets/product-special.svg'
    return '/assets/product-drink.svg'
  },
  refreshLeaderboard() {
    const type = this.data.activeRankType || 'weekly'
    this.setData({ leaderboard: state.getLeaderboard(type), selectedRankUser: null, rankDeltaScore: '' })
    state.fetchLeaderboard((list) => {
      this.setData({ leaderboard: list ? state.getLeaderboard(type) : state.getLeaderboard(type) })
    }, type)
  },
  selectRankType(event) {
    const type = event.currentTarget.dataset.type || 'weekly'
    this.setData({ activeRankType: type, leaderboard: [], selectedRankUser: null, rankDeltaScore: '' })
    this.refreshLeaderboard()
  },
  inputRankUsername(event) {
    this.setData({ rankUsername: event.detail.value })
  },
  inputRankScore(event) {
    this.setData({ rankScore: event.detail.value })
  },
  inputRankDeltaScore(event) {
    this.setData({ rankDeltaScore: event.detail.value })
  },
  addRankUser() {
    const username = String(this.data.rankUsername || '').trim()
    const scoreText = String(this.data.rankScore || '').trim()
    const score = Number(scoreText)
    if (!username || !scoreText || Number.isNaN(score) || score <= 0) {
      wx.showToast({ title: '请填写正数分值', icon: 'none' })
      return
    }
    state.addLeaderboardUser({ username, score }, () => {
      this.setData({ rankUsername: '', rankScore: '' })
      this.refreshLeaderboard()
    }, this.data.activeRankType || 'weekly')
  },
  selectRankUser(event) {
    const id = event.currentTarget.dataset.id
    const selected = this.data.leaderboard.find((item) => item.id === id)
    if (!selected) return
    this.setData({ selectedRankUser: selected, rankDeltaScore: '' })
  },
  addRankScore() {
    const selected = this.data.selectedRankUser
    if (!selected) {
      wx.showToast({ title: '请先选择玩家', icon: 'none' })
      return
    }
    const delta = Number(this.data.rankDeltaScore || 0)
    if (!delta) {
      wx.showToast({ title: '请输入增减分数', icon: 'none' })
      return
    }
    state.adjustLeaderboardScore(selected.id, delta, () => {
      this.refreshLeaderboard()
      wx.showToast({ title: '分数已更新', icon: 'success' })
    }, this.data.activeRankType || 'weekly')
  },
  addRankAwardScore(event) {
    const selected = this.data.selectedRankUser
    if (!selected) {
      wx.showToast({ title: '请先选择玩家', icon: 'none' })
      return
    }
    const delta = Number(event.currentTarget.dataset.score || 0)
    if (!delta) return
    state.adjustLeaderboardScore(selected.id, delta, () => {
      this.refreshLeaderboard()
      wx.showToast({ title: `已加${delta}分`, icon: 'success' })
    }, this.data.activeRankType || 'weekly')
  },
  deleteRankUser() {
    const selected = this.data.selectedRankUser
    if (!selected) {
      wx.showToast({ title: '请先选择玩家', icon: 'none' })
      return
    }
    wx.showModal({
      title: '删除玩家',
      content: `确认删除 ${selected.username} ?`,
      success: (res) => {
        if (!res.confirm) return
        state.deleteLeaderboardUser(selected.id, () => {
          this.setData({ selectedRankUser: null, rankDeltaScore: '' })
          this.refreshLeaderboard()
          wx.showToast({ title: '玩家已删除', icon: 'success' })
        }, this.data.activeRankType || 'weekly')
      }
    })
  },
  moveRank(event) {
    const { id, direction } = event.currentTarget.dataset
    state.updateLeaderboardRank(id, direction, () => {
      this.refreshLeaderboard()
    }, this.data.activeRankType || 'weekly')
  },
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出当前商家账号？',
      confirmText: '确认退出',
      success: (res) => {
        if (!res.confirm) return
        state.merchantLogout((ok) => {
          if (!ok) return
          wx.reLaunch({ url: '/pages/merchant-login/merchant-login' })
        })
      }
    })
  }
})
