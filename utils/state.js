const data = require('./data')
const config = require('./config')

const KEYS = {
  store: 'deyou_selected_store',
  storeManual: 'deyou_selected_store_manual',
  cart: 'deyou_cart',
  orders: 'deyou_orders',
  signups: 'deyou_signups',
  member: 'deyou_member',
  auth: 'deyou_auth',
  cellar: 'deyou_cellar',
  members: 'deyou_members',
  leaderboard: 'deyou_leaderboard',
  merchantAuth: 'deyou_merchant_auth',
  categories: 'deyou_categories',
  products: 'deyou_products',
  activities: 'deyou_activities',
  inventory: 'deyou_inventory',
  pointLogs: 'deyou_point_logs',
  printLogs: 'deyou_print_logs',
  rechargeSettings: 'deyou_recharge_settings',
  voucherSettings: 'deyou_voucher_settings',
  voucherLogs: 'deyou_voucher_logs',
  rechargeRecords: 'deyou_recharge_records',
  stores: 'deyou_stores',
  tableContext: 'deyou_table_context',
  globalSettings: 'deyou_global_settings',
  storeGuideDone: 'deyou_store_guide_done'
}

const LEADERBOARD_TYPES = ['weekly', 'monthly', 'yearly']

const LEADERBOARD_TABS = [
  { key: 'weekly', label: '周榜' },
  { key: 'monthly', label: '月榜' },
  { key: 'yearly', label: '年度榜' }
]

let userSessionLoggedIn = false
let guestSessionMember = null
let userSessionId = `${Date.now()}-${Math.random()}`
let pendingWechatLoginCallback = null
let serverSyncInFlight = false
let serverSyncCallbacks = []

function ensureSeed() {
  if (!wx.getStorageSync(KEYS.store)) wx.setStorageSync(KEYS.store, data.stores[0].id)
  if (!wx.getStorageSync(KEYS.cart)) wx.setStorageSync(KEYS.cart, [])
  if (!wx.getStorageSync(KEYS.orders)) wx.setStorageSync(KEYS.orders, [])
  if (!wx.getStorageSync(KEYS.signups)) wx.setStorageSync(KEYS.signups, [])
  if (!wx.getStorageSync(KEYS.cellar)) wx.setStorageSync(KEYS.cellar, [])
  if (!wx.getStorageSync(KEYS.members)) wx.setStorageSync(KEYS.members, [Object.assign({}, data.member)])
  if (!wx.getStorageSync(KEYS.leaderboard)) wx.setStorageSync(KEYS.leaderboard, normalizeLeaderboardBoards({}))
  if (!wx.getStorageSync(KEYS.categories)) wx.setStorageSync(KEYS.categories, [])
  if (!wx.getStorageSync(KEYS.products)) wx.setStorageSync(KEYS.products, [])
  if (!wx.getStorageSync(KEYS.activities)) wx.setStorageSync(KEYS.activities, [])
  if (!wx.getStorageSync(KEYS.inventory)) wx.setStorageSync(KEYS.inventory, [])
  if (!wx.getStorageSync(KEYS.pointLogs)) wx.setStorageSync(KEYS.pointLogs, [])
  if (!wx.getStorageSync(KEYS.printLogs)) wx.setStorageSync(KEYS.printLogs, [])
  if (!wx.getStorageSync(KEYS.rechargeSettings)) wx.setStorageSync(KEYS.rechargeSettings, defaultRechargeSettings())
  if (!wx.getStorageSync(KEYS.voucherSettings)) wx.setStorageSync(KEYS.voucherSettings, defaultVoucherSettings())
  if (!wx.getStorageSync(KEYS.voucherLogs)) wx.setStorageSync(KEYS.voucherLogs, [])
  if (!wx.getStorageSync(KEYS.rechargeRecords)) wx.setStorageSync(KEYS.rechargeRecords, [])
  if (!wx.getStorageSync(KEYS.stores)) wx.setStorageSync(KEYS.stores, [])
  if (!wx.getStorageSync(KEYS.globalSettings)) wx.setStorageSync(KEYS.globalSettings, {})
  migrateBrandNames()
  migrateMenuCategories()
}

function migrateBrandNames() {
  const keys = [
    KEYS.stores,
    KEYS.categories,
    KEYS.products,
    KEYS.activities,
    KEYS.leaderboard,
    KEYS.globalSettings,
    KEYS.rechargeSettings,
    KEYS.voucherSettings,
    KEYS.voucherLogs,
    KEYS.printLogs
  ]
  keys.forEach((key) => {
    const value = wx.getStorageSync(key)
    if (!value) return
    const next = replaceBrandText(value)
    if (JSON.stringify(next) !== JSON.stringify(value)) {
      wx.setStorageSync(key, next)
    }
  })
}

function replaceBrandText(value) {
  if (typeof value === 'string') {
    return value
      .replace(/《德友酒吧》/g, '《破壳派酒吧》')
      .replace(/《德友酒馆》/g, '《破壳派酒吧》')
      .replace(/德友酒吧/g, '破壳派酒吧')
      .replace(/德友酒馆/g, '破壳派酒吧')
      .replace(/德友/g, '破壳派')
  }
  if (Array.isArray(value)) return value.map(replaceBrandText)
  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((result, key) => {
      result[key] = replaceBrandText(value[key])
      return result
    }, {})
  }
  return value
}

function normalizeProductCategory(product) {
  if (!product || typeof product !== 'object') return product
  const next = Object.assign({}, product)
  if (next.id === 'ktv-room') {
    next.id = 'craft-beer-lager'
    next.categoryId = 'craft-beer'
    next.name = '破壳派德式拉格'
    next.desc = '清爽麦香，适合桌游与轻食搭配'
    next.price = 58
    next.points = 6800
    next.unit = '杯'
    next.image = '/assets/product-drink.svg'
    next.sale = true
    next.categoryName = '精酿啤酒'
    return next
  }
  if (next.categoryId === 'ktv') {
    next.categoryId = 'craft-beer'
    next.categoryName = '精酿啤酒'
  } else if (next.categoryId === 'craft-beer' && next.categoryName === 'KTV') {
    next.categoryName = '精酿啤酒'
  }
  return next
}

function toSortOrder(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function compareSortOrder(left, right) {
  const leftOrder = Number(left && left.sortOrder ? left.sortOrder : 0)
  const rightOrder = Number(right && right.sortOrder ? right.sortOrder : 0)
  if (leftOrder !== rightOrder) return leftOrder - rightOrder
  const leftName = String(left && (left.name || left.title || '')).trim()
  const rightName = String(right && (right.name || right.title || '')).trim()
  return leftName.localeCompare(rightName)
}

function moveItemByDirection(list, id, direction, idKey = 'id') {
  const items = (Array.isArray(list) ? list : []).map((item) => Object.assign({}, item))
  const index = items.findIndex((item) => item && item[idKey] === id)
  const target = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || target < 0 || target >= items.length) {
    return null
  }
  const moving = items.splice(index, 1)[0]
  items.splice(target, 0, moving)
  return items.map((item, position) => Object.assign({}, item, {
    sortOrder: position + 1
  }))
}

function normalizeCategoryRecord(category, index = 0) {
  const next = Object.assign({}, category)
  next.sortOrder = toSortOrder(next.sortOrder, index + 1)
  next.storeId = String(next.storeId || '').trim()
  return next
}

function normalizeProductRecord(product, index = 0) {
  const next = normalizeProductCategory(product)
  next.sortOrder = toSortOrder(next.sortOrder, index + 1)
  return next
}

function normalizeCategoriesList(categories) {
  return (Array.isArray(categories) ? categories : [])
    .map((category, index) => normalizeCategoryRecord(category, index))
    .sort(compareSortOrder)
}

function normalizeProductsList(products) {
  return (Array.isArray(products) ? products : [])
    .map((product, index) => normalizeProductRecord(product, index))
    .sort(compareSortOrder)
}

function migrateMenuCategories() {
  const products = wx.getStorageSync(KEYS.products)
  if (Array.isArray(products) && products.length) {
    const next = products.map(normalizeProductCategory)
    if (JSON.stringify(next) !== JSON.stringify(products)) {
      wx.setStorageSync(KEYS.products, next)
    }
  }
  const inventory = wx.getStorageSync(KEYS.inventory)
  if (Array.isArray(inventory) && inventory.length) {
    const stockMap = new Map()
    inventory.forEach((item) => {
      if (!item || !item.id) return
      const id = item.id === 'ktv-room' ? 'craft-beer-lager' : item.id
      if (!stockMap.has(id)) stockMap.set(id, Number(item.stock || 0))
    })
    getProducts().forEach((product, index) => {
      if (!stockMap.has(product.id)) stockMap.set(product.id, 30 + index * 5)
    })
    const next = Array.from(stockMap.entries()).map(([id, stock]) => ({ id, stock }))
    if (JSON.stringify(next) !== JSON.stringify(inventory)) {
      wx.setStorageSync(KEYS.inventory, next)
    }
  }
}

function resetUserSession() {
  guestSessionMember = null
  const auth = wx.getStorageSync(KEYS.auth) || {}
  if (auth && auth.token) {
    userSessionLoggedIn = true
    userSessionId = String(auth.sessionId || `${Date.now()}-${Math.random()}`)
    if (!auth.sessionId) {
      wx.setStorageSync(KEYS.auth, Object.assign({}, auth, { sessionId: userSessionId }))
    }
    return
  }
  userSessionLoggedIn = false
  userSessionId = `${Date.now()}-${Math.random()}`
}

function clearUserSessionLocally() {
  userSessionLoggedIn = false
  guestSessionMember = null
  userSessionId = `${Date.now()}-${Math.random()}`
  pendingWechatLoginCallback = null
  wx.removeStorageSync(KEYS.auth)
  wx.removeStorageSync(KEYS.member)
}

function defaultRechargeSettings() {
  return {
    title: '储值账户',
    note: '充值1000元送5张酒水券，充值3000元送20张，充值9000元送80张；各门店统一执行。',
    paymentLabel: '微信支付',
    packages: [
      { id: 'pkg-1000', payAmount: 1000, creditAmount: 1000, voucherCount: 5, label: '充1000元', subLabel: '赠送5张酒水券', tip: '' },
      { id: 'pkg-3000', payAmount: 3000, creditAmount: 3000, voucherCount: 20, label: '充3000元', subLabel: '赠送20张酒水券', tip: '' },
      { id: 'pkg-9000', payAmount: 9000, creditAmount: 9000, voucherCount: 80, label: '充9000元', subLabel: '赠送80张酒水券', tip: '' }
    ]
  }
}

function defaultVoucherSettings() {
  return {
    title: '我的酒水券',
    ruleName: '到店消费后每次可用1张',
    buyCount: 1,
    freeCount: 0,
    note: '可以兑换一瓶啤酒或一箱啤酒，由门店自行决定，最终解释权归门店。',
    expireText: '长期有效'
  }
}

function normalizeVoucherNote(note) {
  const text = String(note || '').trim()
  const defaultNote = defaultVoucherSettings().note
  if (!text || text.indexOf('酒水券自动进入背包') > -1 || text.indexOf('商家工作人员确认') > -1) return defaultNote
  return text
}

function voucherCountForRecharge(pack = {}, payAmount = 0) {
  const explicit = Number(pack.voucherCount || 0)
  if (explicit > 0) return explicit
  const amount = Number(payAmount || pack.payAmount || 0)
  if (amount >= 9000) return 80
  if (amount >= 3000) return 20
  if (amount >= 1000) return 5
  return 0
}

function normalizeRechargePackages(packages) {
  const source = Array.isArray(packages) ? packages : []
  const hasOldDefault = source.some((item) => ['pkg-999', 'pkg-2000'].includes(String(item && item.id || '')))
  const usable = source.filter((item) => Number(item && item.payAmount || 0) > 0 && Number(item && item.creditAmount || 0) > 0)
  const list = hasOldDefault || !usable.length ? defaultRechargeSettings().packages : usable
  return list.map((item) => Object.assign({}, item, {
    payAmount: Number(item.payAmount || 0),
    creditAmount: Number(item.creditAmount || 0),
    voucherCount: voucherCountForRecharge(item, item.payAmount)
  }))
}

function defaultPrintTemplate() {
  return [
    '<CB>破壳派酒吧</CB>',
    '<C>{{storeName}}</C>',
    '------------------------------',
    '门店：{{storeName}}',
    '桌号：{{tableName}}',
    '订单号：{{orderId}}',
    '下单时间：{{createdAt}}',
    '打印时间：{{printTime}}',
    '用餐方式：{{mode}}',
    '会员：{{memberName}}',
    '------------------------------',
    '<B>商品明细</B>',
    '{{items}}',
    '------------------------------',
    '商品数量：{{itemCount}}',
    '商品原价：{{originalTotal}}',
    '酒水券抵扣：{{voucherDiscount}}',
    '储值卡抵扣：{{balanceUsed}}',
    '积分抵扣：{{pointsUsed}}',
    '<RIGHT>实付：{{total}}</RIGHT>',
    '支付状态：{{payStatus}}',
    '订单状态：{{status}}',
    '备注：{{remark}}',
    '',
    '<C>谢谢惠顾，欢迎再来</C>'
  ].join('\n')
}

function legacyPrintTemplate() {
  return '破壳派酒吧订单小票\n门店：{{storeName}}\n订单号：{{orderId}}\n合计：¥{{total}}'
}

function normalizePrintTemplate(template) {
  const value = String(template || '').trim()
  if (!value || value === legacyPrintTemplate()) return defaultPrintTemplate()
  return value
}

function defaultGlobalSettings() {
  return {
    videoTitle: '精彩呈现',
    videoUrl: '',
    showcaseImages: [],
    printTemplate: defaultPrintTemplate(),
    leaderboardRule: '按积分从高到低排序，商家可手动微调排名。',
    newOrderReminder: 'voice,vibrate,modal',
    newOrderReminderText: '\u6536\u5230{count}\u4e2a\u65b0\u8ba2\u5355\uff0c\u8bf7\u53ca\u65f6\u5904\u7406',
    newOrderVoiceUrl: '',
    reminderInterval: 5,
    homeNotice: '\u7834\u58f3\u6d3e\u9152\u5427\u6b22\u8fce\u60a8\uff0c\u7cbe\u5f69\u8d5b\u4e8b\u4e0e\u4f18\u60e0\u6d3b\u52a8\u6301\u7eed\u66f4\u65b0',
    showcaseText: '\u7cbe\u5f69\u5448\u73b0\uff1a\u8bb0\u5f55\u7834\u58f3\u6d3e\u9152\u5427\u7684\u8d5b\u4e8b\u3001\u805a\u4f1a\u548c\u73b0\u573a\u77ac\u95f4\u3002',
    joinUsTitle: '\u52a0\u5165\u6211\u4eec',
    joinUsText: '\u6b22\u8fce\u52a0\u5165\u7834\u58f3\u6d3e\u9152\u5427\uff0c\u4e00\u8d77\u6253\u9020\u66f4\u4e13\u4e1a\u3001\u66f4\u6709\u6e29\u5ea6\u7684\u6251\u514b\u4e3b\u9898\u793e\u4ea4\u7a7a\u95f4\u3002',
    joinUsImage: '/assets/hero-bar.svg',
    groupQrImage: '',
    groupQrTip: '\u70b9\u51fb\u6253\u5f00\u4e8c\u7ef4\u7801\u540e\u957f\u6309\u8bc6\u522b\u52a0\u5165\u5e97\u94fa\u7fa4',
    pointsRuleText: '\u79ef\u5206\u53ef\u7528\u4e8e\u95e8\u5e97\u6d88\u8d39\u548c\u6d3b\u52a8\u6743\u76ca\u5151\u6362\uff0c\u5177\u4f53\u4f7f\u7528\u89c4\u5219\u4ee5\u95e8\u5e97\u8bf4\u660e\u4e3a\u51c6\u3002',
    piecesRuleText: '\u788e\u7247\u53ef\u7528\u4e8e\u53c2\u4e0e\u95e8\u5e97\u6d3b\u52a8\u6216\u5151\u6362\u6307\u5b9a\u6743\u76ca\uff0c\u5177\u4f53\u4f7f\u7528\u65b9\u5f0f\u4ee5\u95e8\u5e97\u8bf4\u660e\u4e3a\u51c6\u3002'
  }
}

const LEGACY_SHOWCASE_IMAGES = ['/assets/hero-bar.svg', '/assets/activity-card.svg', '/assets/product-pack.svg']

function normalizeShowcaseImages(images, defaults) {
  if (!Array.isArray(images)) return defaults.showcaseImages.slice()
  const defaultImages = new Set(defaults.showcaseImages.concat(LEGACY_SHOWCASE_IMAGES))
  return images
    .map((item) => String(item || '').trim())
    .filter((item) => item && !defaultImages.has(item))
}

