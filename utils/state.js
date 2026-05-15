const data = require('./data')
const config = require('./config')

const KEYS = {
  store: 'deyou_selected_store',
  cart: 'deyou_cart',
  orders: 'deyou_orders',
  signups: 'deyou_signups',
  member: 'deyou_member',
  auth: 'deyou_auth',
  cellar: 'deyou_cellar',
  members: 'deyou_members',
  leaderboard: 'deyou_leaderboard',
  merchantAuth: 'deyou_merchant_auth',
  products: 'deyou_products',
  activities: 'deyou_activities',
  inventory: 'deyou_inventory',
  pointLogs: 'deyou_point_logs',
  printLogs: 'deyou_print_logs',
  rechargeSettings: 'deyou_recharge_settings',
  rechargeRecords: 'deyou_recharge_records',
  stores: 'deyou_stores',
  tableContext: 'deyou_table_context',
  globalSettings: 'deyou_global_settings'
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

function ensureSeed() {
  if (!wx.getStorageSync(KEYS.store)) wx.setStorageSync(KEYS.store, data.stores[0].id)
  if (!wx.getStorageSync(KEYS.cart)) wx.setStorageSync(KEYS.cart, [])
  if (!wx.getStorageSync(KEYS.orders)) wx.setStorageSync(KEYS.orders, [])
  if (!wx.getStorageSync(KEYS.signups)) wx.setStorageSync(KEYS.signups, [])
  if (!wx.getStorageSync(KEYS.cellar)) wx.setStorageSync(KEYS.cellar, [])
  if (!wx.getStorageSync(KEYS.members)) wx.setStorageSync(KEYS.members, [Object.assign({}, data.member)])
  if (!wx.getStorageSync(KEYS.leaderboard)) wx.setStorageSync(KEYS.leaderboard, data.leaderboard)
  if (!wx.getStorageSync(KEYS.products)) wx.setStorageSync(KEYS.products, data.products)
  if (!wx.getStorageSync(KEYS.activities)) wx.setStorageSync(KEYS.activities, normalizeActivities(data.activities))
  if (!wx.getStorageSync(KEYS.inventory)) wx.setStorageSync(KEYS.inventory, defaultInventory())
  if (!wx.getStorageSync(KEYS.pointLogs)) wx.setStorageSync(KEYS.pointLogs, [])
  if (!wx.getStorageSync(KEYS.printLogs)) wx.setStorageSync(KEYS.printLogs, [])
  if (!wx.getStorageSync(KEYS.rechargeSettings)) wx.setStorageSync(KEYS.rechargeSettings, defaultRechargeSettings())
  if (!wx.getStorageSync(KEYS.rechargeRecords)) wx.setStorageSync(KEYS.rechargeRecords, [])
  if (!wx.getStorageSync(KEYS.stores)) wx.setStorageSync(KEYS.stores, data.stores)
  if (!wx.getStorageSync(KEYS.globalSettings)) wx.setStorageSync(KEYS.globalSettings, defaultGlobalSettings())
  migrateBrandNames()
}

function migrateBrandNames() {
  const keys = [
    KEYS.stores,
    KEYS.products,
    KEYS.activities,
    KEYS.leaderboard,
    KEYS.globalSettings,
    KEYS.rechargeSettings,
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

function resetUserSession() {
  userSessionLoggedIn = false
  guestSessionMember = null
  userSessionId = `${Date.now()}-${Math.random()}`
}

function defaultRechargeSettings() {
  return {
    title: '储值账户',
    note: '一经充值，概不退回，不兑现',
    paymentLabel: '微信支付',
    packages: [
      { id: 'pkg-999', payAmount: 999, creditAmount: 1200, label: '充999元', subLabel: '得1200元', tip: '' },
      { id: 'pkg-2000', payAmount: 2000, creditAmount: 2400, label: '充2000元', subLabel: '得2400元', tip: '' },
      { id: 'pkg-3000', payAmount: 3000, creditAmount: 3600, label: '充3000元', subLabel: '得3600元', tip: '赠送价值800元黑金会员/月卡' }
    ]
  }
}

function defaultPrintTemplate() {
  return [
    '<CB>破壳派酒吧</CB>',
    '<C>{{storeName}}</C>',
    '------------------------------',
    '订单号：{{orderId}}',
    '门店：{{storeName}}',
    '时间：{{createdAt}}',
    '类型：{{mode}}',
    '桌号：{{tableName}}',
    '------------------------------',
    '<B>商品明细</B>',
    '{{items}}',
    '------------------------------',
    '<RIGHT>合计：{{total}}</RIGHT>',
    '状态：{{status}}',
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
    videoTitle: '门店视频专区',
    videoUrl: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
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
    joinUsImage: '/assets/hero-bar.svg'
  }
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
  next.joinUsTitle = String(next.joinUsTitle || defaults.joinUsTitle)
  next.joinUsText = String(next.joinUsText || defaults.joinUsText)
  next.joinUsImage = String(next.joinUsImage || defaults.joinUsImage)
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

function updateNickname(nickname) {
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
  return saveMember(Object.assign({}, member, { nickname: value, avatarText: value.slice(0, 1) }))
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
      avatarUrl: profile && profile.avatarUrl ? profile.avatarUrl : ''
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
  const nickname = serverMember.nickname || identity.nickname || base.nickname || generateNickname()
  return Object.assign({}, base, serverMember, {
    id: serverMember.id || identity.memberId || openid || base.id || `DY${Date.now()}`,
    openid,
    unionid,
    token: identity.token || serverMember.token || '',
    nickname,
    avatarUrl: serverMember.avatarUrl || identity.avatarUrl || base.avatarUrl || '',
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
    invitePieces: Number(serverMember.invitePieces !== undefined ? serverMember.invitePieces : base.invitePieces || 0)
  })
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
          syncMemberRegistry(next)
          wx.showToast({ title: '登录成功', icon: 'success' })
          if (callback) callback(next)
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
  requestApi(
    '/api/wechat/pay/order',
    'POST',
    {
      storeId: store.id,
      tableNo: table && table.storeId === store.id ? table.tableNo : '',
      tableName: table && table.storeId === store.id ? table.tableName : '',
      mode: options.mode || '堂食',
      items: cart.map((item) => Object.assign({}, item))
    },
    (payload) => {
      if (!payload || !payload.payment) {
        if (callback) callback(null)
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
        clearCart()
        wx.showToast({ title: '支付成功', icon: 'success' })
        if (callback) callback(order)
      })
    }
  )
  return true
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
        loginWithWeChat(callback)
      }
    }
  })
  return false
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
      token: payload.token,
      loginAt: formatTime(new Date())
    }
    wx.setStorageSync(KEYS.merchantAuth, session)
    done(session)
  })
  const localAccount = defaultMerchantAccounts().find((item) => item.username === username && item.password === password)
  return localAccount || null
}