function normalizeGlobalSettings(settings) {
  const defaults = defaultGlobalSettings()
  const next = Object.assign({}, defaults, settings || {})
  next.printTemplate = normalizePrintTemplate(next.printTemplate)
  if (!String(next.newOrderReminderText || '').trim() || String(next.newOrderReminderText).indexOf('??') > -1) {
    next.newOrderReminderText = defaults.newOrderReminderText
  }
  next.newOrderReminder = String(next.newOrderReminder || defaults.newOrderReminder)
  next.newOrderVoiceUrl = String(next.newOrderVoiceUrl || '')
  next.reminderInterval = Math.max(0, Number(next.reminderInterval || defaults.reminderInterval))
  next.homeNotice = String(next.homeNotice || defaults.homeNotice)
  next.showcaseText = String(next.showcaseText || defaults.showcaseText)
  next.showcaseImages = normalizeShowcaseImages(settings && settings.showcaseImages, defaults)
  next.joinUsTitle = String(next.joinUsTitle || defaults.joinUsTitle)
  next.joinUsText = String(next.joinUsText || defaults.joinUsText)
  next.joinUsImage = String(next.joinUsImage || defaults.joinUsImage)
  next.groupQrImage = String(next.groupQrImage || '')
  next.groupQrTip = String(next.groupQrTip || defaults.groupQrTip)
  next.pointsRuleText = String(next.pointsRuleText || defaults.pointsRuleText).trim()
  next.piecesRuleText = String(next.piecesRuleText || defaults.piecesRuleText).trim()
  return next
}

function generateNickname() {
  return `游客${Math.floor(1000 + Math.random() * 9000)}`
}

function createGuestMember(seed) {
  const nickname = String((seed && seed.isGuest && seed.nickname) || generateNickname()).trim() || generateNickname()
  return {
    id: '',
    nickname,
    level: '',
    avatarText: nickname.slice(0, 1),
    balance: 0,
    points: 0,
    totalSpent: 0,
    consumptionCount: 0,
    gems: 0,
    drinkVoucherCount: 0,
    invitePieces: 0,
    consultant: '',
    gender: '',
    phone: '',
    isGuest: true
  }
}

function levelBySpend(totalSpent = 0, points = 0) {
  if (totalSpent >= 10000 || points >= 10000) return '黑金会员'
  if (totalSpent >= 5000 || points >= 5000) return '铂金会员'
  if (totalSpent >= 1000 || points >= 1000) return '黄金会员'
  if (totalSpent >= 300 || points >= 300) return '白银会员'
  return '普通会员'
}

function isLoggedIn() {
  const auth = wx.getStorageSync(KEYS.auth)
  return !!(userSessionLoggedIn && auth && auth.sessionId === userSessionId)
}

function normalizeMember(member) {
  const base = Object.assign({}, data.member, member || {})
  if (!isLoggedIn() && !isMerchantContext()) {
    return createGuestMember(base)
  }
  const next = Object.assign({}, base)
  next.id = String(next.id || `DY${Date.now()}`)
  next.nickname = String(next.nickname || generateNickname()).trim() || generateNickname()
  next.avatarText = next.nickname.slice(0, 1)
  next.balance = Number(next.balance || 0)
  next.points = Number(next.points || 0)
  next.totalSpent = Number(next.totalSpent || 0)
  next.consumptionCount = Number(next.consumptionCount || 0)
  next.gems = Number(next.gems || 0)
  next.drinkVoucherCount = Number(next.drinkVoucherCount || 0)
  next.invitePieces = Number(next.invitePieces || 0)
  next.consultant = String(next.consultant || '').trim()
  next.gender = String(next.gender || '').trim()
  next.phone = String(next.phone || '').trim()
  next.level = String(next.level || levelBySpend(next.totalSpent, next.points))
  next.isGuest = false
  return next
}

function getMember() {
  const stored = wx.getStorageSync(KEYS.member)
  if (!isLoggedIn() && !isMerchantContext()) {
    if (!guestSessionMember) {
      guestSessionMember = stored && stored.isGuest ? normalizeMember(stored) : createGuestMember(stored)
    }
    const guest = guestSessionMember
    if (!stored) {
      wx.setStorageSync(KEYS.member, guest)
    }
    return guest
  }
  return normalizeMember(stored)
}

function syncMemberRegistry(member) {
  if (!member || !member.id || member.isGuest) return
  const list = wx.getStorageSync(KEYS.members) || []
  const next = list.some((item) => item.id === member.id)
    ? list.map((item) => (item.id === member.id ? Object.assign({}, item, member) : item))
    : [Object.assign({}, member)].concat(list)
  wx.setStorageSync(KEYS.members, next)
}

function saveMember(member) {
  if (!isLoggedIn() && !isMerchantContext()) {
    return getMember()
  }
  const next = normalizeMember(member)
  wx.setStorageSync(KEYS.member, next)
  syncMemberRegistry(next)
  return next
}

function updateMyProfile(data, callback) {
  if (!isLoggedIn()) {
    wx.showToast({ title: '请先微信登录', icon: 'none' })
    if (callback) callback(null)
    return
  }
  requestApi('/api/my/profile', 'PUT', data || {}, (member) => {
    if (!member) {
      if (callback) callback(null)
      return
    }
    const next = saveMember(member)
    if (callback) callback(next)
  })
}

function updateNickname(nickname, callback) {
  if (!isLoggedIn()) {
    wx.showToast({ title: '请先微信登录', icon: 'none' })
    return getMember()
  }
  const value = String(nickname || '').trim()
  if (!value) {
    wx.showToast({ title: '请输入昵称', icon: 'none' })
    return getMember()
  }
  const member = getMember()
  const next = saveMember(Object.assign({}, member, { nickname: value, avatarText: value.slice(0, 1) }))
  updateMyProfile({ nickname: value }, (serverMember) => {
    if (callback) callback(serverMember || next)
  })
  return next
}

function normalizeWechatProfile(profile) {
  const userInfo = (profile && profile.userInfo) || profile || {}
  return {
    nickname: String(userInfo.nickName || userInfo.nickname || (profile && profile.nickname) || '').trim(),
    avatarUrl: String(userInfo.avatarUrl || (profile && profile.avatarUrl) || '').trim()
  }
}

function requestWechatProfile(callback) {
  if (!wx.getUserProfile) {
    if (callback) callback({})
    return
  }
  wx.getUserProfile({
    desc: '用于完善会员资料',
    success(res) {
      if (callback) callback(normalizeWechatProfile(res))
    },
    fail(error) {
      const message = error && error.errMsg && error.errMsg.indexOf('deny') > -1 ? '已取消授权' : '获取昵称头像失败'
      wx.showToast({ title: message, icon: 'none' })
      if (callback) callback(null)
    }
  })
}

function requestWechatIdentity(code, profile, callback) {
  if (typeof profile === 'function') {
    callback = profile
    profile = {}
  }
  const loginUrl = String(config.wechatLoginUrl || '').trim()
  if (!loginUrl) {
    wx.showModal({
      title: '未配置微信登录接口',
      content: '请先在 utils/config.js 配置 wechatLoginUrl，由后端使用 code 换取真实 openid 后再登录。',
      showCancel: false
    })
    if (callback) callback(null)
    return
  }
  wx.request({
    url: loginUrl,
    method: 'POST',
    timeout: 10000,
    header: {
      'content-type': 'application/json'
    },
    data: {
      code,
      nickname: profile && profile.nickname ? profile.nickname : '',
      avatarUrl: profile && profile.avatarUrl ? profile.avatarUrl : '',
      phone: profile && profile.phone ? profile.phone : (getMember().phone || ''),
      phoneCode: profile && profile.phoneCode ? profile.phoneCode : ''
    },
    success(res) {
      const body = res.data || {}
      const payload = body.data || body
      if (res.statusCode < 200 || res.statusCode >= 300 || !payload.openid) {
        wx.showToast({ title: payload.message || body.message || '微信身份获取失败', icon: 'none' })
        if (callback) callback(null)
        return
      }
      if (typeof callback === 'function') callback(payload)
    },
    fail(error) {
      const message = error && error.errMsg ? String(error.errMsg).replace(/^request:fail\s*/i, '') : ''
      wx.showToast({ title: message ? message.slice(0, 18) : '登录接口请求失败', icon: 'none' })
      if (callback) callback(null)
    }
  })
}

function buildMemberFromWechat(identity, code) {
  const stored = wx.getStorageSync(KEYS.member)
  const serverMember = identity.member || {}
  const base = stored && !stored.isGuest ? Object.assign({}, data.member, stored) : Object.assign({}, data.member)
  const openid = identity.openid || serverMember.openid || ''
  const unionid = identity.unionid || serverMember.unionid || ''
  const nickname = identity.nickname || serverMember.nickname || base.nickname || generateNickname()
  return Object.assign({}, base, serverMember, {
    id: serverMember.id || identity.memberId || openid || base.id || `DY${Date.now()}`,
    openid,
    unionid,
    token: identity.token || serverMember.token || '',
    nickname,
    avatarUrl: identity.avatarUrl || serverMember.avatarUrl || base.avatarUrl || '',
    avatarText: nickname.slice(0, 1),
    phone: serverMember.phone || identity.phone || base.phone || '',
    loginCode: code || '',
    isGuest: false,
    level: serverMember.level || levelBySpend(serverMember.totalSpent || base.totalSpent || 0, serverMember.points || base.points || 0),
    balance: Number(serverMember.balance !== undefined ? serverMember.balance : base.balance || 0),
    points: Number(serverMember.points !== undefined ? serverMember.points : base.points || 0),
    totalSpent: Number(serverMember.totalSpent !== undefined ? serverMember.totalSpent : base.totalSpent || 0),
    consumptionCount: Number(serverMember.consumptionCount !== undefined ? serverMember.consumptionCount : base.consumptionCount || 0),
    gems: Number(serverMember.gems !== undefined ? serverMember.gems : base.gems || 0),
    drinkVoucherCount: Number(serverMember.drinkVoucherCount !== undefined ? serverMember.drinkVoucherCount : base.drinkVoucherCount || 0),
    invitePieces: Number(serverMember.invitePieces !== undefined ? serverMember.invitePieces : base.invitePieces || 0)
  })
}

function completeWechatLogin(next, callback, toastTitle) {
  userSessionLoggedIn = true
  wx.setStorageSync(KEYS.auth, {
    loggedIn: true,
    loginAt: formatTime(new Date()),
    sessionId: userSessionId,
    openid: next.openid,
    unionid: next.unionid,
    token: next.token
  })
  wx.setStorageSync(KEYS.member, next)
  const finish = (member) => {
    const current = member || next
    syncMemberRegistry(current)
    syncServerData()
    wx.showToast({ title: toastTitle, icon: 'success' })
    if (callback) callback(current)
  }
  if (next.avatarUrl) {
    finish(next)
    return
  }
  ensureMemberAvatar((member) => finish(member || next))
}

function loginWithWeChat(callback, options = {}) {
  if (!wx.login) {
    wx.showToast({ title: '当前环境不支持登录', icon: 'none' })
    return
  }
  const runLogin = (profile) => {
    if (profile === null) return
    wx.login({
      success(res) {
        if (!res.code) {
          wx.showToast({ title: '微信登录 code 获取失败', icon: 'none' })
          return
        }
        requestWechatIdentity(res.code, profile || {}, (identity) => {
          if (!identity) return
          const next = buildMemberFromWechat(identity, res.code)
          completeWechatLogin(next, callback, '登录成功')
        })
      },
      fail() {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' })
      }
    })
  }
  if (options.withProfile === false) {
    runLogin({})
    return
  }
  requestWechatProfile(runLogin)
}

function loginWithPhoneNumber(phoneCode, callback, options = {}) {
  const code = String(phoneCode || '').trim()
  if (!code) {
    wx.showToast({ title: '未获取到手机号授权码', icon: 'none' })
    if (callback) callback(null)
    return
  }
  if (!wx.login) {
    wx.showToast({ title: '当前环境不支持登录', icon: 'none' })
    if (callback) callback(null)
    return
  }
  if (options.profileProvided) {
    const profileData = options.profile || {}
    const runLogin = () => {
      wx.login({
        success(res) {
          if (!res.code) {
            wx.showToast({ title: '微信登录 code 获取失败', icon: 'none' })
            if (callback) callback(null)
            return
          }
          requestWechatIdentity(res.code, Object.assign({}, profileData, { phoneCode: code }), (identity) => {
            if (!identity) return
            const next = buildMemberFromWechat(identity, res.code)
            completeWechatLogin(next, callback, '注册成功')
          })
        },
        fail() {
          wx.showToast({ title: '登录失败，请重试', icon: 'none' })
          if (callback) callback(null)
        }
      })
    }
    runLogin()
    return
  }
  const runLogin = (profile) => {
    const profileData = profile || {}
    wx.login({
      success(res) {
        if (!res.code) {
          wx.showToast({ title: '微信登录 code 获取失败', icon: 'none' })
          if (callback) callback(null)
          return
        }
        requestWechatIdentity(res.code, Object.assign({}, profileData, { phoneCode: code }), (identity) => {
          if (!identity) return
          const next = buildMemberFromWechat(identity, res.code)
          completeWechatLogin(next, callback, '注册成功')
        })
      },
      fail() {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' })
        if (callback) callback(null)
      }
    })
  }
  if (options.withProfile === false) {
    runLogin({})
    return
  }
  requestWechatProfile(runLogin)
}

function ensureMemberAvatar(callback) {
  if (!isLoggedIn()) {
    if (callback) callback(null)
    return
  }
  const member = getMember()
  if (member.avatarUrl) {
    if (callback) callback(member)
    return
  }
  requestWechatProfile((profile) => {
    if (!profile || !profile.avatarUrl) {
      wx.showToast({ title: '请授权头像', icon: 'none' })
      if (callback) callback(null)
      return
    }
    const next = saveMember(Object.assign({}, member, {
      nickname: profile.nickname || member.nickname,
      avatarUrl: profile.avatarUrl
    }))
    updateMyProfile({ nickname: next.nickname, avatarUrl: next.avatarUrl }, (serverMember) => {
      if (callback) callback(serverMember || next)
    })
  })
}

function apiBaseUrl() {
  return String(config.apiBaseUrl || '').replace(/\/+$/, '')
}

function requestApi(path, method, data, callback) {
  const base = apiBaseUrl()
  if (!base) {
    wx.showToast({ title: '未配置后端接口', icon: 'none' })
    if (callback) callback(null)
    return
  }
  const auth = wx.getStorageSync(KEYS.auth) || {}
  const header = { 'content-type': 'application/json' }
  if (auth.token) header.Authorization = `Bearer ${auth.token}`
  wx.request({
    url: `${base}${path}`,
    method,
    timeout: 15000,
    header,
    data: data || {},
    success(res) {
      const body = res.data || {}
      const payload = body.data || body
      if (res.statusCode < 200 || res.statusCode >= 300 || body.ok === false) {
        if (res.statusCode === 401) {
          clearUserSessionLocally()
          wx.showToast({ title: '登录已失效，请重新登录', icon: 'none' })
          if (callback) callback(null)
          return
        }
        wx.showToast({ title: body.message || payload.message || '接口请求失败', icon: 'none' })
        if (callback) callback(null)
        return
      }
      if (typeof callback === 'function') callback(payload)
    },
    fail() {
      wx.showToast({ title: '接口请求失败', icon: 'none' })
      if (callback) callback(null)
    }
  })
}

function uploadMerchantMedia(filePath, mediaType, callback) {
  const base = apiBaseUrl()
  if (!base || !filePath || !wx.uploadFile) {
    wx.showToast({ title: '当前环境不支持上传', icon: 'none' })
    if (callback) callback(null)
    return
  }
  wx.showLoading({ title: '上传中' })
  wx.uploadFile({
    url: `${base}/api/merchant/upload`,
    filePath,
    name: 'file',
    formData: {
      mediaType: mediaType || 'image'
    },
    success(res) {
      wx.hideLoading()
      let body = {}
      try {
        body = JSON.parse(res.data || '{}')
      } catch (error) {
        body = {}
      }
      const payload = body.data || body
      if (res.statusCode < 200 || res.statusCode >= 300 || !payload.url) {
        wx.showToast({ title: body.message || '上传失败', icon: 'none' })
        if (callback) callback(null)
        return
      }
      if (callback) callback(payload.url)
    },
    fail() {
      wx.hideLoading()
      wx.showToast({ title: '上传失败', icon: 'none' })
      if (callback) callback(null)
    }
  })
}

function requestWechatPayment(payment, callback) {
  if (!wx.requestPayment) {
    wx.showToast({ title: '当前环境不支持微信支付', icon: 'none' })
    if (callback) callback(false)
    return
  }
  wx.requestPayment({
    timeStamp: payment.timeStamp,
    nonceStr: payment.nonceStr,
    package: payment.package,
    signType: payment.signType || 'RSA',
    paySign: payment.paySign,
    success() {
      if (callback) callback(true)
    },
    fail(error) {
      wx.showToast({ title: error && error.errMsg && error.errMsg.indexOf('cancel') > -1 ? '已取消支付' : '支付失败', icon: 'none' })
      if (callback) callback(false)
    }
  })
}

function createOrderWithWechatPay(options = {}, callback) {
  if (!isLoggedIn()) return false
  const cart = getCart()
  if (!cart.length) {
    wx.showToast({ title: '购物车为空', icon: 'none' })
    return false
  }
  const store = getStore()
  const table = getTableContext()
  const preview = buildCheckoutPreview(cart, getMember(), options)
  if (!preview.pointsEnough) {
    wx.showToast({ title: '积分不足', icon: 'none' })
    return false
  }
  requestApi(
    '/api/wechat/pay/order',
    'POST',
    {
      storeId: store.id,
      tableNo: table && table.storeId === store.id ? table.tableNo : '',
      tableName: table && table.storeId === store.id ? table.tableName : '',
      mode: options.mode || '堂食',
      items: preview.items.map((item) => Object.assign({}, item)),
      originalTotal: preview.originalTotal,
      cashTotal: preview.cashTotal,
      pointsUsed: preview.pointsUsed,
      voucherDiscount: preview.voucherDiscount,
      voucherCountUsed: preview.voucherCountUsed,
      voucherRuleName: getVoucherSettings().ruleName || '',
      balanceUsed: preview.balanceUsed,
      payableBeforeBalance: preview.payableBeforeBalance,
      total: preview.payableTotal,
      useBalance: !!preview.useBalance,
      useVoucher: !!preview.useVoucher
    },
    (payload) => {
      if (!payload || !payload.order) {
        if (callback) callback(null)
        return
      }
      const finishPaidOrder = () => {
        const order = Object.assign({}, payload.order, { status: payload.order.status || '已支付' })
        const orders = getOrders()
        if (!orders.find((item) => item.id === order.id)) {
          orders.unshift(order)
          saveOrders(orders)
        }
        syncPaidActivitySignups(cart, () => {
          requestApi('/api/my/profile', 'GET', {}, (member) => {
            if (member) saveMember(member)
            clearCart()
            wx.showToast({ title: '支付成功', icon: 'success' })
            if (callback) callback(order)
          })
        })
      }
      if (payload.paid || !payload.payment) {
        finishPaidOrder()
        return
      }
      requestWechatPayment(payload.payment, (paid) => {
        if (!paid) {
          if (callback) callback(null)
          return
        }
        const order = Object.assign({}, payload.order, { status: '支付确认中' })
        const orders = getOrders()
        if (!orders.find((item) => item.id === order.id)) {
          orders.unshift(order)
          saveOrders(orders)
        }
        syncPaidActivitySignups(cart, () => {
          requestApi('/api/my/profile', 'GET', {}, (member) => {
            if (member) saveMember(member)
            clearCart()
            wx.showToast({ title: '支付成功', icon: 'success' })
            if (callback) callback(order)
          })
        })
      })
    }
  )
  return true
}

function syncPaidActivitySignups(cartItems, callback) {
  const activityIds = Array.from(new Set((cartItems || [])
    .filter((item) => item && item.categoryId === 'activity')
    .map((item) => item.activityId || String(item.id || '').replace(/^signup-/, ''))
    .filter(Boolean)))
  if (!activityIds.length) {
    if (callback) callback()
    return
  }
  let pending = activityIds.length
  const done = () => {
    pending -= 1
    if (pending <= 0) {
      fetchMySignups(() => {
        fetchActivities(() => {
          if (callback) callback()
        })
      })
    }
  }
  activityIds.forEach((activityId) => {
    const member = getMember()
    const alreadySigned = getSignups().some((item) => item.activityId === activityId && item.memberId === member.id)
    if (alreadySigned) {
      done()
      return
    }
    addSignup(getActivity(activityId) || { id: activityId }, done)
  })
}

function rechargeWithWechatPay(pack, callback) {
  if (!isLoggedIn()) return false
  const packageItem = pack || {}
  requestApi('/api/wechat/pay/recharge', 'POST', { packageId: packageItem.id, package: packageItem }, (payload) => {
    if (!payload || !payload.payment) {
      if (callback) callback(null)
      return
    }
    requestWechatPayment(payload.payment, (paid) => {
      if (!paid) {
        if (callback) callback(null)
        return
      }
      wx.showToast({ title: '支付成功', icon: 'success' })
      setTimeout(() => {
        requestApi('/api/my/profile', 'GET', {}, (member) => {
          if (member) saveMember(member)
          if (callback) callback(payload.record)
        })
      }, 1200)
    })
  })
  return true
}

function requireLogin(actionName, callback) {
  if (isLoggedIn()) {
    if (callback) callback(getMember())
    return true
  }
  wx.showModal({
    title: '需要微信登录',
    content: `${actionName || '使用该功能'}前，请先使用微信一键登录。`,
    confirmText: '微信登录',
    success(res) {
      if (res.confirm) {
        pendingWechatLoginCallback = typeof callback === 'function' ? callback : null
        wx.navigateTo({ url: '/pages/profile/profile?login=1' })
      }
    }
  })
  return false
}

function resolvePendingWechatLogin(member) {
  if (!pendingWechatLoginCallback) return
  const callback = pendingWechatLoginCallback
  pendingWechatLoginCallback = null
  callback(member || getMember())
}

function defaultMerchantAccounts() {
  const stores = getStores()
  const third = stores.find((item) => item.id !== 'jiangning' && item.id !== 'xinjiekou') || {}
  return [
    { username: 'admin', password: 'change-this-admin-password', role: 'super_admin', storeId: 'all', name: '总管理员' },
    { username: 'store_jiangning', password: 'change-this-jiangning-password', role: 'store_admin', storeId: 'jiangning', name: '高淳区店管理员' },
    { username: 'store_xinjiekou', password: 'change-this-xinjiekou-password', role: 'store_admin', storeId: 'xinjiekou', name: '新街口店管理员' },
    { username: 'store_qinhuai', password: 'change-this-qinhuai-password', role: 'store_admin', storeId: third.id || 'store-1778602441625', name: '秦淮区店管理员' },
    { username: data.merchantAccount.username, password: data.merchantAccount.password, role: 'store_admin', storeId: data.merchantAccount.storeId, name: data.merchantAccount.name }
  ]
}

function merchantLogin(username, password, callback) {
  const done = (session) => {
    if (callback) callback(session)
  }
  requestApi('/api/merchant/login', 'POST', { username, password }, (payload) => {
    if (!payload || !payload.token) {
      done(null)
      return
    }
    const store = payload.role === 'super_admin' ? null : getStores().find((item) => item.id === payload.storeId)
    const session = {
      username: payload.username || username,
      name: payload.name || username,
      role: payload.role || 'store_admin',
      storeId: payload.storeId || (store && store.id) || '',
      storeName: payload.storeName || (store ? store.shortName || store.name : '全部门店'),
      permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
      token: payload.token,
      loginAt: formatTime(new Date())
    }
    wx.setStorageSync(KEYS.merchantAuth, session)
    done(session)
  })
  return null
}

function clearMerchantSessionLocally() {
  wx.removeStorageSync(KEYS.merchantAuth)
}

function logoutUser(callback) {
  const auth = wx.getStorageSync(KEYS.auth) || {}
  if (!auth.token) {
    clearUserSessionLocally()
    if (callback) callback(true)
    return
  }
  requestApi('/api/auth/logout', 'POST', {}, (payload) => {
    if (!payload) {
      if (callback) callback(false)
      return
    }
    clearUserSessionLocally()
    if (callback) callback(true)
  })
}

function merchantLogout(callback) {
  const session = wx.getStorageSync(KEYS.merchantAuth) || {}
  if (!session.token) {
    clearMerchantSessionLocally()
    if (callback) callback(true)
    return
  }
  requestMerchantApi('/api/merchant/logout', 'POST', {}, (payload) => {
    if (!payload) {
      if (callback) callback(false)
      return
    }
    clearMerchantSessionLocally()
    if (callback) callback(true)
  })
}

function getMerchantSession() {
  return wx.getStorageSync(KEYS.merchantAuth) || null
}

function requestMerchantApi(path, method, data, callback) {
  const base = apiBaseUrl()
  const session = getMerchantSession()
  if (!base) {
    if (callback) callback(null)
    return false
  }
  if (!session || !session.token) {
    if (callback) {
      wx.showToast({ title: '商家登录已失效，请重新登录', icon: 'none' })
      callback(null)
    }
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
        if (callback) {
          if (res.statusCode === 401) {
            clearMerchantSessionLocally()
            wx.showToast({ title: '商家登录已失效，请重新登录', icon: 'none' })
            callback(null)
            return
          }
          wx.showToast({ title: body.message || payload.message || '商家接口请求失败', icon: 'none' })
          callback(null)
        }
        return
      }
      if (typeof callback === 'function') callback(payload)
    },
    fail() {
      if (callback) {
        wx.showToast({ title: '商家接口请求失败', icon: 'none' })
        callback(null)
      }
    }
  })
  return true
}

function requestMerchantText(path, method, data, callback) {
  const base = apiBaseUrl()
  const session = getMerchantSession()
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
    responseType: 'text',
    success(res) {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        if (res.statusCode === 401) {
          clearMerchantSessionLocally()
          wx.showToast({ title: '商家登录已失效，请重新登录', icon: 'none' })
          if (callback) callback(null)
          return
        }
        wx.showToast({ title: '商家接口请求失败', icon: 'none' })
        if (callback) callback(null)
        return
      }
      if (callback) callback(String(res.data || ''))
    },
    fail() {
      wx.showToast({ title: '商家接口请求失败', icon: 'none' })
      if (callback) callback(null)
    }
  })
  return true
}

function fetchMerchantOrders(callback) {
  const done = (orders) => {
    if (callback) callback(orders)
  }
  const base = apiBaseUrl()
  const session = getMerchantSession()
  if (!base || !session || !session.token) {
    done(null)
    return
  }
  wx.request({
    url: `${base}/api/merchant/orders`,
    method: 'GET',
    timeout: 15000,
    header: {
      'content-type': 'application/json',
      Authorization: `Bearer ${session.token}`
    },
    success(res) {
      const body = res.data || {}
      const payload = body.data || body
      if (res.statusCode >= 200 && res.statusCode < 300 && Array.isArray(payload)) {
        saveOrders(payload)
        done(payload)
        return
      }
      done(null)
    },
    fail() {
      done(null)
    }
  })
}

function isMerchantLoggedIn() {
  return !!getMerchantSession()
}

function isSuperMerchant() {
  const session = getMerchantSession()
  return !!(session && session.role === 'super_admin')
}

function fetchStaffAccounts(callback) {
  requestMerchantApi('/api/merchant/staff-accounts', 'GET', {}, (payload) => {
    if (callback) callback(Array.isArray(payload) ? payload : [])
  })
}

function saveStaffAccount(account, callback) {
  requestMerchantApi('/api/merchant/staff-accounts', 'POST', account || {}, (payload) => {
    if (callback) callback(payload)
  })
}

function deleteStaffAccount(id, callback) {
  requestMerchantApi(`/api/merchant/staff-accounts/${encodeURIComponent(id)}`, 'DELETE', {}, (payload) => {
    if (callback) callback(!!payload)
  })
}

function canReadPrivateData() {
  return isLoggedIn() || isMerchantContext()
}

function isMerchantContext() {
  if (!isMerchantLoggedIn() || typeof getCurrentPages !== 'function') {
    return false
  }
  const pages = getCurrentPages()
  const current = pages && pages.length ? pages[pages.length - 1] : null
  return !!(current && current.route && current.route.indexOf('pages/merchant') === 0)
}

function requireMerchantLogin(callback) {
  const session = getMerchantSession()
  if (session) {
    if (callback) callback(session)
    return true
  }
  wx.redirectTo({ url: '/pages/merchant-login/merchant-login' })
  return false
}

function normalizeStoreLocation(store) {
  const defaults = {
    jiangning: {
      latitude: 31.9567,
      longitude: 118.8465,
      businessHours: '14:00 - 05:00',
      cover: '/bac-clean.jpg'
    },
    xinjiekou: {
      latitude: 32.0431,
      longitude: 118.7847,
      businessHours: '14:00 - 05:00',
      cover: '/bac-clean.jpg'
    }
  }
  const preset = defaults[store.id] || {}
  const next = Object.assign({}, preset, store)
  if (next.status !== '营业中' && next.status !== '已休息') {
    next.status = '营业中'
  }
  next.latitude = Number(next.latitude || 0)
  next.longitude = Number(next.longitude || 0)
  return next
}

function getStores() {
  const stored = wx.getStorageSync(KEYS.stores)
  if (!Array.isArray(stored) || !stored.length) {
    if (isMerchantContext() || isMerchantLoggedIn()) return []
    return data.stores.map(normalizeStoreLocation)
  }
  return stored.map(normalizeStoreLocation)
}

function saveStores(stores) {
  wx.setStorageSync(KEYS.stores, stores.map(normalizeStoreLocation))
  return getStores()
}

function fetchMerchantList(path, fallback, save, callback) {
  requestMerchantApi(path, 'GET', {}, (payload) => {
    if (Array.isArray(payload)) {
      if (save) save(payload)
      if (typeof callback === 'function') callback(payload)
      return
    }
    if (callback) callback(null)
  })
}

function fetchStores(callback) {
  const done = (stores) => {
    if (callback) callback(stores || null)
  }
  const base = apiBaseUrl()
  if (!base) {
    done(null)
    return
  }
  wx.request({
    url: `${base}/api/stores`,
    method: 'GET',
    timeout: 10000,
    success(res) {
      const body = res.data || {}
      const payload = body.data || body
      if (res.statusCode >= 200 && res.statusCode < 300 && Array.isArray(payload)) {
        done(saveStores(payload))
        return
      }
      done(null)
    },
    fail() {
      done(null)
    }
  })
}

function fetchCategories(callback) {
  requestApi('/api/categories', 'GET', {}, (payload) => {
    if (Array.isArray(payload)) {
      const saved = saveCategories(payload)
      if (callback) callback(saved)
      return
    }
    if (callback) callback(null)
  })
}

function fetchMerchantStores(callback) {
  requestMerchantApi('/api/merchant/stores', 'GET', {}, (payload) => {
    if (Array.isArray(payload)) {
      const saved = saveStores(payload)
      if (callback) callback(saved)
      return
    }
    if (callback) callback(null)
  })
}

function updateStore(store, callback) {
  const list = getStores()
  const id = store.id || `store-${Date.now()}`
  const nextStore = normalizeStoreLocation({
    id,
    name: String(store.name || '').trim(),
    shortName: String(store.shortName || '').trim(),
    address: String(store.address || '').trim(),
    status: String(store.status || '营业中').trim(),
    phone: String(store.phone || '').trim(),
    latitude: Number(store.latitude || 0),
    longitude: Number(store.longitude || 0),
    businessHours: String(store.businessHours || '14:00 - 05:00').trim(),
    cover: store.cover || '/bac-clean.jpg',
    printerSn: String(store.printerSn || '').trim(),
    printerName: String(store.printerName || '').trim(),
    printerCopies: Math.max(1, Number(store.printerCopies || 1))
  })
  const requested = requestMerchantApi('/api/merchant/stores', 'POST', nextStore, (serverStore) => {
    if (serverStore) {
      const current = getStores()
      const serverNext = normalizeStoreLocation(serverStore)
      const exists = current.some((item) => item.id === serverNext.id)
      const saved = saveStores(exists
        ? current.map((item) => (item.id === serverNext.id ? Object.assign({}, item, serverNext) : item))
        : current.concat(serverNext))
      if (callback) callback(serverNext, true, saved)
      return
    }
    if (callback) callback(null, false, [])
  })
  if (requested) return list
  if (callback) callback(null, false, list)
  return list
}

function deleteStore(id, callback) {
  const storeId = String(id || '').trim()
  if (!storeId) {
    if (callback) callback(false, [])
    return false
  }
  const requested = requestMerchantApi(`/api/merchant/stores/${encodeURIComponent(storeId)}`, 'DELETE', {}, (payload) => {
    if (payload && payload.id) {
      const saved = saveStores(getStores().filter((item) => item.id !== payload.id))
      if (callback) callback(true, saved)
      return
    }
    if (callback) callback(false, [])
  })
  return requested
}

function getStore() {
  const id = wx.getStorageSync(KEYS.store) || data.stores[0].id
  const stores = getStores()
  return stores.find((item) => item.id === id) || stores[0] || normalizeStoreLocation(data.stores[0])
}