function merchantLogout() {
  wx.removeStorageSync(KEYS.merchantAuth)
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
  const done = () => {
    if (callback) callback(getOrders())
  }
  const base = apiBaseUrl()
  const session = getMerchantSession()
  if (!base || !session || !session.token) {
    done()
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
      }
      done()
    },
    fail() {
      done()
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
      cover: '/assets/hero-bar.svg'
    },
    xinjiekou: {
      latitude: 32.0431,
      longitude: 118.7847,
      businessHours: '14:00 - 05:00',
      cover: '/assets/hero-bar.svg'
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
    return data.stores.map(normalizeStoreLocation)
  }
  const normalized = stored.map(normalizeStoreLocation)
  const missing = data.stores
    .filter((defaultStore) => !normalized.find((store) => store.id === defaultStore.id))
    .map(normalizeStoreLocation)
  if (missing.length) {
    const next = normalized.concat(missing)
    wx.setStorageSync(KEYS.stores, next)
    return next
  }
  return normalized
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
    if (callback) callback(fallback())
  })
}

function fetchStores(callback) {
  const done = (stores) => {
    if (callback) callback(stores || getStores())
  }
  const base = apiBaseUrl()
  if (!base) {
    done()
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
      done()
    },
    fail() {
      done()
    }
  })
}