function setStore(id, options = {}) {
  wx.setStorageSync(KEYS.store, id)
  if (options.manual !== false) wx.setStorageSync(KEYS.storeManual, true)
}

function isStoreGuideDone() {
  return !!wx.getStorageSync(KEYS.storeGuideDone)
}

function markStoreGuideDone() {
  wx.setStorageSync(KEYS.storeGuideDone, true)
}

function distanceBetween(lat1, lon1, lat2, lon2) {
  const toRad = (value) => Number(value || 0) * Math.PI / 180
  const earthRadius = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function selectNearestStore(callback) {
  const stores = getStores().filter((item) => Number(item.latitude || 0) && Number(item.longitude || 0))
  const currentId = wx.getStorageSync(KEYS.store)
  if (!stores.length || wx.getStorageSync(KEYS.storeManual) || !wx.getLocation) {
    if (callback) callback(getStore())
    return
  }
  wx.getLocation({
    type: 'gcj02',
    success(res) {
      const nearest = stores
        .map((store) => Object.assign({}, store, {
          distance: distanceBetween(res.latitude, res.longitude, store.latitude, store.longitude)
        }))
        .sort((left, right) => left.distance - right.distance)[0]
      if (nearest && nearest.id && nearest.id !== currentId) {
        wx.setStorageSync(KEYS.store, nearest.id)
      }
      if (callback) callback(getStore())
    },
    fail() {
      if (callback) callback(getStore())
    }
  })
}

function formatDistance(distance) {
  const value = Number(distance || 0)
  if (!value) return ''
  if (value < 1000) return `${Math.round(value)}m`
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}km`
}

function requestNearestStore(callback) {
  const stores = getStores().filter((item) => Number(item.latitude || 0) && Number(item.longitude || 0))
  if (!stores.length || !wx.getLocation) {
    if (callback) callback(null, 'no-store-location')
    return
  }
  wx.getLocation({
    type: 'gcj02',
    success(res) {
      const nearest = stores
        .map((store) => Object.assign({}, store, {
          distance: distanceBetween(res.latitude, res.longitude, store.latitude, store.longitude)
        }))
        .sort((left, right) => left.distance - right.distance)[0] || null
      if (nearest && nearest.id) {
        wx.setStorageSync(KEYS.store, nearest.id)
        wx.setStorageSync(KEYS.storeManual, false)
      }
      if (callback) callback(nearest, null)
    },
    fail(err) {
      if (callback) callback(null, err || 'location-failed')
    }
  })
}

function thirdStoreId() {
  const third = getStores().find((item) => item.id !== 'jiangning' && item.id !== 'xinjiekou')
  return third ? third.id : 'store-1778602441625'
}

function storeIdByTableNo(tableNo) {
  const no = Number(tableNo || 0)
  if (no >= 1 && no <= 40) return 'jiangning'
  if (no >= 41 && no <= 80) return 'xinjiekou'
  if (no >= 81 && no <= 120) return thirdStoreId()
  return ''
}

function tableRangeByStoreId(storeId) {
  if (storeId === 'jiangning') return { start: 1, end: 40 }
  if (storeId === 'xinjiekou') return { start: 41, end: 80 }
  if (storeId === thirdStoreId()) return { start: 81, end: 120 }
  return null
}

function normalizeTableContext(context = {}) {
  const tableNo = Number(context.tableNo || context.table || 0)
  const mappedStoreId = storeIdByTableNo(tableNo)
  const storeId = String(context.storeId || mappedStoreId || '').trim()
  if (!tableNo || tableNo < 1 || tableNo > 120 || !storeId) return null
  const range = tableRangeByStoreId(storeId)
  if (range && (tableNo < range.start || tableNo > range.end)) return null
  const store = getStores().find((item) => item.id === storeId) || getStore()
  return {
    storeId,
    storeName: store ? store.shortName || store.name : '',
    tableNo,
    tableName: `${tableNo}号桌`,
    source: context.source || 'scan',
    updatedAt: formatTime(new Date())
  }
}

function getTableContext() {
  return normalizeTableContext(wx.getStorageSync(KEYS.tableContext) || {})
}

function setTableContext(context, options = {}) {
  const next = normalizeTableContext(context)
  if (!next) return null
  const current = getTableContext()
  if (current && (current.storeId !== next.storeId || current.tableNo !== next.tableNo)) {
    clearCart()
  }
  wx.setStorageSync(KEYS.tableContext, next)
  setStore(next.storeId, { manual: false })
  if (options.toast !== false) wx.showToast({ title: `已进入${next.tableName}`, icon: 'success' })
  return next
}

function clearTableContext() {
  wx.removeStorageSync(KEYS.tableContext)
}

function parseQueryString(text) {
  const result = {}
  String(text || '')
    .replace(/^\?/, '')
    .split('&')
    .forEach((part) => {
      if (!part) return
      const index = part.indexOf('=')
      const key = index > -1 ? part.slice(0, index) : part
      const value = index > -1 ? part.slice(index + 1) : ''
      if (!key) return
      result[decodeURIComponent(key)] = decodeURIComponent(value || '')
    })
  return result
}

function parseTablePayload(input) {
  if (!input) return null
  if (typeof input === 'object') {
    if (input.scene) {
      const sceneParsed = parseTablePayload(input.scene)
      if (sceneParsed) return sceneParsed
    }
    return normalizeTableContext(input)
  }
  const raw = decodeURIComponent(String(input || '').trim())
  if (!raw) return null
  if (/^\d{1,3}$/.test(raw)) return normalizeTableContext({ tableNo: raw })
  if (raw.indexOf('POKERPAI_TABLE|') === 0) {
    const parts = raw.split('|')
    return normalizeTableContext({ storeId: parts[1], tableNo: parts[2] })
  }
  const queryText = raw.includes('?') ? raw.split('?').pop() : raw
  const query = parseQueryString(queryText)
  if (query.scene) {
    const sceneParsed = parseTablePayload(query.scene)
    if (sceneParsed) return sceneParsed
  }
  return normalizeTableContext({
    storeId: query.storeId || query.s || '',
    tableNo: query.tableNo || query.table || query.t || ''
  })
}

function applyTablePayload(payload, options = {}) {
  const context = parseTablePayload(payload)
  if (!context) return null
  return setTableContext(context, options)
}

function openStoreLocation(store) {
  const target = store || getStore()
  const latitude = Number(target.latitude || 0)
  const longitude = Number(target.longitude || 0)
  if (!latitude || !longitude || !wx.openLocation) {
    wx.showToast({ title: '门店暂未设置定位', icon: 'none' })
    return false
  }
  wx.openLocation({
    latitude,
    longitude,
    name: target.name || target.shortName,
    address: target.address || '',
    scale: 16
  })
  return true
}

function getCart() {
  if (!isLoggedIn()) {
    return []
  }
  const cart = wx.getStorageSync(KEYS.cart) || []
  const products = getProducts()
  let changed = false
  const hydrated = cart.map((item) => {
    const product = products.find((entry) => entry.id === item.id)
    const points = Number(item.points || (product && product.points) || 0)
    const payType = item.payType === 'points' && points > 0 ? 'points' : 'cash'
    const cartKey = item.cartKey || `${item.id}::${payType}`
    if (points !== Number(item.points || 0) || payType !== item.payType || cartKey !== item.cartKey) changed = true
    return Object.assign({}, item, {
      price: Number(item.price || (product && product.price) || 0),
      points,
      payType,
      cartKey
    })
  })
  if (changed) wx.setStorageSync(KEYS.cart, hydrated)
  return hydrated
}

function saveCart(cart) {
  wx.setStorageSync(KEYS.cart, cart)
  return getCart()
}

function getProducts() {
  const stored = wx.getStorageSync(KEYS.products)
  if (!Array.isArray(stored) || !stored.length) {
    return []
  }
  const normalized = normalizeProductsList(stored)
  if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
    wx.setStorageSync(KEYS.products, normalized)
  }
  return normalized
}

function isDefaultProduct(product) {
  return data.products.some((item) => item.id === product.id)
}

function isProductVisibleInStore(product, storeId) {
  if (!product) return false
  if (product.storeId) return product.storeId === storeId
  return true
}

function getCategories() {
  const stored = wx.getStorageSync(KEYS.categories)
  if (!Array.isArray(stored) || !stored.length) {
    return []
  }
  const normalized = normalizeCategoriesList(stored)
  if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
    wx.setStorageSync(KEYS.categories, normalized)
  }
  return normalized
}

function saveCategories(categories) {
  wx.setStorageSync(KEYS.categories, normalizeCategoriesList(categories))
  return getCategories()
}

function getCategoryName(categoryId, products = getProducts()) {
  const category = getCategories().find((item) => item.id === categoryId)
  if (category) return category.name
  const product = products.find((item) => item.categoryId === categoryId && item.categoryName)
  return product ? product.categoryName : categoryId
}

function getProductCategories(products = getProducts(), options = {}) {
  const includeEmpty = options.includeEmpty !== false
  const storeId = String(options.storeId || '').trim()
  const categoryMap = new Map()
  const categories = getCategories()
  const scopedCategories = categories
    .filter((category) => !storeId || !category.storeId || category.storeId === storeId)
    .slice()
    .sort(compareSortOrder)
  if (includeEmpty) {
    scopedCategories.forEach((category) => {
      if (storeId && category.storeId && category.storeId !== storeId) return
      categoryMap.set(category.id, category.name)
    })
  }
  products.forEach((product) => {
    if (!product.categoryId) return
    if (!includeEmpty || !categoryMap.has(product.categoryId)) {
      categoryMap.set(product.categoryId, product.categoryName || getCategoryName(product.categoryId, products))
    }
  })
  const orderedDefaults = scopedCategories
    .filter((category) => categoryMap.has(category.id))
    .map((category) => ({ id: category.id, name: categoryMap.get(category.id) }))
  const extras = Array.from(categoryMap.entries())
    .filter(([id]) => !scopedCategories.find((category) => category.id === id))
    .map(([id, name]) => ({ id, name }))
  return orderedDefaults.concat(extras)
}

function fetchMerchantCategories(callback) {
  requestMerchantApi('/api/merchant/categories', 'GET', {}, (payload) => {
    if (Array.isArray(payload)) {
      const saved = saveCategories(payload)
      if (callback) callback(saved)
      return
    }
    if (callback) callback(null)
  })
}

function saveProductCategory(name, callback, options = {}) {
  const title = String(name || '').trim()
  if (!title) return null
  const storeId = String(options.storeId || '').trim()
  const categories = getCategories()
  const scopedCategories = categories.filter((item) => !storeId || !item.storeId || item.storeId === storeId)
  const existing = scopedCategories.find((item) => item.name === title)
  const maxSortOrder = scopedCategories.reduce((max, item) => Math.max(max, Number(item.sortOrder || 0)), 0)
  const category = existing || {
    id: `cat-${Date.now()}`,
    name: title,
    storeId,
    sortOrder: toSortOrder(options.sortOrder, maxSortOrder + 1)
  }
  if (existing && options.sortOrder !== undefined) {
    category.sortOrder = toSortOrder(options.sortOrder, toSortOrder(existing.sortOrder, maxSortOrder + 1))
  }
  requestMerchantApi('/api/merchant/categories', 'POST', category, (payload) => {
    if (!payload) {
      if (callback) callback(null)
      return
    }
    const exists = categories.some((item) => item.id === payload.id)
    const nextPayload = Object.assign({}, payload, {
      sortOrder: toSortOrder(payload.sortOrder, category.sortOrder)
    })
    const saved = saveCategories(exists ? categories.map((item) => (item.id === payload.id ? nextPayload : item)) : categories.concat(nextPayload))
    if (callback) callback(payload, saved)
  })
  return category
}

function deleteProductCategory(id, callback, storeId = '') {
  const categoryId = String(id || '').trim()
  const scopedId = String(storeId || '').trim()
  if (!categoryId) {
    if (callback) callback(null, false)
    return false
  }
  requestMerchantApi(`/api/merchant/categories/${encodeURIComponent(categoryId)}`, 'DELETE', {}, (payload) => {
    if (!payload) {
      if (callback) callback(null, false)
      return
    }
    const categories = getCategories().filter((item) => item.id !== categoryId || (scopedId && item.storeId && item.storeId !== scopedId))
    saveCategories(categories)
    if (callback) callback(payload, true)
  })
  return true
}

function saveProducts(products) {
  wx.setStorageSync(KEYS.products, normalizeProductsList(products))
  return getProducts()
}

function fetchProducts(callback) {
  const base = apiBaseUrl()
  if (!base) {
    if (callback) callback(null)
    return
  }
  wx.request({
    url: `${base}/api/products?storeId=${encodeURIComponent((getStore() || {}).id || '')}`,
    method: 'GET',
    timeout: 10000,
    success(res) {
      const body = res.data || {}
      const payload = body.data || body
      if (res.statusCode >= 200 && res.statusCode < 300 && Array.isArray(payload)) {
        if (callback) callback(saveProducts(payload))
        return
      }
      if (callback) callback(null)
    },
    fail() {
      if (callback) callback(null)
    }
  })
}

function fetchActivities(callback) {
  requestApi('/api/activities', 'GET', {}, (payload) => {
    if (Array.isArray(payload)) {
      const saved = saveActivities(payload)
      if (callback) callback(saved)
      return
    }
    if (callback) callback(null)
  })
}

function updateProduct(product, callback) {
  const list = getProducts()
  const id = product.id || `prd-${Date.now()}`
  const categoryId = product.categoryId || 'dishes'
  const existing = list.find((item) => item.id === id)
  const maxSortOrder = list.reduce((max, item) => Math.max(max, Number(item.sortOrder || 0)), 0)
  const nextProduct = {
    id,
    categoryId,
    name: String(product.name || '').trim(),
    desc: String(product.desc || '').trim(),
    price: Number(product.price || 0),
    points: Number(product.points || 0),
    unit: String(product.unit || '份').trim() || '份',
    image: product.image || '/assets/product-dish.svg',
    sale: !!product.sale,
    categoryName: product.categoryName || getCategoryName(categoryId, list),
    storeId: product.storeId === undefined ? '' : String(product.storeId || ''),
    sortOrder: toSortOrder(product.sortOrder, existing ? toSortOrder(existing.sortOrder, maxSortOrder + 1) : maxSortOrder + 1)
  }
  const requested = requestMerchantApi('/api/merchant/products', 'POST', nextProduct, (payload) => {
    if (!payload) {
      if (callback) callback(null, false, [])
      return
    }
    const serverProduct = Object.assign({}, nextProduct, payload, {
      sortOrder: toSortOrder(payload.sortOrder, nextProduct.sortOrder)
    })
    const current = getProducts()
    const exists = current.some((item) => item.id === serverProduct.id)
    const saved = saveProducts(exists
      ? current.map((item) => (item.id === serverProduct.id ? Object.assign({}, item, serverProduct) : item))
      : [serverProduct].concat(current))
    ensureProductStock(serverProduct.id)
    if (callback) callback(serverProduct, true, saved)
  })
  if (requested) return list
  if (callback) callback(null, false, list)
  return list
}

function updateCategoryOrder(id, direction, callback, storeId = '') {
  const scopedId = String(storeId || '').trim()
  const categories = getCategories().filter((item) => !scopedId || !item.storeId || item.storeId === scopedId)
  const index = categories.findIndex((item) => item.id === id)
  const target = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || target < 0 || target >= categories.length) {
    if (callback) callback(null, false)
    return categories
  }
  const next = categories.slice()
  const current = Object.assign({}, next[index])
  const swapped = Object.assign({}, next[target])
  const currentOrder = Number(current.sortOrder || index + 1)
  current.sortOrder = Number(swapped.sortOrder || target + 1)
  swapped.sortOrder = currentOrder
  next[index] = current
  next[target] = swapped
  saveCategories(next)
  const syncOne = (category, done) => requestMerchantApi('/api/merchant/categories', 'POST', category, (payload) => done(payload))
  syncOne(current, (first) => {
    if (!first) {
      if (callback) callback(null, false)
      return
    }
    syncOne(swapped, (second) => {
      if (second && callback) callback(next, true)
      else if (callback) callback(null, false)
    })
  })
  return next
}

function updateProductOrder(id, direction, callback, storeId = '') {
  const scopedId = String(storeId || '').trim()
  const products = getProducts().filter((item) => !scopedId || !item.storeId || item.storeId === scopedId)
  const index = products.findIndex((item) => item.id === id)
  const target = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || target < 0 || target >= products.length) {
    if (callback) callback(null, false)
    return products
  }
  const next = products.slice()
  const current = Object.assign({}, next[index])
  const swapped = Object.assign({}, next[target])
  const currentOrder = Number(current.sortOrder || index + 1)
  current.sortOrder = Number(swapped.sortOrder || target + 1)
  swapped.sortOrder = currentOrder
  next[index] = current
  next[target] = swapped
  const allProducts = getProducts()
  const merged = allProducts.map((item) => {
    if (item.id === current.id) return current
    if (item.id === swapped.id) return swapped
    return item
  })
  saveProducts(merged)
  const syncOne = (product, done) => requestMerchantApi('/api/merchant/products', 'POST', product, (payload) => done(payload))
  syncOne(current, (first) => {
    if (!first) {
      if (callback) callback(null, false)
      return
    }
    syncOne(swapped, (second) => {
      if (second && callback) callback(next, true)
      else if (callback) callback(null, false)
    })
  })
  return next
}

function saveCategoryOrder(categories, callback, storeId = '') {
  const scopedId = String(storeId || '').trim()
  const next = (Array.isArray(categories) ? categories : []).map((item, index) => Object.assign({}, item, {
    sortOrder: index + 1,
    storeId: item.storeId === undefined ? scopedId : String(item.storeId || scopedId)
  }))
  const allCategories = getCategories()
  const merged = allCategories.map((item) => {
    const found = next.find((entry) => entry.id === item.id)
    return found ? Object.assign({}, item, found) : item
  })
  const syncOne = (index) => {
    if (index >= next.length) {
      saveCategories(merged)
      if (callback) callback(next, true)
      return
    }
    requestMerchantApi('/api/merchant/categories', 'POST', next[index], (payload) => {
      if (!payload) {
        if (callback) callback(null, false)
        return
      }
      next[index] = Object.assign({}, next[index], payload, {
        sortOrder: toSortOrder(payload.sortOrder, next[index].sortOrder)
      })
      const mergedIndex = merged.findIndex((item) => item.id === next[index].id)
      if (mergedIndex > -1) merged[mergedIndex] = Object.assign({}, merged[mergedIndex], next[index])
      else merged.unshift(next[index])
      syncOne(index + 1)
    })
  }
  syncOne(0)
  return next
}

function saveProductOrder(products, callback, storeId = '') {
  const scopedId = String(storeId || '').trim()
  const next = (Array.isArray(products) ? products : []).map((item, index) => Object.assign({}, item, {
    sortOrder: index + 1,
    storeId: item.storeId === undefined ? scopedId : String(item.storeId || scopedId)
  }))
  const allProducts = getProducts()
  const merged = allProducts.map((item) => {
    const found = next.find((entry) => entry.id === item.id)
    return found ? Object.assign({}, item, found) : item
  })
  const syncOne = (index) => {
    if (index >= next.length) {
      saveProducts(merged)
      if (callback) callback(next, true)
      return
    }
    requestMerchantApi('/api/merchant/products', 'POST', next[index], (payload) => {
      if (!payload) {
        if (callback) callback(null, false)
        return
      }
      next[index] = Object.assign({}, next[index], payload, {
        sortOrder: toSortOrder(payload.sortOrder, next[index].sortOrder)
      })
      const mergedIndex = merged.findIndex((item) => item.id === next[index].id)
      if (mergedIndex > -1) merged[mergedIndex] = Object.assign({}, merged[mergedIndex], next[index])
      else merged.unshift(next[index])
      syncOne(index + 1)
    })
  }
  syncOne(0)
  return next
}

function deleteProduct(id, callback) {
  const productId = String(id || '').trim()
  if (!productId) {
    if (callback) callback(null, false)
    return false
  }
  requestMerchantApi(`/api/merchant/products/${encodeURIComponent(productId)}`, 'DELETE', {}, (payload) => {
    if (!payload) {
      if (callback) callback(null, false)
      return
    }
    saveProducts(getProducts().filter((item) => item.id !== productId))
    wx.setStorageSync(KEYS.inventory, (wx.getStorageSync(KEYS.inventory) || []).filter((item) => item.id !== productId))
    if (callback) callback(payload, true)
  })
  return true
}

function fetchMerchantProducts(callback) {
  fetchMerchantList('/api/merchant/products', getProducts, saveProducts, callback)
}

function fetchTableQrcodes(callback) {
  requestMerchantApi('/api/merchant/table-qrcodes', 'GET', {}, (payload) => {
    if (callback) callback(Array.isArray(payload) ? payload : [])
  })
}

function generateTableQrcodes(callback) {
  requestMerchantApi('/api/merchant/table-qrcodes/generate', 'POST', {}, (payload) => {
    if (callback) callback(payload)
  })
}

function parseActivityDateTime(value) {
  const text = String(value || '').trim()
  if (!text) return null
  let normalized = text
    .replace(/年|\/|\.|月/g, '-')
    .replace(/日|号/g, '')
    .replace(/\s+/g, ' ')
  if (/^\d{1,2}-\d{1,2}/.test(normalized)) {
    normalized = `${new Date().getFullYear()}-${normalized}`
  }
  const parts = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (!parts) return null
  const parsed = new Date(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]),
    Number(parts[4] || 0),
    Number(parts[5] || 0)
  )
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isActivitySignupClosed(activity) {
  if (!activity) return true
  if (activity.status && activity.status !== 'open') return true
  const deadline = parseActivityDateTime(activity.deadlineAt || activity.deadline)
  return !!(deadline && Date.now() > deadline.getTime())
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function dayLabelOffset(label) {
  return {
    今天: 0,
    明天: 1,
    后天: 2,
    '2天后': 3
  }[String(label || '').trim()]
}

function activityDayLabelFromDateText(text) {
  const value = String(text || '').trim()
  if (!value) return ''
  const now = new Date()
  let target = null
  const isoDate = value.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/)
  if (isoDate) {
    target = new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))
  } else {
    const monthDay = value.match(/(\d{1,2})月(\d{1,2})日/)
    if (monthDay) {
      target = new Date(now.getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2]))
    }
  }
  if (!target || Number.isNaN(target.getTime())) return ''
  const diffDays = Math.round((startOfLocalDay(target) - startOfLocalDay(now)) / 86400000)
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '明天'
  if (diffDays === 2) return '后天'
  if (diffDays === 3) return '2天后'
  return ''
}

function rollRelativeActivityDate(text, label) {
  const value = String(text || '').trim()
  const offset = dayLabelOffset(label)
  if (offset === undefined || !/(\d{1,2})月(\d{1,2})日/.test(value) || /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.test(value)) {
    return value
  }
  const target = new Date()
  target.setDate(target.getDate() + offset)
  const month = String(target.getMonth() + 1).padStart(2, '0')
  const day = String(target.getDate()).padStart(2, '0')
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][target.getDay()]
  return value.replace(/(\d{1,2})月(\d{1,2})日(?:\s*[（(][^）)]*[）)])?/, `${month}月${day}日 (${weekday})`)
}

function normalizeActivity(activity, index = 0) {
  const fallbackStore = inferStoreByActivity(activity)
  const joined = Number(activity.joined || 0)
  const quota = Number(activity.quota || 10)
  const explicitDayLabel = String(activity.dayLabel || '').trim()
  const originalDate = String(activity && activity.date ? activity.date : '').trim()
  const rolledDate = rollRelativeActivityDate(originalDate, explicitDayLabel)
  const inferredDayLabel = activityDayLabelFromDateText(rolledDate) || explicitDayLabel
  return Object.assign(
    {
      id: `act-${Date.now()}-${index}`,
      title: '',
      type: '国际扑克',
      date: '',
      dayLabel: '',
      location: fallbackStore.address || '',
      latitude: fallbackStore.latitude || 31.9567,
      longitude: fallbackStore.longitude || 118.8465,
      deadline: '',
      deadlineAt: '',
      price: 0,
      pointsPrice: 0,
      quota,
      joined,
      status: 'open',
      productName: '',
      image: '/assets/activity-card.svg',
      detailImage: '/assets/activity-card.svg',
      environmentImage: '/assets/hero-bar.svg',
      resultImage: '/assets/activity-card.svg'
    },
    activity || {},
    {
      date: rolledDate,
      dayLabel: inferredDayLabel,
      quota,
      joined,
      price: Number(activity && activity.price ? activity.price : 0),
      pointsPrice: Number(activity && activity.pointsPrice ? activity.pointsPrice : 0)
    }
  )
}

function normalizeActivities(activities) {
  return (activities || []).map((activity, index) => normalizeActivity(activity, index))
}

function getActivities() {
  const stored = wx.getStorageSync(KEYS.activities)
  if (!Array.isArray(stored) || !stored.length) {
    return []
  }
  return normalizeActivities(stored)
}

function getActivity(id) {
  return getActivities().find((item) => item.id === id) || null
}

function saveActivities(activities) {
  wx.setStorageSync(KEYS.activities, normalizeActivities(activities))
  return getActivities()
}

function updateActivity(activity, callback) {
  const list = getActivities()
  const id = activity.id || `act-${Date.now()}`
  const nextActivity = normalizeActivity(Object.assign({}, activity, { id }))
  const requested = requestMerchantApi('/api/merchant/activities', 'POST', nextActivity, (payload) => {
    if (!payload) {
      if (callback) callback(null, false, [])
      return
    }
    const serverActivity = normalizeActivity(Object.assign({}, nextActivity, payload))
    const current = getActivities()
    const exists = current.some((item) => item.id === serverActivity.id)
    const saved = saveActivities(exists
      ? current.map((item) => (item.id === serverActivity.id ? Object.assign({}, item, serverActivity) : item))
      : [serverActivity].concat(current))
    if (callback) callback(serverActivity, true, saved)
  })
  if (requested) return list
  if (callback) callback(null, false, list)
  return list
}

function deleteActivity(id, callback) {
  const activityId = String(id || '').trim()
  if (!activityId) {
    if (callback) callback(null, false)
    return getActivities()
  }
  const requested = requestMerchantApi(`/api/merchant/activities/${encodeURIComponent(activityId)}`, 'DELETE', {}, (payload) => {
    if (!payload) {
      if (callback) callback(null, false)
      return
    }
    const saved = saveActivities(getActivities().filter((item) => item.id !== activityId))
    if (callback) callback(saved, true)
  })
  if (requested) return getActivities()
  if (callback) callback(null, false)
  return getActivities()
}

function fetchMerchantActivities(callback) {
  fetchMerchantList('/api/merchant/activities', getActivities, saveActivities, callback)
}

function fetchMerchantBasics(callback) {
  let pending = 5
  const done = () => {
    pending -= 1
    if (!pending && callback) callback()
  }
  fetchMerchantList('/api/merchant/signups', getSignups, (list) => wx.setStorageSync(KEYS.signups, list), done)
  fetchMerchantList('/api/merchant/cellar', getCellar, (list) => wx.setStorageSync(KEYS.cellar, list), done)
  fetchMerchantList('/api/merchant/members', getMemberList, (list) => wx.setStorageSync(KEYS.members, list), done)
  fetchMerchantList('/api/merchant/recharge-records', getRechargeRecords, (list) => wx.setStorageSync(KEYS.rechargeRecords, list), done)
  fetchMerchantList('/api/merchant/point-logs', getPointLogs, (list) => wx.setStorageSync(KEYS.pointLogs, list), done)
}

function fetchMyProfile(callback) {
  if (!isLoggedIn()) {
    if (callback) callback(null)
    return
  }
  requestApi('/api/my/profile', 'GET', {}, (member) => {
    if (member) {
      const next = saveMember(member)
      if (callback) callback(next)
      return
    }
    if (callback) callback(null)
  })
}

function fetchMyOrders(callback) {
  if (!isLoggedIn()) {
    if (callback) callback([])
    return
  }
  requestApi('/api/my/orders', 'GET', {}, (list) => {
    if (Array.isArray(list)) {
      saveOrders(list)
      if (callback) callback(list)
      return
    }
    if (callback) callback(null)
  })
}

function fetchMySignups(callback) {
  if (!isLoggedIn()) {
    if (callback) callback([])
    return
  }
  requestApi('/api/my/signups', 'GET', {}, (list) => {
    if (Array.isArray(list)) {
      wx.setStorageSync(KEYS.signups, list)
      if (callback) callback(list)
      return
    }
    if (callback) callback(null)
  })
}

function fetchMyCellar(callback) {
  if (!isLoggedIn()) {
    if (callback) callback([])
    return
  }
  requestApi('/api/my/cellar', 'GET', {}, (list) => {
    if (Array.isArray(list)) {
      wx.setStorageSync(KEYS.cellar, list)
      if (callback) callback(list)
      return
    }
    if (callback) callback(null)
  })
}

function fetchMyRechargeRecords(callback) {
  if (!isLoggedIn()) {
    if (callback) callback([])
    return
  }
  requestApi('/api/my/recharge-records', 'GET', {}, (list) => {
    if (Array.isArray(list)) {
      saveRechargeRecords(list)
      if (callback) callback(list)
      return
    }
    if (callback) callback(null)
  })
}

function clearSyncedCaches() {
  ;[
    KEYS.categories,
    KEYS.products,
    KEYS.activities,
    KEYS.members,
    KEYS.orders,
    KEYS.signups,
    KEYS.cellar,
    KEYS.inventory,
    KEYS.rechargeSettings,
    KEYS.rechargeRecords,
    KEYS.pointLogs,
    KEYS.globalSettings,
    KEYS.leaderboard,
    KEYS.printLogs
  ].forEach((key) => wx.removeStorageSync(key))
}

function syncServerData(callback) {
  if (callback) serverSyncCallbacks.push(callback)
  if (serverSyncInFlight) return
  serverSyncInFlight = true
  const finish = () => {
    serverSyncInFlight = false
    const callbacks = serverSyncCallbacks
    serverSyncCallbacks = []
    callbacks.forEach((item) => {
      if (typeof item === 'function') item()
    })
  }
  clearSyncedCaches()
  const tasks = [
    fetchStores,
    fetchCategories,
    fetchProducts,
    fetchActivities,
    fetchRechargeSettings,
    fetchGlobalSettings,
    fetchPublicLeaderboard
  ]
  if (isMerchantLoggedIn()) {
    tasks.push(fetchMerchantBasics, fetchInventory)
  }
  let pending = tasks.length
  const done = () => {
    pending -= 1
    if (pending > 0) return
    syncPrivateServerData(finish)
  }
  if (!tasks.length) {
    syncPrivateServerData(finish)
    return
  }
  tasks.forEach((task) => task(done))
}

function syncPrivateServerData(callback) {
  if (!isLoggedIn()) {
    if (callback) callback()
    return
  }
  fetchMyProfile(() => {
    if (!isLoggedIn()) {
      if (callback) callback()
      return
    }
    const tasks = [fetchMyOrders, fetchMySignups, fetchMyCellar, fetchMyRechargeRecords]
    let pending = tasks.length
    const done = () => {
      pending -= 1
      if (pending <= 0 && callback) callback()
    }
    tasks.forEach((task) => task(done))
  })
}

function openActivityLocation(activity) {
  const target = activity || {}
  const latitude = Number(target.latitude || 0)
  const longitude = Number(target.longitude || 0)
  if (!latitude || !longitude || !wx.openLocation) {
    wx.showToast({ title: '活动暂未设置定位', icon: 'none' })
    return false
  }
  wx.openLocation({
    latitude,
    longitude,
    name: target.location || target.title || '活动地点',
    address: target.location || '',
    scale: 16
  })
  return true
}

function addToCart(product, count = 1, options = {}) {
  if (!isLoggedIn()) {
    return getCart()
  }
  const cart = getCart()
  const payType = options.payType === 'points' && Number(product.points || 0) > 0 ? 'points' : 'cash'
  const cartKey = `${product.id}::${payType}`
  const index = cart.findIndex((item) => (item.cartKey || `${item.id}::${item.payType || 'cash'}`) === cartKey)
  if (index > -1) {
    cart[index].count += count
    cart[index].payType = payType
    cart[index].cartKey = cartKey
    cart[index].points = Number(product.points || 0)
  } else {
    cart.push({
      id: product.id,
      cartKey,
      name: product.name,
      price: Number(product.price || 0),
      points: Number(product.points || 0),
      payType,
      image: product.image,
      categoryId: product.categoryId || 'activity',
      count
    })
  }
  saveCart(cart)
  return cart
}

function updateCartItem(id, delta) {
  if (!isLoggedIn()) {
    return getCart()
  }
  const target = String(id || '')
  const next = getCart()
    .map((item) => {
      const cartKey = item.cartKey || `${item.id}::${item.payType || 'cash'}`
      const matched = cartKey === target || item.id === target
      return matched ? Object.assign({}, item, { cartKey, count: item.count + delta }) : item
    })
    .filter((item) => item.count > 0)
  saveCart(next)
  return next
}

function updateCartItemPayType(id, payType) {
  if (!isLoggedIn()) {
    return getCart()
  }
  const products = getProducts()
  const changed = getCart().map((item) => {
    if ((item.cartKey || item.id) !== id) return item
    const product = products.find((entry) => entry.id === item.id)
    const points = Number(item.points || (product && product.points) || 0)
    const nextPayType = payType === 'points' && points > 0 ? 'points' : 'cash'
    return Object.assign({}, item, {
      points,
      payType: nextPayType,
      cartKey: `${item.id}::${nextPayType}`
    })
  })
  const merged = []
  changed.forEach((item) => {
    const key = item.cartKey || `${item.id}::${item.payType || 'cash'}`
    const index = merged.findIndex((entry) => (entry.cartKey || entry.id) === key)
    if (index > -1) {
      merged[index] = Object.assign({}, merged[index], { count: Number(merged[index].count || 0) + Number(item.count || 0) })
    } else {
      merged.push(Object.assign({}, item, { cartKey: key }))
    }
  })
  saveCart(merged)
  return getCart()
}

function resetCartPayTypes(payType = 'cash') {
  if (!isLoggedIn()) {
    return getCart()
  }
  const products = getProducts()
  const changed = getCart().map((item) => {
    const product = products.find((entry) => entry.id === item.id)
    const points = Number(item.points || (product && product.points) || 0)
    const nextPayType = payType === 'points' && points > 0 ? 'points' : 'cash'
    return Object.assign({}, item, {
      points,
      payType: nextPayType,
      cartKey: `${item.id}::${nextPayType}`
    })
  })
  const merged = []
  changed.forEach((item) => {
    const key = item.cartKey || `${item.id}::${item.payType || 'cash'}`
    const index = merged.findIndex((entry) => (entry.cartKey || entry.id) === key)
    if (index > -1) {
      merged[index] = Object.assign({}, merged[index], { count: Number(merged[index].count || 0) + Number(item.count || 0) })
    } else {
      merged.push(Object.assign({}, item, { cartKey: key }))
    }
  })
  saveCart(merged)
  return getCart()
}

function clearCart() {
  if (!isLoggedIn()) {
    return getCart()
  }
  return saveCart([])
}

function getCartSummary(cart = getCart()) {
  const preview = applyDrinkVoucherDiscount(cart, getMember())
  return {
    count: cart.reduce((sum, item) => sum + Number(item.count || 0), 0),
    originalTotal: preview.originalTotal,
    cashTotal: preview.cashTotal,
    pointsUsed: preview.pointsUsed,
    voucherDiscount: preview.voucherDiscount,
    voucherCountUsed: preview.voucherCountUsed,
    total: preview.payableTotal
  }
}

function isVoucherEligibleItem(item) {
  if (!item) return false
  if (item.voucherEligible === false) return false
  const categoryId = String(item.categoryId || '').trim()
  return ['classic', 'special', 'craft-beer', 'drinks'].includes(categoryId)
}

function applyDrinkVoucherDiscount(cart, member = getMember()) {
  return applyDrinkVoucherDiscountWithOptions(cart, member, {})
}

function applyDrinkVoucherDiscountWithOptions(cart, member = getMember(), options = {}) {
  const source = Array.isArray(cart) ? cart : []
  let originalTotal = 0
  let cashTotal = 0
  let pointsUsed = 0
  const items = source.map((item) => {
    const count = Math.max(0, Number(item && item.count || 0))
    const price = Math.max(0, Number(item && item.price || 0))
    const points = Math.max(0, Number(item && item.points || 0))
    const payType = item && item.payType === 'points' && points > 0 ? 'points' : 'cash'
    const subtotal = payType === 'points' ? 0 : price * count
    const originSubtotal = price * count
    const pointsSubtotal = payType === 'points' ? points * count : 0
    cashTotal += subtotal
    pointsUsed += pointsSubtotal
    originalTotal += originSubtotal
    return Object.assign({}, item, {
      payType,
      cartKey: item.cartKey || `${item.id}::${payType}`,
      points,
      subtotal,
      originSubtotal,
      pointsSubtotal,
      payableSubtotal: subtotal,
      originPrice: price,
      originPoints: points,
      voucherCountUsed: 0,
      voucherDiscount: 0
    })
  })
  return {
    items,
    originalTotal,
    cashTotal,
    pointsUsed,
    voucherDiscount: 0,
    voucherCountUsed: 0,
    payableTotal: cashTotal
  }
}

function buildCheckoutPreview(cart, member = getMember(), options = {}) {
  const useVoucher = options.useVoucher !== false
  const useBalance = options.useBalance !== false
  const voucherPreview = applyDrinkVoucherDiscountWithOptions(cart, member, { useVoucher })
  const balanceAvailable = Math.max(0, Number(member && member.balance || 0))
  const balanceUsed = useBalance ? Math.min(balanceAvailable, voucherPreview.payableTotal) : 0
  const payableTotal = Math.max(0, voucherPreview.payableTotal - balanceUsed)
  return Object.assign({}, voucherPreview, {
    useVoucher,
    useBalance,
    balanceAvailable,
    pointsAvailable: Math.max(0, Number(member && member.points || 0)),
    pointsEnough: Math.max(0, Number(member && member.points || 0)) >= Number(voucherPreview.pointsUsed || 0),
    balanceUsed,
    payableBeforeBalance: voucherPreview.payableTotal,
    payableTotal
  })
}

function getRechargeSettings() {
  const stored = wx.getStorageSync(KEYS.rechargeSettings)
  const next = stored && Array.isArray(stored.packages) && stored.packages.length
    ? Object.assign({}, defaultRechargeSettings(), stored)
    : defaultRechargeSettings()
  next.packages = normalizeRechargePackages(next.packages)
  return next
}

function fetchRechargeSettings(callback) {
  const done = (payload) => {
    if (!payload) {
      if (callback) callback(null)
      return
    }
    const next = Object.assign({}, defaultRechargeSettings(), payload)
    next.packages = normalizeRechargePackages(next.packages)
    wx.setStorageSync(KEYS.rechargeSettings, next)
    if (callback) callback(next)
  }
  if (isMerchantLoggedIn()) {
    requestMerchantApi('/api/merchant/recharge-settings', 'GET', {}, done)
    return
  }
  requestApi('/api/recharge-settings', 'GET', {}, done)
}

function saveRechargeSettings(settings, callback) {
  const next = Object.assign({}, getRechargeSettings(), settings || {})
  next.packages = normalizeRechargePackages(next.packages)
  const requested = requestMerchantApi('/api/merchant/recharge-settings', 'POST', next, (payload) => {
    if (payload) {
      const saved = Object.assign({}, next, payload)
      wx.setStorageSync(KEYS.rechargeSettings, saved)
      if (callback) callback(saved, true)
      return
    }
    if (callback) callback(null, false)
  })
  if (requested) return getRechargeSettings()
  if (callback) callback(null, false)
  return next
}

function getVoucherSettings() {
  const stored = wx.getStorageSync(KEYS.voucherSettings)
  const next = normalizeVoucherSettings(stored || {})
  return next
}

function normalizeVoucherSettings(settings) {
  const next = Object.assign({}, defaultVoucherSettings(), settings || {})
  next.buyCount = Math.max(1, Number(next.buyCount || 0))
  next.freeCount = Math.max(0, Number(next.freeCount || 0))
  next.title = String(next.title || '').trim() || defaultVoucherSettings().title
  next.ruleName = String(next.ruleName || '').trim() || `${next.buyCount}送${next.freeCount}`
  next.note = normalizeVoucherNote(next.note)
  next.expireText = String(next.expireText || '').trim() || defaultVoucherSettings().expireText
  return next
}

function fetchVoucherSettings(callback) {
  const done = (payload) => {
    if (payload) {
      const next = normalizeVoucherSettings(payload)
      wx.setStorageSync(KEYS.voucherSettings, next)
      if (callback) callback(next)
      return
    }
    if (callback) callback(null)
  }
  if (isMerchantLoggedIn()) {
    requestMerchantApi('/api/merchant/voucher-settings', 'GET', {}, done)
    return
  }
  requestApi('/api/voucher-settings', 'GET', {}, done)
}

function saveVoucherSettings(settings, callback) {
  const next = normalizeVoucherSettings(Object.assign({}, getVoucherSettings(), settings || {}))
  wx.setStorageSync(KEYS.voucherSettings, next)
  const requested = requestMerchantApi('/api/merchant/voucher-settings', 'POST', next, (payload) => {
    if (payload) {
      const saved = normalizeVoucherSettings(Object.assign({}, next, payload))
      wx.setStorageSync(KEYS.voucherSettings, saved)
      if (callback) callback(saved, true)
      return
    }
    if (callback) callback(null, false)
  })
  if (requested) return next
  if (callback) callback(null, false)
  return next
}

function grantDrinkVoucher(memberKey, count, note = '', callback) {
  const targetId = String(memberKey || '').trim()
  const amount = Number(count || 0)
  if (!targetId || !amount) {
    if (callback) callback(null, false)
    return null
  }
  const requested = requestMerchantApi(`/api/merchant/members/${encodeURIComponent(targetId)}/vouchers`, 'POST', {
    count: amount,
    note: String(note || '').trim()
  }, (payload) => {
    if (payload && payload.member) {
      syncMemberCache(payload.member)
    }
    if (payload && payload.record) {
      const logs = getVoucherLogs()
      logs.unshift(payload.record)
      saveVoucherLogs(logs)
    }
    if (callback) callback(payload, !!payload)
  })
  if (!requested) {
    if (callback) callback(null, false)
    return null
  }
  return true
}

function getRechargeRecords() {
  if (!canReadPrivateData()) {
    return []
  }
  return wx.getStorageSync(KEYS.rechargeRecords) || []
}

function saveRechargeRecords(records) {
  wx.setStorageSync(KEYS.rechargeRecords, records)
  return getRechargeRecords()
}

function fetchRechargeRecords(callback) {
  fetchMerchantList('/api/merchant/recharge-records', getRechargeRecords, saveRechargeRecords, callback)
}

function getVoucherLogs() {
  if (!canReadPrivateData()) {
    return []
  }
  return wx.getStorageSync(KEYS.voucherLogs) || []
}

function saveVoucherLogs(records) {
  wx.setStorageSync(KEYS.voucherLogs, records)
  return getVoucherLogs()
}

function fetchVoucherLogs(callback) {
  fetchMerchantList('/api/merchant/voucher-logs', getVoucherLogs, saveVoucherLogs, callback)
}

function addRechargeRecord(record) {
  const list = getRechargeRecords()
  list.unshift(
    Object.assign(
      {
        id: `RC${Date.now()}`,
        memberId: '',
        nickname: '',
        type: 'recharge',
        payAmount: 0,
        creditAmount: 0,
        balanceBefore: 0,
        balanceAfter: 0,
        operator: '',
        note: '',
        createdAt: formatTime(new Date())
      },
      record || {}
    )
  )
  return saveRechargeRecords(list)
}

function adjustMemberBalance(memberKey, delta, options = {}, callback) {
  if (!isLoggedIn() && !isMerchantContext()) {
    return null
  }
  if (typeof memberKey === 'number' || (typeof memberKey === 'string' && !Number.isNaN(Number(memberKey)) && delta && typeof delta === 'object')) {
    callback = options
    options = delta || {}
    delta = memberKey
    memberKey = ''
  }
  const amount = Number(delta || 0)
  if (!amount) return null
  const member = memberKey ? null : getMember()
  const targetId = memberKey || (member && (member.id || member.openid || member.nickname))
  if (isMerchantContext() && targetId) {
    requestMerchantApi(`/api/merchant/members/${encodeURIComponent(targetId)}/balance`, 'POST', {
      delta: amount,
      note: options.note || '手动调整余额',
      storeId: options.storeId || ''
    }, (payload) => {
      if (payload && payload.member) {
        syncMemberCache(payload.member)
      }
      if (payload && payload.record) {
        const records = getRechargeRecords()
        records.unshift(payload.record)
        saveRechargeRecords(records)
      }
      if (typeof callback === 'function') callback(payload)
    })
    return null
  }
  if (!member) return null
  const balanceBefore = Number(member.balance || 0)
  const balanceAfter = Math.max(0, balanceBefore + amount)
  const next = saveMember(Object.assign({}, member, { balance: balanceAfter }))
  addRechargeRecord({
    type: amount >= 0 ? 'recharge' : 'adjust',
    memberId: next.id || '',
    nickname: next.nickname || '',
    payAmount: Math.abs(amount),
    creditAmount: amount,
    balanceBefore,
    balanceAfter,
    operator: options.operator || '商家端',
    note: options.note || '手动调整余额'
  })
  return next
}

function rechargeMemberWithPackage(pack, options = {}) {
  if (!isLoggedIn()) {
    wx.showToast({ title: '请先微信登录', icon: 'none' })
    return null
  }
  const packageItem = pack || {}
  const payAmount = Number(packageItem.payAmount || 0)
  const creditAmount = Number(packageItem.creditAmount || 0)
  if (!payAmount || !creditAmount) {
    return null
  }
  const member = getMember()
  const balanceBefore = Number(member.balance || 0)
  const balanceAfter = balanceBefore + creditAmount
  const voucherCount = voucherCountForRecharge(packageItem, payAmount)
  const next = saveMember(Object.assign({}, member, {
    balance: balanceAfter,
    drinkVoucherCount: Math.max(0, Number(member.drinkVoucherCount || 0) + voucherCount)
  }))
  addRechargeRecord({
    type: 'recharge',
    memberId: next.id || '',
    nickname: next.nickname || '',
    packageId: packageItem.id || '',
    packageLabel: packageItem.label || '',
    payAmount,
    creditAmount,
    voucherCount,
    balanceBefore,
    balanceAfter,
    operator: options.operator || '微信支付',
    note: packageItem.tip || ''
  })
  return next
}

function getGlobalSettings() {
  const stored = wx.getStorageSync(KEYS.globalSettings)
  return normalizeGlobalSettings(stored)
}

function fetchGlobalSettings(callback) {
  const done = (settings) => {
    if (!settings) {
      if (callback) callback(null)
      return
    }
    const next = normalizeGlobalSettings(settings)
    wx.setStorageSync(KEYS.globalSettings, next)
    if (callback) callback(next)
  }
  const base = apiBaseUrl()
  if (!base) {
    done(null)
    return
  }
  wx.request({
    url: `${base}/api/global-settings`,
    method: 'GET',
    timeout: 10000,
    success(res) {
      const body = res.data || {}
      const payload = body.data || body
      if (res.statusCode >= 200 && res.statusCode < 300 && payload) {
        done(payload)
        return
      }
      done(null)
    },
    fail() {
      done(null)
    }
  })
}

function saveGlobalSettings(settings, callback) {
  const next = normalizeGlobalSettings(Object.assign({}, getGlobalSettings(), settings || {}))
  wx.setStorageSync(KEYS.globalSettings, next)
  const requested = requestMerchantApi('/api/merchant/global-settings', 'POST', next, (payload) => {
    if (!payload) {
      if (callback) callback(null, false)
      return
    }
    const saved = normalizeGlobalSettings(payload)
    wx.setStorageSync(KEYS.globalSettings, saved)
    if (callback) callback(saved, true)
  })
  if (!requested && callback) callback(null, false)
  return next
}

function getOrders() {
  if (!canReadPrivateData()) {
    return []
  }
  return wx.getStorageSync(KEYS.orders) || []
}

function saveOrders(orders) {
  wx.setStorageSync(KEYS.orders, orders)
  return getOrders()
}

function createOrder(options = {}) {
  if (!isLoggedIn()) {
    return null
  }
  const cart = getCart()
  if (!cart.length) return null
  const store = getStore()
  const table = getTableContext()
  const summary = buildCheckoutPreview(cart, getMember(), options)
  if (!summary.pointsEnough) {
    wx.showToast({ title: '积分不足', icon: 'none' })
    return null
  }
  const order = {
    id: `DY${Date.now()}`,
    storeId: store.id,
    storeName: store.shortName,
    tableNo: table && table.storeId === store.id ? table.tableNo : '',
    tableName: table && table.storeId === store.id ? table.tableName : '',
    mode: options.mode || '堂食',
    status: '待支付',
    createdAt: formatTime(new Date()),
    items: summary.items.map((item) => Object.assign({}, item)),
    originalTotal: summary.originalTotal,
    cashTotal: summary.cashTotal,
    pointsUsed: summary.pointsUsed,
    voucherDiscount: summary.voucherDiscount,
    voucherCountUsed: summary.voucherCountUsed,
    total: summary.payableTotal
  }
  const orders = getOrders()
  orders.unshift(order)
  saveOrders(orders)
  if (summary.pointsUsed) {
    const member = getMember()
    saveMember(Object.assign({}, member, {
      points: Math.max(0, Number(member.points || 0) - Number(summary.pointsUsed || 0))
    }))
  }
  recordConsumption(summary.payableTotal)
  clearCart()
  return order
}

function cancelOrder(id) {
  return updateOrderStatus(id, '已取消')
}

function updateOrderStatus(id, status, callback) {
  const orders = getOrders()
  const index = orders.findIndex((item) => item.id === id)
  if (index < 0) return null
  const requested = requestMerchantApi(`/api/merchant/orders/${encodeURIComponent(id)}/status`, 'PATCH', { status }, (payload) => {
    if (payload) {
      const current = getOrders()
      const next = current.map((item) => (item.id === payload.id ? Object.assign({}, item, payload) : item))
      saveOrders(next)
      if (callback) callback(payload, true)
      return
    }
    if (callback) callback(null, false)
  })
  if (requested) return orders[index]
  if (callback) callback(null, false)
  return orders[index]
}

function getStoreOrders(storeId, status = '全部') {
  return getOrders().filter((order) => {
    const storeMatched = !storeId || storeId === 'all' || order.storeId === storeId
    const statusMatched = status === '全部' || order.status === status
    return storeMatched && statusMatched
  })
}

function recordConsumption(amount) {
  if (!isLoggedIn()) return getMember()
  const member = getMember()
  const totalSpent = Number(member.totalSpent || 0) + Number(amount || 0)
  const points = Number(member.points || 0)
  return saveMember(
    Object.assign({}, member, {
      totalSpent,
      points,
      consumptionCount: Number(member.consumptionCount || 0) + 1,
      level: levelBySpend(totalSpent, points)
    })
  )
}

function buildPrintTemplate(order) {
  return [
    '破壳派酒吧订单小票',
    `门店：${order.storeName}`,
    `桌号：${order.tableName || (order.tableNo ? `${order.tableNo}号桌` : '未指定')}`,
    `订单号：${order.id}`,
    `下单时间：${order.createdAt}`,
    `用餐方式：${order.mode}`,
    '----------------',
    ...(order.items || []).map((item) => `${item.name} x${item.count}  ¥${Number(item.price || 0) * Number(item.count || 0)}`),
    '----------------',
    `原价：¥${order.originalTotal || order.total}`,
    ...(Number(order.voucherDiscount || 0) > 0 ? [`酒水券抵扣：¥${order.voucherDiscount}`] : []),
    ...(Number(order.balanceUsed || 0) > 0 ? [`储值卡抵扣：¥${order.balanceUsed}`] : []),
    `合计：¥${order.total}`,
    `状态：${order.status}`
  ].join('\n')
}

function savePrintLog(order, status, message) {
  const logs = wx.getStorageSync(KEYS.printLogs) || []
  logs.unshift({
    id: `PR${Date.now()}`,
    orderId: order.id,
    storeId: order.storeId,
    status,
    message,
    content: buildPrintTemplate(order),
    createdAt: formatTime(new Date())
  })
  wx.setStorageSync(KEYS.printLogs, logs)
  return logs
}

function printOrderBluetooth(order, callback) {
  const done = (status, message, extra = {}) => {
    const logs = savePrintLog(order || {}, status, message)
    if (callback) callback(Object.assign({ status, message, logs }, extra))
  }
  if (!order || !order.id) {
    done('failed', '订单不存在')
    return false
  }
  return requestMerchantApi(`/api/merchant/orders/${encodeURIComponent(order.id)}/print`, 'POST', {}, (payload) => {
    if (!payload) {
      done('failed', '云打印请求失败')
      return
    }
    const print = payload.print || {}
    done(print.status || 'sent', print.message || '已发送至芯烨云打印机', payload)
  })
}

function printOrderCloud(orderId, callback) {
  if (!orderId) {
    if (callback) callback(null)
    return false
  }
  return requestMerchantApi(`/api/merchant/orders/${encodeURIComponent(orderId)}/print`, 'POST', {}, callback)
}

function getStorePrinter(storeId) {
  const store = getStores().find((item) => item.id === storeId) || {}
  return {
    sn: store.printerSn || '',
    name: store.printerName || '',
    copies: Number(store.printerCopies || 1)
  }
}

function getSignups() {
  if (!canReadPrivateData()) {
    return []
  }
  return wx.getStorageSync(KEYS.signups) || []
}

function addSignup(activity, callback) {
  if (!isLoggedIn()) {
    if (callback) callback(null)
    return getSignups()
  }
  const currentMember = getMember()
  const signups = getSignups()
  if (isActivitySignupClosed(activity)) {
    wx.showToast({ title: '报名已截止', icon: 'none' })
    if (callback) callback(null)
    return signups
  }
  if (signups.find((item) => item.activityId === activity.id && item.memberId === currentMember.id)) {
    if (callback) callback(signups)
    return signups
  }
  const store = inferStoreByActivity(activity)
  const baseRecord = {
    activityId: activity.id,
    storeId: activity.storeId || store.id,
    storeName: activity.storeName || store.shortName,
    avatarUrl: currentMember.avatarUrl || '',
    avatarText: (currentMember.avatarText || currentMember.nickname || '会员').slice(0, 1),
    gender: currentMember.gender || ''
  }
  const mergeLocal = (signup) => {
    const next = getSignups()
    if (!next.find((item) => item.id === signup.id)) {
      next.unshift(signup)
      wx.setStorageSync(KEYS.signups, next)
      const activities = getActivities().map((item) => (item.id === activity.id ? Object.assign({}, item, { joined: Number(item.joined || 0) + 1 }) : item))
      wx.setStorageSync(KEYS.activities, activities)
    }
    return next
  }
  requestApi('/api/signups', 'POST', baseRecord, (payload) => {
    if (payload) {
      const next = mergeLocal(Object.assign({}, payload, {
        avatarUrl: payload.avatarUrl || baseRecord.avatarUrl,
        avatarText: payload.avatarText || baseRecord.avatarText,
        gender: payload.gender || baseRecord.gender
      }))
      if (callback) callback(next)
      return
    }
    if (callback) callback(null)
  })
  return getSignups()
}

function activitySignupDisplayName(signup) {
  const gender = String((signup && signup.gender) || '').trim()
  if (gender === '男') return '帅哥'
  if (gender === '女') return '美女'
  return '会员'
}

function anonymizeActivitySignup(signup, index = 0) {
  const displayName = (signup && signup.displayName) || activitySignupDisplayName(signup)
  return {
    id: (signup && signup.id) || `signup-${index}`,
    avatarUrl: (signup && signup.avatarUrl) || '',
    avatarText: displayName.slice(0, 1),
    displayName
  }
}

function fetchActivitySignups(activityId, callback) {
  const id = String(activityId || '').trim()
  if (!id) {
    if (callback) callback([])
    return
  }
  const base = apiBaseUrl()
  const fallback = () => {
    const local = getSignups()
      .filter((item) => item.activityId === id)
      .map(anonymizeActivitySignup)
    if (callback) callback(local)
  }
  if (!base) {
    fallback()
    return
  }
  wx.request({
    url: `${base}/api/activities/${encodeURIComponent(id)}/signups`,
    method: 'GET',
    timeout: 10000,
    success(res) {
      const body = res.data || {}
      const payload = body.data || body
      if (res.statusCode >= 200 && res.statusCode < 300 && Array.isArray(payload)) {
        if (callback) callback(payload.map(anonymizeActivitySignup))
        return
      }
      fallback()
    },
    fail() {
      fallback()
    }
  })
}

function fetchActivitySignupMap(activityIds, callback) {
  const ids = Array.from(new Set((activityIds || []).map((id) => String(id || '').trim()).filter(Boolean)))
  const result = {}
  if (!ids.length) {
    if (callback) callback(result)
    return
  }
  let pending = ids.length
  const done = () => {
    pending -= 1
    if (pending <= 0 && callback) callback(result)
  }
  ids.forEach((id) => {
    fetchActivitySignups(id, (list) => {
      result[id] = list || []
      done()
    })
  })
}

function inferStoreByActivity(activity) {
  const stores = getStores()
  if (activity && activity.location && activity.location.indexOf('新街口') > -1) {
    return stores.find((item) => item.id === 'xinjiekou') || stores[0] || normalizeStoreLocation(data.stores[0])
  }
  return stores[0] || normalizeStoreLocation(data.stores[0])
}

function getStoreSignups(storeId) {
  return getSignups().filter((item) => {
    const fallbackStore = item.title && item.title.indexOf('掼蛋') > -1 ? 'xinjiekou' : 'jiangning'
    return (item.storeId || fallbackStore) === storeId
  })
}

function updateSignupStatus(id, status, callback) {
  const requested = requestMerchantApi(`/api/merchant/signups/${encodeURIComponent(id)}/status`, 'PATCH', { status }, (payload) => {
    if (payload) {
      const next = getSignups().map((item) => (item.id === payload.id ? Object.assign({}, item, payload) : item))
      wx.setStorageSync(KEYS.signups, next)
      if (callback) callback(payload, true)
      return
    }
    if (callback) callback(null, false)
  })
  if (requested) return getSignups()
  if (callback) callback(null, false)
  return getSignups()
}

function getCellar() {
  if (!canReadPrivateData()) {
    return []
  }
  return wx.getStorageSync(KEYS.cellar) || []
}

function addCellar(record) {
  if (!isLoggedIn()) return getCellar()
  const list = getCellar()
  list.unshift(Object.assign({ id: `CJ${Date.now()}`, status: '审核中', createdAt: formatTime(new Date()) }, record || {}))
  wx.setStorageSync(KEYS.cellar, list)
  return list
}

function submitCellar(record, callback) {
  if (!isLoggedIn()) return getCellar()
  requestApi('/api/cellar', 'POST', record || {}, (payload) => {
    if (!payload) {
      if (callback) callback(null)
      return
    }
    const list = getCellar().filter((item) => item.id !== payload.id)
    list.unshift(payload)
    wx.setStorageSync(KEYS.cellar, list)
    if (callback) callback(payload)
  })
  return getCellar()
  const now = new Date()
  const months = Number(record.months || 3)
  const expireAt = new Date(now)
  expireAt.setMonth(expireAt.getMonth() + months)
  const list = getCellar()
  list.unshift(
    Object.assign(
      {
        id: `CJ${Date.now()}`,
        status: '审核中',
        createdAt: formatTime(now),
        expireAt: formatDate(expireAt),
        reminder: '待商家审核通过后开始存放'
      },
      record || {}
    )
  )
  wx.setStorageSync(KEYS.cellar, list)
  return list
}

function updateCellarStatus(id, status, callback) {
  if (!isMerchantContext()) {
    requestApi(`/api/cellar/${encodeURIComponent(id)}/status`, 'PATCH', { status }, (payload) => {
      if (payload) {
        const next = getCellar().map((item) => (item.id === payload.id ? Object.assign({}, item, payload) : item))
        wx.setStorageSync(KEYS.cellar, next)
        if (callback) callback(payload, true)
        return
      }
      if (callback) callback(null, false)
    })
    return getCellar()
  }
  const requested = requestMerchantApi(`/api/merchant/cellar/${encodeURIComponent(id)}/status`, 'PATCH', { status }, (payload) => {
    if (payload) {
      const next = getCellar().map((item) => (item.id === payload.id ? Object.assign({}, item, payload) : item))
      wx.setStorageSync(KEYS.cellar, next)
      if (callback) callback(payload, true)
      return
    }
    if (callback) callback(null, false)
  })
  if (requested) return getCellar()
  if (callback) callback(null, false)
  return getCellar()
}

function getStoreCellar(storeId) {
  return getCellar().filter((item) => !storeId || item.storeId === storeId)
}

function renewCellar(id, months = 3, callback) {
  if (!isMerchantContext()) {
    requestApi(`/api/cellar/${encodeURIComponent(id)}/renew`, 'POST', { months }, (payload) => {
      if (!payload) {
        if (callback) callback(null)
        return
      }
      const next = getCellar().map((item) => (item.id === payload.id ? Object.assign({}, item, payload) : item))
      wx.setStorageSync(KEYS.cellar, next)
      if (callback) callback(payload)
    })
    return getCellar()
  }
  const list = getCellar().map((item) => {
    if (item.id !== id) return item
    const date = new Date(String(item.expireAt || formatDate(new Date())).replace(/-/g, '/'))
    date.setMonth(date.getMonth() + Number(months || 3))
    return Object.assign({}, item, {
      status: '存放中',
      expireAt: formatDate(date),
      reminder: '已续存，到期前7天提醒'
    })
  })
  wx.setStorageSync(KEYS.cellar, list)
  if (callback) callback(list.find((item) => item.id === id) || null)
  return list
}

function cellarReminder(item) {
  const pendingReminder = '待商家审核通过后开始存放'
  if (item.status === '审核中') return pendingReminder
  if (item.status !== '存放中') return ''
  const today = new Date()
  const expire = new Date(String(item.expireAt || '').replace(/-/g, '/'))
  const days = Math.ceil((expire.getTime() - today.getTime()) / 86400000)
  if (days < 0) return '已到期，请尽快处理'
  if (days <= 7) return `还有${days}天到期`
  if (item.reminder === pendingReminder) return ''
  return item.reminder || ''
}

function adjustMemberPoints(memberKey, delta, reason, operator, callback) {
  if (!isLoggedIn() && !isMerchantContext()) return null
  if (typeof memberKey === 'number' || (typeof memberKey === 'string' && !Number.isNaN(Number(memberKey)) && typeof delta === 'string')) {
    callback = operator
    operator = reason
    reason = delta
    delta = memberKey
    memberKey = ''
  }
  const amount = Number(delta || 0)
  const text = String(reason || '').trim() || '手动调整积分'
  if (!amount) return null
  const member = memberKey ? null : getMember()
  const targetId = memberKey || (member && (member.id || member.openid || member.nickname))
  if (isMerchantContext() && targetId) {
    requestMerchantApi(`/api/merchant/members/${encodeURIComponent(targetId)}/points`, 'POST', {
      delta: amount,
      reason: text,
      storeId: ''
    }, (payload) => {
      if (payload && payload.member) {
        syncMemberCache(payload.member)
      }
      if (payload && payload.record) {
        const logs = wx.getStorageSync(KEYS.pointLogs) || []
        logs.unshift(payload.record)
        wx.setStorageSync(KEYS.pointLogs, logs)
      }
      if (callback) callback(payload)
    })
    return null
  }
  if (!member) return null
  const nextPoints = Math.max(0, Number(member.points || 0) + amount)
  const next = saveMember(Object.assign({}, member, { points: nextPoints, level: levelBySpend(member.totalSpent || 0, nextPoints) }))
  const logs = wx.getStorageSync(KEYS.pointLogs) || []
  logs.unshift({
    id: `PT${Date.now()}`,
    memberId: next.id || 'guest',
    nickname: next.nickname,
    delta: amount,
    reason: text,
    operator: operator || '商家端',
    createdAt: formatTime(new Date())
  })
  wx.setStorageSync(KEYS.pointLogs, logs)
  return { member: next, logs }
}

function adjustMemberPieces(memberKey, delta, reason, operator, callback) {
  if (!isLoggedIn() && !isMerchantContext()) return null
  const amount = Number(delta || 0)
  const text = String(reason || '').trim() || '手动调整碎片'
  if (!amount) return null
  const member = memberKey ? null : getMember()
  const targetId = memberKey || (member && (member.id || member.openid || member.nickname))
  if (isMerchantContext() && targetId) {
    requestMerchantApi(`/api/merchant/members/${encodeURIComponent(targetId)}/pieces`, 'POST', {
      delta: amount,
      reason: text,
      storeId: ''
    }, (payload) => {
      if (payload && payload.member) {
        syncMemberCache(payload.member)
      }
      if (payload && payload.record) {
        const logs = wx.getStorageSync(KEYS.pointLogs) || []
        logs.unshift(payload.record)
        wx.setStorageSync(KEYS.pointLogs, logs)
      }
      if (callback) callback(payload)
    })
    return null
  }
  if (!member) return null
  const nextPieces = Math.max(0, Number(member.invitePieces || 0) + amount)
  const next = saveMember(Object.assign({}, member, { invitePieces: nextPieces, gems: nextPieces }))
  const logs = wx.getStorageSync(KEYS.pointLogs) || []
  logs.unshift({
    id: `PI${Date.now()}`,
    memberId: next.id || 'guest',
    nickname: next.nickname,
    delta: amount,
    type: 'pieces',
    reason: text,
    operator: operator || '商家端',
    createdAt: formatTime(new Date())
  })
  wx.setStorageSync(KEYS.pointLogs, logs)
  if (callback) callback({ member: next, logs })
  return { member: next, logs }
}

function getPointLogs() {
  if (!canReadPrivateData()) {
    return []
  }
  return wx.getStorageSync(KEYS.pointLogs) || []
}

function syncMemberCache(member) {
  if (!member || !member.id) return
  const members = getMemberList()
  const index = members.findIndex((item) => item.id === member.id)
  if (index > -1) members[index] = Object.assign({}, members[index], member)
  else members.unshift(Object.assign({}, member))
  wx.setStorageSync(KEYS.members, members)
  const current = wx.getStorageSync(KEYS.member)
  if (current && current.id === member.id) {
    wx.setStorageSync(KEYS.member, Object.assign({}, current, member))
  }
}

function fetchPointLogs(callback) {
  fetchMerchantList('/api/merchant/point-logs', getPointLogs, (list) => wx.setStorageSync(KEYS.pointLogs, list), callback)
}

function defaultInventory() {
  return getProducts().map((item, index) => ({
    id: item.id,
    stock: 30 + index * 5
  }))
}

function getInventory() {
  const stored = wx.getStorageSync(KEYS.inventory) || defaultInventory()
  return getProducts().map((product) => {
    const stockItem = stored.find((item) => item.id === product.id)
    return Object.assign({}, product, {
      stock: stockItem ? Number(stockItem.stock || 0) : 0
    })
  })
}

function saveInventoryItems(items) {
  const list = (items || []).map((item) => ({
    id: item.id,
    stock: Number(item.stock || 0)
  }))
  wx.setStorageSync(KEYS.inventory, list)
  return getInventory()
}

function fetchInventory(callback) {
  requestMerchantApi('/api/merchant/inventory', 'GET', {}, (payload) => {
    if (Array.isArray(payload)) {
      saveInventoryItems(payload)
      if (callback) callback(payload)
      return
    }
    if (callback) callback(null)
  })
}

function ensureProductStock(id) {
  const stored = wx.getStorageSync(KEYS.inventory) || defaultInventory()
  if (!stored.find((item) => item.id === id)) {
    stored.push({ id, stock: 30 })
    wx.setStorageSync(KEYS.inventory, stored)
  }
}

function updateProductStock(id, delta, callback) {
  const requested = requestMerchantApi(`/api/merchant/inventory/${encodeURIComponent(id)}/stock`, 'PATCH', { delta: Number(delta || 0) }, (payload) => {
    if (payload) {
      const serverInventory = (wx.getStorageSync(KEYS.inventory) || []).filter((item) => item.id !== id)
      serverInventory.push({ id, stock: Number(payload.stock || 0) })
      wx.setStorageSync(KEYS.inventory, serverInventory)
      if (callback) fetchInventory((items) => callback(items, true))
      return
    }
    if (callback) callback(null, false)
  })
  if (requested) return getInventory()
  if (callback) callback(null, false)
  return getInventory()
}

function getBoardGameReservations(storeId) {
  return getOrders().filter((order) => {
    const storeMatched = !storeId || order.storeId === storeId
    const hasBoardItem = (order.items || []).some((item) => item.categoryId === 'packages')
    return storeMatched && hasBoardItem
  })
}

function normalizeLeaderboardList(list) {
  const source = Array.isArray(list) ? list : []
  const hasSortOrder = source.some((item) => item && item.sortOrder !== undefined && item.sortOrder !== null && String(item.sortOrder).trim() !== '')
  const next = source.map((item, index) => ({
    id: item.id || `rank-${Date.now()}-${index}`,
    username: String(item.username || ''),
    score: Number(item.score || 0),
    memberId: String(item.memberId || '').trim(),
    source: String(item.source || '').trim(),
    storeId: String(item.storeId || '').trim(),
    sortOrder: hasSortOrder ? toSortOrder(item.sortOrder, index + 1) : index + 1
  }))
  next.sort((a, b) => {
    if (hasSortOrder) {
      const orderDiff = Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
      if (orderDiff !== 0) return orderDiff
    } else {
      const scoreDiff = Number(b.score || 0) - Number(a.score || 0)
      if (scoreDiff !== 0) return scoreDiff
    }
    return String(a.username || '').localeCompare(String(b.username || ''))
  })
  return next.map((item, index) => Object.assign({}, item, { sortOrder: index + 1 }))
}

function normalizeLeaderboardBoards(payload) {
  if (Array.isArray(payload)) {
    const list = normalizeLeaderboardList(payload)
    return {
      weekly: list.slice(),
      monthly: list.slice(),
      yearly: list.slice()
    }
  }
  const source = payload && typeof payload === 'object' ? payload : {}
  return LEADERBOARD_TYPES.reduce((boards, type) => {
    boards[type] = normalizeLeaderboardList(source[type] || [])
    return boards
  }, {})
}

function rankLeaderboardList(list) {
  return normalizeLeaderboardList(list)
    .map((item, index) => Object.assign({}, item, { rank: index + 1 }))
}

function getLeaderboardBoards() {
  const stored = wx.getStorageSync(KEYS.leaderboard)
  const boards = normalizeLeaderboardBoards(stored || {})
  wx.setStorageSync(KEYS.leaderboard, boards)
  return boards
}

function getLeaderboard(type = 'weekly') {
  const boards = getLeaderboardBoards()
  const list = boards[type] || boards.weekly
  return rankLeaderboardList(list)
}

function fetchPublicLeaderboard(callback, type = 'weekly') {
  const base = apiBaseUrl()
  if (!base) {
    if (callback) callback(null)
    return
  }
  wx.request({
    url: `${base}/api/leaderboard`,
    method: 'GET',
    timeout: 10000,
    success(res) {
      const body = res.data || {}
      const payload = body.data || body
      if (res.statusCode >= 200 && res.statusCode < 300 && payload) {
        wx.setStorageSync(KEYS.leaderboard, normalizeLeaderboardBoards(payload))
        if (callback) callback(getLeaderboard(type))
        return
      }
      if (callback) callback(null)
    },
    fail() {
      if (callback) callback(null)
    }
  })
}

function fetchLeaderboard(callback, type = 'weekly') {
  requestMerchantApi('/api/merchant/leaderboard', 'GET', {}, (payload) => {
    if (payload) {
      wx.setStorageSync(KEYS.leaderboard, normalizeLeaderboardBoards(payload))
      if (callback) callback(getLeaderboard(type))
      return
    }
    if (callback) callback(null)
  })
}

function saveLeaderboard(list, callback, type = 'weekly', storeId = '') {
  const boards = getLeaderboardBoards()
  const nextList = normalizeLeaderboardList(list).map((item, index) => Object.assign({}, item, { sortOrder: index + 1 }))
  boards[type] = nextList
  const requested = requestMerchantApi('/api/merchant/leaderboard', 'POST', { type, list: boards[type] }, (payload) => {
    if (payload) {
      wx.setStorageSync(KEYS.leaderboard, normalizeLeaderboardBoards(payload))
      if (callback) callback(getLeaderboard(type), true)
      return
    }
    if (callback) callback(null, false)
  })
  if (requested) return getLeaderboard(type)
  if (callback) callback(null, false)
  return getLeaderboard(type)
}

function saveLeaderboardBoards(boards, callback, type = 'weekly') {
  const nextBoards = normalizeLeaderboardBoards(boards)
  const requested = requestMerchantApi('/api/merchant/leaderboard', 'POST', { boards: nextBoards }, (payload) => {
    if (payload) {
      wx.setStorageSync(KEYS.leaderboard, normalizeLeaderboardBoards(payload))
      if (callback) callback(getLeaderboard(type), true)
      return
    }
    if (callback) callback(null, false)
  })
  if (requested) return getLeaderboard(type)
  if (callback) callback(null, false)
  return getLeaderboard(type)
}

function leaderboardIdentity(record) {
  return String(record && (record.memberId || record.username || record.id) || '').trim()
}

function addLeaderboardUser(record, callback, type = 'weekly', storeId = '') {
  const boards = getLeaderboardBoards()
  const id = `rank-${Date.now()}`
  LEADERBOARD_TYPES.forEach((key) => {
    const list = boards[key] || []
    const identity = String(record.memberId || record.username || '').trim()
    const exists = identity && normalizeLeaderboardList(list).some((item) => leaderboardIdentity(item) === identity)
    if (!exists) {
      list.push({
        id,
        memberId: record.memberId || '',
        username: record.username,
        score: Number(record.score || 0)
      })
    }
    boards[key] = normalizeLeaderboardList(list)
      .sort((a, b) => b.score - a.score || Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
      .map((item, index) => Object.assign({}, item, { sortOrder: index + 1 }))
  })
  return saveLeaderboardBoards(boards, callback, type)
}

function updateLeaderboardRank(id, direction, callback, type = 'weekly', storeId = '') {
  const boards = getLeaderboardBoards()
  const list = normalizeLeaderboardList(boards[type] || [])
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
  const index = list.findIndex((item) => item.id === id)
  const target = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || target < 0 || target >= list.length) {
    return getLeaderboard(type)
  }
  const next = list.slice()
  const temp = next[index]
  next[index] = next[target]
  next[target] = temp
  return saveLeaderboard(next, callback, type)
}

function adjustLeaderboardScore(id, delta, callback, type = 'weekly', storeId = '') {
  const amount = Number(delta || 0)
  if (!id || !amount) return getLeaderboard(type)
  const boards = getLeaderboardBoards()
  const source = normalizeLeaderboardList(boards[type] || []).find((item) => item.id === id)
  const identity = leaderboardIdentity(source) || id
  LEADERBOARD_TYPES.forEach((key) => {
    const list = boards[key] || []
    const normalized = normalizeLeaderboardList(list)
    const hasTarget = normalized.some((item) => item.id === id || leaderboardIdentity(item) === identity)
    const withTarget = hasTarget || !source || amount < 0
      ? normalized
      : normalized.concat(Object.assign({}, source, {
          id: source.id || `rank-${Date.now()}`,
          score: 0
        }))
    boards[key] = withTarget
      .map((item) => (item.id === id || leaderboardIdentity(item) === identity ? Object.assign({}, item, { score: Math.max(0, Number(item.score || 0) + amount) }) : item))
      .sort((a, b) => b.score - a.score || Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
      .map((item, index) => Object.assign({}, item, { sortOrder: index + 1 }))
  })
  return saveLeaderboardBoards(boards, callback, type)
}

function deleteLeaderboardUser(id, callback, type = 'weekly', storeId = '') {
  if (!id) return getLeaderboard(type)
  const boards = getLeaderboardBoards()
  const source = normalizeLeaderboardList(boards[type] || []).find((item) => item.id === id)
  const identity = leaderboardIdentity(source) || id
  LEADERBOARD_TYPES.forEach((key) => {
    const list = boards[key] || []
    boards[key] = normalizeLeaderboardList(list).filter((item) => item.id !== id && leaderboardIdentity(item) !== identity)
  })
  return saveLeaderboardBoards(boards, callback, type)
}

function getDataOverview() {
  const stores = getStores()
  const orders = getOrders()
  const signups = getSignups()
  const cellar = getCellar()
  const members = getMemberList()
  return {
    storeCount: stores.length,
    orderCount: orders.length,
    memberCount: members.length,
    cellarCount: cellar.length,
    signupCount: signups.length,
    totalSales: orders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    totalRecharge: getRechargeRecords().reduce((sum, record) => sum + Number(record.creditAmount || 0), 0)
  }
}

function fetchDataOverview(callback) {
  requestMerchantApi('/api/merchant/data/overview', 'GET', {}, (payload) => {
    if (payload && typeof payload === 'object') {
      if (callback) callback(payload)
      return
    }
    if (callback) callback(getDataOverview())
  })
}

function getMemberList() {
  return (wx.getStorageSync(KEYS.members) || []).filter((item) => item && !item.isGuest)
}

function fetchDataExport(callback) {
  requestMerchantText('/api/merchant/data/export', 'GET', {}, (content) => {
    if (callback) callback(content || exportDataSummary())
  })
}

function exportDataSummary() {
  const overview = getDataOverview()
  const stores = getStores()
  const orders = getOrders()
  const members = getMemberList()
  const cellar = getCellar()
  const lines = [
    '门店统计导出',
    `门店数：${overview.storeCount}`,
    `订单数：${overview.orderCount}`,
    `会员数：${overview.memberCount}`,
    `存酒数：${overview.cellarCount}`,
    `报名数：${overview.signupCount}`,
    `订单总额：${overview.totalSales}`,
    `充值总额：${overview.totalRecharge}`,
    '',
    '门店列表：',
    ...stores.map((item) => `${item.shortName || item.name} | ${item.status} | ${item.address || ''}`),
    '',
    '订单列表：',
    ...(orders.length ? orders.map((item) => `${item.id} | ${item.storeName} | ${item.status} | ${item.total} | ${item.createdAt}`) : ['暂无订单']),
    '',
    '会员列表：',
    ...(members.length ? members.map((item) => `${item.id || ''} | ${item.nickname || ''} | 余额 ${item.balance || 0} | 积分 ${item.points || 0}`) : ['暂无会员']),
    '',
    '存酒列表：',
    ...(cellar.length ? cellar.map((item) => `${item.id} | ${item.storeName || ''} | ${item.wineName || ''} | ${item.quantity || ''} | ${item.status || ''}`) : ['暂无存酒'])
  ]
  return lines.join('\n')
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatTime(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

ensureSeed()

module.exports = {
  ensureSeed,
  syncServerData,
  resetUserSession,
  isLoggedIn,
  loginWithWeChat,
  requireLogin,
  resolvePendingWechatLogin,
  requestApi,
  fetchMerchantOrders,
  uploadMerchantMedia,
  createOrderWithWechatPay,
  rechargeWithWechatPay,
  merchantLogin,
  merchantLogout,
  getMerchantSession,
  isMerchantLoggedIn,
  isSuperMerchant,
  requireMerchantLogin,
  fetchStaffAccounts,
  saveStaffAccount,
  deleteStaffAccount,
  getStores,
  fetchStores,
  fetchMerchantStores,
  saveStores,
  updateStore,
  deleteStore,
  getStore,
  setStore,
  isStoreGuideDone,
  markStoreGuideDone,
  selectNearestStore,
  requestNearestStore,
  formatDistance,
  storeIdByTableNo,
  getTableContext,
  setTableContext,
  clearTableContext,
  parseTablePayload,
  applyTablePayload,
  openStoreLocation,
  getCart,
  addToCart,
  updateCartItem,
  updateCartItemPayType,
  resetCartPayTypes,
  clearCart,
  getCartSummary,
  getProducts,
  isProductVisibleInStore,
  fetchCategories,
  fetchProducts,
  fetchMerchantProducts,
  getCategories,
  fetchMerchantCategories,
  saveProductCategory,
  deleteProductCategory,
  saveCategoryOrder,
  fetchTableQrcodes,
  generateTableQrcodes,
  getProductCategories,
  moveItemByDirection,
  updateCategoryOrder,
  updateProduct,
  deleteProduct,
  getActivities,
  fetchActivities,
  fetchMerchantActivities,
  getActivity,
  saveActivities,
  updateActivity,
  deleteActivity,
  isActivitySignupClosed,
  openActivityLocation,
  getMember,
  fetchMyProfile,
  fetchMyOrders,
  fetchMySignups,
  fetchMyCellar,
  fetchMyRechargeRecords,
  saveMember,
  updateMyProfile,
  updateNickname,
  loginWithWeChat,
  loginWithPhoneNumber,
  ensureMemberAvatar,
  logoutUser,
  getRechargeSettings,
  fetchRechargeSettings,
  saveRechargeSettings,
  getVoucherSettings,
  fetchVoucherSettings,
  saveVoucherSettings,
  getRechargeRecords,
  fetchRechargeRecords,
  addRechargeRecord,
  adjustMemberBalance,
  rechargeMemberWithPackage,
  buildCheckoutPreview,
  getGlobalSettings,
  fetchGlobalSettings,
  saveGlobalSettings,
  getDataOverview,
  fetchDataOverview,
  fetchDataExport,
  fetchMerchantBasics,
  getMemberList,
  exportDataSummary,
  getOrders,
  createOrder,
  cancelOrder,
  getStoreOrders,
  updateOrderStatus,
  grantDrinkVoucher,
  printOrderBluetooth,
  printOrderCloud,
  getStorePrinter,
  buildPrintTemplate,
  getSignups,
  fetchActivitySignups,
  fetchActivitySignupMap,
  addSignup,
  getStoreSignups,
  updateSignupStatus,
  addCellar,
  getCellar,
  getStoreCellar,
  submitCellar,
  updateCellarStatus,
  renewCellar,
  cellarReminder,
  adjustMemberPoints,
  adjustMemberPieces,
  getPointLogs,
  fetchPointLogs,
  getVoucherLogs,
  fetchVoucherLogs,
  getInventory,
  fetchInventory,
  updateProductOrder,
  saveProductOrder,
  updateProductStock,
  getBoardGameReservations,
  getLeaderboard,
  fetchPublicLeaderboard,
  fetchLeaderboard,
  addLeaderboardUser,
  updateLeaderboardRank,
  adjustLeaderboardScore,
  deleteLeaderboardUser,
  saveLeaderboard,
  saveLeaderboardBoards,
  getLeaderboardBoards,
  merchantLogout,
  leaderboardTabs: LEADERBOARD_TABS
}