function fetchMerchantStores(callback) {
  requestMerchantApi('/api/merchant/stores', 'GET', {}, (payload) => {
    if (Array.isArray(payload)) {
      const saved = saveStores(payload)
      if (callback) callback(saved)
      return
    }
    if (callback) callback(getStores())
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
    cover: store.cover || '/assets/hero-bar.svg',
    printerSn: String(store.printerSn || '').trim(),
    printerName: String(store.printerName || '').trim(),
    printerCopies: Math.max(1, Number(store.printerCopies || 1))
  })
  const index = list.findIndex((item) => item.id === id)
  const next = index > -1 ? list.map((item) => (item.id === id ? Object.assign({}, item, nextStore) : item)) : list.concat(nextStore)
  const saved = saveStores(next)
  requestMerchantApi('/api/merchant/stores', 'POST', nextStore, (serverStore) => {
    if (serverStore) {
      const current = getStores()
      const serverNext = normalizeStoreLocation(serverStore)
      saveStores(current.map((item) => (item.id === serverNext.id ? Object.assign({}, item, serverNext) : item)))
    }
    if (callback) callback(serverStore)
  })
  return saved
}

function getStore() {
  const id = wx.getStorageSync(KEYS.store) || data.stores[0].id
  const stores = getStores()
  return stores.find((item) => item.id === id) || stores[0] || normalizeStoreLocation(data.stores[0])
}

function setStore(id) {
  wx.setStorageSync(KEYS.store, id)
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
  setStore(next.storeId)
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
  return wx.getStorageSync(KEYS.cart) || []
}

function saveCart(cart) {
  wx.setStorageSync(KEYS.cart, cart)
  return getCart()
}

function getProducts() {
  const stored = wx.getStorageSync(KEYS.products)
  if (!Array.isArray(stored) || !stored.length) {
    return data.products
  }
  const missing = data.products.filter((defaultProduct) => !stored.find((product) => product.id === defaultProduct.id))
  if (missing.length) {
    const next = stored.concat(missing)
    wx.setStorageSync(KEYS.products, next)
    return next
  }
  return stored
}

function isDefaultProduct(product) {
  return data.products.some((item) => item.id === product.id)
}

function isProductVisibleInStore(product, storeId) {
  if (!product) return false
  if (product.storeId) return product.storeId === storeId
  return isDefaultProduct(product)
}

function getCategoryName(categoryId, products = getProducts()) {
  const category = data.categories.find((item) => item.id === categoryId)
  if (category) return category.name
  const product = products.find((item) => item.categoryId === categoryId && item.categoryName)
  return product ? product.categoryName : categoryId
}

function getProductCategories(products = getProducts(), options = {}) {
  const includeEmpty = options.includeEmpty !== false
  const categoryMap = new Map()
  if (includeEmpty) {
    data.categories.forEach((category) => categoryMap.set(category.id, category.name))
  }
  products.forEach((product) => {
    if (!product.categoryId) return
    if (!includeEmpty || !categoryMap.has(product.categoryId)) {
      categoryMap.set(product.categoryId, product.categoryName || getCategoryName(product.categoryId, products))
    }
  })
  const orderedDefaults = data.categories
    .filter((category) => categoryMap.has(category.id))
    .map((category) => ({ id: category.id, name: categoryMap.get(category.id) }))
  const extras = Array.from(categoryMap.entries())
    .filter(([id]) => !data.categories.find((category) => category.id === id))
    .map(([id, name]) => ({ id, name }))
  return orderedDefaults.concat(extras)
}

function saveProducts(products) {
  wx.setStorageSync(KEYS.products, products)
  return getProducts()
}

function fetchProducts(callback) {
  const done = (products) => {
    if (callback) callback(products || getProducts())
  }
  const base = apiBaseUrl()
  if (!base) {
    done()
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
        done(saveProducts(payload))
        return
      }
      done()
    },
    fail() {
      done()
    }
  })
}

function updateProduct(product) {
  const list = getProducts()
  const id = product.id || `prd-${Date.now()}`
  const categoryId = product.categoryId || 'dishes'
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
    storeId: product.storeId === undefined ? '' : String(product.storeId || '')
  }
  const index = list.findIndex((item) => item.id === id)
  const next = index > -1 ? list.map((item) => (item.id === id ? Object.assign({}, item, nextProduct) : item)) : [nextProduct].concat(list)
  saveProducts(next)
  ensureProductStock(id)
  requestMerchantApi('/api/merchant/products', 'POST', nextProduct)
  return getProducts()
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

function normalizeActivity(activity, index = 0) {
  const fallbackStore = inferStoreByActivity(activity)
  const joined = Number(activity.joined || 0)
  const quota = Number(activity.quota || 10)
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
    const next = normalizeActivities(data.activities)
    wx.setStorageSync(KEYS.activities, next)
    return next
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

function updateActivity(activity) {
  const list = getActivities()
  const id = activity.id || `act-${Date.now()}`
  const nextActivity = normalizeActivity(Object.assign({}, activity, { id }))
  const index = list.findIndex((item) => item.id === id)
  const next = index > -1 ? list.map((item) => (item.id === id ? Object.assign({}, item, nextActivity) : item)) : [nextActivity].concat(list)
  const saved = saveActivities(next)
  requestMerchantApi('/api/merchant/activities', 'POST', nextActivity)
  return saved
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

function addToCart(product, count = 1) {
  if (!isLoggedIn()) {
    return getCart()
  }
  const cart = getCart()
  const index = cart.findIndex((item) => item.id === product.id)
  if (index > -1) {
    cart[index].count += count
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: Number(product.price || 0),
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
  const next = getCart()
    .map((item) => (item.id === id ? Object.assign({}, item, { count: item.count + delta }) : item))
    .filter((item) => item.count > 0)
  saveCart(next)
  return next
}

function clearCart() {
  if (!isLoggedIn()) {
    return getCart()
  }
  return saveCart([])
}

function getCartSummary(cart = getCart()) {
  return cart.reduce(
    (sum, item) => {
      sum.count += Number(item.count || 0)
      sum.total += Number(item.price || 0) * Number(item.count || 0)
      return sum
    },
    { count: 0, total: 0 }
  )
}

function getRechargeSettings() {
  const stored = wx.getStorageSync(KEYS.rechargeSettings)
  return stored && Array.isArray(stored.packages) && stored.packages.length ? stored : defaultRechargeSettings()
}

function fetchRechargeSettings(callback) {
  requestMerchantApi('/api/merchant/recharge-settings', 'GET', {}, (payload) => {
    const next = payload ? Object.assign({}, defaultRechargeSettings(), payload) : getRechargeSettings()
    next.packages = Array.isArray(next.packages) && next.packages.length ? next.packages : defaultRechargeSettings().packages
    wx.setStorageSync(KEYS.rechargeSettings, next)
    if (callback) callback(next)
  })
}

function saveRechargeSettings(settings, callback) {
  const next = Object.assign({}, getRechargeSettings(), settings || {})
  next.packages = Array.isArray(next.packages) && next.packages.length ? next.packages : defaultRechargeSettings().packages
  wx.setStorageSync(KEYS.rechargeSettings, next)
  requestMerchantApi('/api/merchant/recharge-settings', 'POST', next, (payload) => {
    if (payload) {
      const saved = Object.assign({}, next, payload)
      wx.setStorageSync(KEYS.rechargeSettings, saved)
      if (callback) callback(saved)
      return
    }
    if (callback) callback(null)
  })
  return next
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
        const members = getMemberList()
        const index = members.findIndex((item) => item.id === payload.member.id)
        if (index > -1) members[index] = payload.member
        else members.unshift(payload.member)
        wx.setStorageSync(KEYS.members, members)
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
  const next = saveMember(Object.assign({}, member, { balance: balanceAfter }))
  addRechargeRecord({
    type: 'recharge',
    memberId: next.id || '',
    nickname: next.nickname || '',
    packageId: packageItem.id || '',
    packageLabel: packageItem.label || '',
    payAmount,
    creditAmount,
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
    const next = settings ? normalizeGlobalSettings(settings) : getGlobalSettings()
    wx.setStorageSync(KEYS.globalSettings, next)
    if (callback) callback(next)
  }
  const base = apiBaseUrl()
  if (!base) {
    done()
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
      done()
    },
    fail() {
      done()
    }
  })
}

function saveGlobalSettings(settings) {
  const next = normalizeGlobalSettings(Object.assign({}, getGlobalSettings(), settings || {}))
  wx.setStorageSync(KEYS.globalSettings, next)
  requestMerchantApi('/api/merchant/global-settings', 'POST', next)
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
  const summary = getCartSummary(cart)
  const order = {
    id: `DY${Date.now()}`,
    storeId: store.id,
    storeName: store.shortName,
    tableNo: table && table.storeId === store.id ? table.tableNo : '',
    tableName: table && table.storeId === store.id ? table.tableName : '',
    mode: options.mode || '堂食',
    status: '待支付',
    createdAt: formatTime(new Date()),
    items: cart.map((item) => Object.assign({}, item)),
    total: summary.total
  }
  const orders = getOrders()
  orders.unshift(order)
  saveOrders(orders)
  recordConsumption(summary.total)
  clearCart()
  return order
}

function cancelOrder(id) {
  return updateOrderStatus(id, '已取消')
}

function updateOrderStatus(id, status) {
  const orders = getOrders()
  const index = orders.findIndex((item) => item.id === id)
  if (index < 0) return null
  orders[index] = Object.assign({}, orders[index], { status })
  saveOrders(orders)
  requestMerchantApi(`/api/merchant/orders/${id}/status`, 'PATCH', { status })
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
  const points = Number(member.points || 0) + Math.floor(Number(amount || 0))
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

function addSignup(activity) {
  if (!isLoggedIn()) return getSignups()
  const signups = getSignups()
  if (!signups.find((item) => item.id === activity.id)) {
    const store = inferStoreByActivity(activity)
    signups.unshift({
      id: activity.id,
      title: activity.title,
      date: activity.date,
      storeId: store.id,
      storeName: store.shortName,
      price: activity.price,
      status: '已报名',
      createdAt: formatTime(new Date())
    })
    wx.setStorageSync(KEYS.signups, signups)
    updateActivity(Object.assign({}, activity, { joined: Number(activity.joined || 0) + 1 }))
  }
  return signups
}

function inferStoreByActivity(activity) {
  if (activity && activity.location && activity.location.indexOf('新街口') > -1) {
    return data.stores.find((item) => item.id === 'xinjiekou') || data.stores[0]
  }
  return data.stores[0]
}

function getStoreSignups(storeId) {
  return getSignups().filter((item) => {
    const fallbackStore = item.title && item.title.indexOf('掼蛋') > -1 ? 'xinjiekou' : 'jiangning'
    return (item.storeId || fallbackStore) === storeId
  })
}

function updateSignupStatus(id, status, callback) {
  const signups = getSignups().map((item) => (item.id === id ? Object.assign({}, item, { status }) : item))
  wx.setStorageSync(KEYS.signups, signups)
  requestMerchantApi(`/api/merchant/signups/${encodeURIComponent(id)}/status`, 'PATCH', { status }, (payload) => {
    if (payload) {
      const next = getSignups().map((item) => (item.id === payload.id ? Object.assign({}, item, payload) : item))
      wx.setStorageSync(KEYS.signups, next)
    }
    if (callback) callback(payload)
  })
  return signups
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
  list.unshift(Object.assign({ id: `CJ${Date.now()}`, status: '待处理', createdAt: formatTime(new Date()) }, record || {}))
  wx.setStorageSync(KEYS.cellar, list)
  return list
}

function submitCellar(record) {
  if (!isLoggedIn()) return getCellar()
  const now = new Date()
  const months = Number(record.months || 3)
  const expireAt = new Date(now)
  expireAt.setMonth(expireAt.getMonth() + months)
  const list = getCellar()
  list.unshift(
    Object.assign(
      {
        id: `CJ${Date.now()}`,
        status: '存放中',
        createdAt: formatTime(now),
        expireAt: formatDate(expireAt),
        reminder: '到期前7天提醒'
      },
      record || {}
    )
  )
  wx.setStorageSync(KEYS.cellar, list)
  return list
}

function updateCellarStatus(id, status, callback) {
  const list = getCellar().map((item) => (item.id === id ? Object.assign({}, item, { status }) : item))
  wx.setStorageSync(KEYS.cellar, list)
  requestMerchantApi(`/api/merchant/cellar/${encodeURIComponent(id)}/status`, 'PATCH', { status }, (payload) => {
    if (payload) {
      const next = getCellar().map((item) => (item.id === payload.id ? Object.assign({}, item, payload) : item))
      wx.setStorageSync(KEYS.cellar, next)
    }
    if (callback) callback(payload)
  })
  return list
}

function getStoreCellar(storeId) {
  return getCellar().filter((item) => !storeId || item.storeId === storeId)
}

function renewCellar(id, months = 3) {
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
  return list
}

function cellarReminder(item) {
  if (item.status !== '存放中') return ''
  const today = new Date()
  const expire = new Date(String(item.expireAt || '').replace(/-/g, '/'))
  const days = Math.ceil((expire.getTime() - today.getTime()) / 86400000)
  if (days < 0) return '已到期，请尽快处理'
  if (days <= 7) return `还有${days}天到期`
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
  const text = String(reason || '').trim()
  if (!amount || !text) return null
  const member = memberKey ? null : getMember()
  const targetId = memberKey || (member && (member.id || member.openid || member.nickname))
  if (isMerchantContext() && targetId) {
    requestMerchantApi(`/api/merchant/members/${encodeURIComponent(targetId)}/points`, 'POST', {
      delta: amount,
      reason: text,
      storeId: ''
    }, (payload) => {
      if (payload && payload.member) {
        const members = getMemberList()
        const index = members.findIndex((item) => item.id === payload.member.id)
        if (index > -1) members[index] = payload.member
        else members.unshift(payload.member)
        wx.setStorageSync(KEYS.members, members)
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

function getPointLogs() {
  if (!canReadPrivateData()) {
    return []
  }
  return wx.getStorageSync(KEYS.pointLogs) || []
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
    if (callback) callback(getInventory())
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
  const stored = wx.getStorageSync(KEYS.inventory) || defaultInventory()
  const next = stored.map((item) => {
    if (item.id === id) {
      return Object.assign({}, item, {
        stock: Math.max(0, Number(item.stock || 0) + Number(delta || 0))
      })
    }
    return item
  })
  if (!next.find((item) => item.id === id)) {
    next.push({ id, stock: Math.max(0, Number(delta || 0)) })
  }
  wx.setStorageSync(KEYS.inventory, next)
  requestMerchantApi(`/api/merchant/inventory/${encodeURIComponent(id)}/stock`, 'PATCH', { delta: Number(delta || 0) }, (payload) => {
    if (payload) {
      const serverInventory = (wx.getStorageSync(KEYS.inventory) || []).filter((item) => item.id !== id)
      serverInventory.push({ id, stock: Number(payload.stock || 0) })
      wx.setStorageSync(KEYS.inventory, serverInventory)
    }
    if (callback) fetchInventory(callback)
  })
  return getInventory()
}

function getBoardGameReservations(storeId) {
  return getOrders().filter((order) => {
    const storeMatched = !storeId || order.storeId === storeId
    const hasBoardItem = (order.items || []).some((item) => item.categoryId === 'packages' || item.categoryId === 'ktv')
    return storeMatched && hasBoardItem
  })
}

function normalizeLeaderboardList(list) {
  return (Array.isArray(list) ? list : []).map((item, index) => ({
    id: item.id || `rank-${Date.now()}-${index}`,
    username: String(item.username || ''),
    score: Number(item.score || 0)
  }))
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
  const fallback = normalizeLeaderboardList(data.leaderboard)
  const source = payload && typeof payload === 'object' ? payload : {}
  return LEADERBOARD_TYPES.reduce((boards, type) => {
    boards[type] = normalizeLeaderboardList(source[type] || fallback)
    return boards
  }, {})
}

function rankLeaderboardList(list) {
  return normalizeLeaderboardList(list)
    .map((item, index) => Object.assign({}, item, { rank: index + 1 }))
}

function getLeaderboardBoards() {
  const stored = wx.getStorageSync(KEYS.leaderboard)
  const boards = normalizeLeaderboardBoards(stored || data.leaderboard)
  wx.setStorageSync(KEYS.leaderboard, boards)
  return boards
}

function getLeaderboard(type = 'weekly') {
  const boards = getLeaderboardBoards()
  return rankLeaderboardList(boards[type] || boards.weekly)
}

function fetchPublicLeaderboard(callback, type = 'weekly') {
  const base = apiBaseUrl()
  if (!base) {
    if (callback) callback(getLeaderboard(type))
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
      if (callback) callback(getLeaderboard(type))
    },
    fail() {
      if (callback) callback(getLeaderboard(type))
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
    if (callback) callback(getLeaderboard(type))
  })
}

function saveLeaderboard(list, callback, type = 'weekly') {
  const boards = getLeaderboardBoards()
  boards[type] = normalizeLeaderboardList(list)
  wx.setStorageSync(KEYS.leaderboard, boards)
  requestMerchantApi('/api/merchant/leaderboard', 'POST', { type, list: boards[type] }, (payload) => {
    if (payload) wx.setStorageSync(KEYS.leaderboard, normalizeLeaderboardBoards(payload))
    if (callback) callback(getLeaderboard(type))
  })
  return getLeaderboard(type)
}

function addLeaderboardUser(record, callback, type = 'weekly') {
  const boards = getLeaderboardBoards()
  const list = boards[type] || []
  list.push({
    id: `${type}-rank-${Date.now()}`,
    username: record.username,
    score: Number(record.score || 0)
  })
  list.sort((a, b) => b.score - a.score)
  return saveLeaderboard(list, callback, type)
}

function updateLeaderboardRank(id, direction, callback, type = 'weekly') {
  const boards = getLeaderboardBoards()
  const list = rankLeaderboardList(boards[type] || [])
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
  resetUserSession,
  isLoggedIn,
  loginWithWeChat,
  requireLogin,
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
  getStores,
  fetchStores,
  fetchMerchantStores,
  saveStores,
  updateStore,
  getStore,
  setStore,
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
  clearCart,
  getCartSummary,
  getProducts,
  isProductVisibleInStore,
  fetchProducts,
  fetchMerchantProducts,
  fetchTableQrcodes,
  generateTableQrcodes,
  getProductCategories,
  updateProduct,
  getActivities,
  fetchMerchantActivities,
  getActivity,
  saveActivities,
  updateActivity,
  openActivityLocation,
  getMember,
  saveMember,
  updateNickname,
  getRechargeSettings,
  fetchRechargeSettings,
  saveRechargeSettings,
  getRechargeRecords,
  fetchRechargeRecords,
  addRechargeRecord,
  adjustMemberBalance,
  rechargeMemberWithPackage,
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
  printOrderBluetooth,
  printOrderCloud,
  getStorePrinter,
  buildPrintTemplate,
  getSignups,
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
  getPointLogs,
  fetchPointLogs,
  getInventory,
  fetchInventory,
  updateProductStock,
  getBoardGameReservations,
  getLeaderboard,
  fetchPublicLeaderboard,
  fetchLeaderboard,
  addLeaderboardUser,
  updateLeaderboardRank,
  saveLeaderboard,
  getLeaderboardBoards,
  leaderboardTabs: LEADERBOARD_TABS
}
