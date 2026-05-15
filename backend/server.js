const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { URL } = require('url')

loadEnv()

const sourceData = require('../utils/data')
const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number(process.env.PORT || 3000)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
const DB_FILE = path.join(__dirname, 'data.json')
const STORAGE_DRIVER = String(process.env.STORAGE_DRIVER || 'file').toLowerCase()
const WX_PAY_API = 'https://api.mch.weixin.qq.com'
const WX_PAY_ENABLED = String(process.env.WX_PAY_ENABLED || '').toLowerCase() === 'true'
const XPYUN_API = 'https://open.xpyun.net/api/openapi'
const UPLOAD_ROOT = process.env.UPLOAD_ROOT || path.join(__dirname, 'uploads')
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || 'http://47.103.113.60').replace(/\/+$/, '')
const LEADERBOARD_TYPES = ['weekly', 'monthly', 'yearly']
const COLLECTION_KEYS = [
  'stores',
  'categories',
  'products',
  'activities',
  'members',
  'orders',
  'signups',
  'cellar',
  'inventory',
  'rechargeSettings',
  'rechargeRecords',
  'pointLogs',
  'globalSettings',
  'leaderboard'
]

let db = null
let mysqlPool = null
let wechatAccessTokenCache = null

const server = http.createServer(async (req, res) => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    send(res, 204, null)
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const pathname = normalizePath(url.pathname)

  try {
    if (req.method === 'GET' && pathname === '/api/health') return sendOk(res, { ok: true })
    if (req.method === 'POST' && pathname === '/api/wechat/login') return await handleWechatLogin(req, res)
    if (req.method === 'POST' && pathname === '/api/merchant/login') return await handleMerchantLogin(req, res)
    if (req.method === 'POST' && pathname === '/api/wechat/pay/notify') return await handleWechatPayNotify(req, res)
    if (req.method === 'GET' && pathname.startsWith('/api/uploads/')) return await handleUploadedFile(req, res, pathname)
    if (req.method === 'POST' && pathname === '/api/merchant/upload') return await handleMerchantUpload(req, res)

    if (req.method === 'GET' && pathname === '/api/stores') return sendOk(res, db.stores)
    if (req.method === 'GET' && pathname === '/api/categories') return sendOk(res, db.categories)
    if (req.method === 'GET' && pathname === '/api/products') return sendOk(res, publicProducts(url.searchParams.get('storeId')))
    if (req.method === 'GET' && pathname === '/api/activities') return sendOk(res, db.activities)
    if (req.method === 'GET' && match(pathname, '/api/activities/:id')) return await handleGetActivity(req, res, pathname)
    if (req.method === 'GET' && pathname === '/api/recharge-settings') return sendOk(res, db.rechargeSettings)
    if (req.method === 'GET' && pathname === '/api/global-settings') return sendOk(res, db.globalSettings)
    if (req.method === 'GET' && pathname === '/api/leaderboard') return sendOk(res, rankedLeaderboard(url.searchParams.get('type')))

    if (pathname.startsWith('/api/my/') || pathname === '/api/orders' || pathname === '/api/recharge' || pathname === '/api/cellar' || pathname === '/api/signups' || pathname.startsWith('/api/wechat/pay/')) {
      const user = requireUser(req)
      if (req.method === 'GET' && pathname === '/api/my/profile') return sendOk(res, user.member)
      if (req.method === 'PUT' && pathname === '/api/my/profile') return await handleUpdateProfile(req, res, user)
      if (req.method === 'GET' && pathname === '/api/my/orders') return sendOk(res, db.orders.filter((item) => item.memberId === user.member.id))
      if (req.method === 'GET' && pathname === '/api/my/signups') return sendOk(res, db.signups.filter((item) => item.memberId === user.member.id))
      if (req.method === 'GET' && pathname === '/api/my/cellar') return sendOk(res, db.cellar.filter((item) => item.memberId === user.member.id))
      if (req.method === 'GET' && pathname === '/api/my/recharge-records') return sendOk(res, db.rechargeRecords.filter((item) => item.memberId === user.member.id))
      if (req.method === 'POST' && pathname === '/api/orders') return await handleCreateOrder(req, res, user)
      if (req.method === 'POST' && pathname === '/api/recharge') return await handleRecharge(req, res, user)
      if (req.method === 'POST' && pathname === '/api/cellar') return await handleSubmitCellar(req, res, user)
      if (req.method === 'POST' && pathname === '/api/signups') return await handleCreateSignup(req, res, user)
      if (req.method === 'POST' && pathname === '/api/wechat/pay/order') return await handleCreateOrderPayment(req, res, user)
      if (req.method === 'POST' && pathname === '/api/wechat/pay/recharge') return await handleCreateRechargePayment(req, res, user)
    }

    if (pathname.startsWith('/api/merchant/')) {
      const merchant = requireMerchant(req)
      if (req.method === 'GET' && pathname === '/api/merchant/data/overview') return sendOk(res, getOverview(merchant))
      if (req.method === 'GET' && pathname === '/api/merchant/data/export') return sendText(res, exportSummary(merchant))
      if (req.method === 'GET' && pathname === '/api/merchant/orders') return sendOk(res, scopedList(db.orders, merchant))
      if (req.method === 'PATCH' && match(pathname, '/api/merchant/orders/:id/status')) return await handleOrderStatus(req, res, pathname, merchant)
      if (req.method === 'POST' && match(pathname, '/api/merchant/orders/:id/print')) return await handlePrintOrder(req, res, pathname, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/table-qrcodes') return sendOk(res, tableQrcodeList(merchant))
      if (req.method === 'POST' && pathname === '/api/merchant/table-qrcodes/generate') return await handleGenerateTableQrcodes(req, res, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/members') return sendOk(res, scopedMembers(merchant))
      if (req.method === 'GET' && pathname === '/api/merchant/signups') return sendOk(res, scopedList(db.signups, merchant))
      if (req.method === 'PATCH' && match(pathname, '/api/merchant/signups/:id/status')) return await handleSignupStatus(req, res, pathname, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/cellar') return sendOk(res, scopedList(db.cellar, merchant))
      if (req.method === 'PATCH' && match(pathname, '/api/merchant/cellar/:id/status')) return await handleCellarStatus(req, res, pathname, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/products') return sendOk(res, scopedProducts(merchant))
      if (req.method === 'POST' && pathname === '/api/merchant/products') return await handleSaveProduct(req, res, merchant)
      if (req.method === 'DELETE' && match(pathname, '/api/merchant/products/:id')) return await handleDeleteProduct(req, res, pathname, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/categories') return sendOk(res, db.categories)
      if (req.method === 'POST' && pathname === '/api/merchant/categories') return await handleSaveCategory(req, res)
      if (req.method === 'DELETE' && match(pathname, '/api/merchant/categories/:id')) return await handleDeleteCategory(req, res, pathname)
      if (req.method === 'GET' && pathname === '/api/merchant/activities') return sendOk(res, scopedList(db.activities, merchant))
      if (req.method === 'POST' && pathname === '/api/merchant/activities') return await handleSaveActivity(req, res, merchant)
      if (req.method === 'DELETE' && match(pathname, '/api/merchant/activities/:id')) return await handleDeleteActivity(req, res, pathname, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/stores') return sendOk(res, scopedStores(merchant))
      if (req.method === 'POST' && pathname === '/api/merchant/stores') return await handleSaveStore(req, res, merchant)
      if (req.method === 'DELETE' && match(pathname, '/api/merchant/stores/:id')) return await handleDeleteStore(req, res, pathname, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/inventory') return sendOk(res, scopedInventory(merchant))
      if (req.method === 'PATCH' && match(pathname, '/api/merchant/inventory/:id/stock')) return await handleInventoryStock(req, res, pathname, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/recharge-settings') return sendOk(res, db.rechargeSettings)
      if (req.method === 'POST' && pathname === '/api/merchant/recharge-settings') return await handleRechargeSettings(req, res)
      if (req.method === 'GET' && pathname === '/api/merchant/recharge-records') return sendOk(res, scopedList(db.rechargeRecords, merchant))
      if (req.method === 'GET' && pathname === '/api/merchant/point-logs') return sendOk(res, scopedList(db.pointLogs, merchant))
      if (req.method === 'POST' && match(pathname, '/api/merchant/members/:id/balance')) return await handleAdjustBalance(req, res, pathname, merchant)
      if (req.method === 'POST' && match(pathname, '/api/merchant/members/:id/points')) return await handleAdjustPoints(req, res, pathname, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/global-settings') return sendOk(res, db.globalSettings)
      if (req.method === 'POST' && pathname === '/api/merchant/global-settings') return await handleGlobalSettings(req, res)
      if (req.method === 'GET' && pathname === '/api/merchant/leaderboard') return sendOk(res, rankedLeaderboard(url.searchParams.get('type')))
      if (req.method === 'POST' && pathname === '/api/merchant/leaderboard') return await handleSaveLeaderboard(req, res)
    }

    sendError(res, 404, '接口不存在')
  } catch (error) {
    const status = error.statusCode || 500
    sendError(res, status, status === 500 ? '服务器错误' : error.message)
    if (status === 500) console.error(error)
  }
})

start().catch((error) => {
  console.error(error)
  process.exit(1)
})

async function start() {
  db = await loadDb()
  server.listen(PORT, HOST, () => {
    console.log(`Pokerpai backend running at http://${HOST}:${PORT} with ${STORAGE_DRIVER} storage`)
  })
}

async function handleWechatLogin(req, res) {
  const body = await readJson(req)
  const code = String(body.code || '').trim()
  if (!code) throw httpError(400, '缺少 code')

  const identity = await code2Session(code)
  const openid = identity.openid
  const unionid = identity.unionid || ''
  let member = db.members.find((item) => item.openid === openid)
  if (!member) {
    member = {
      id: `MB${Date.now()}`,
      openid,
      unionid,
      nickname: body.nickname || `微信用户${String(openid).slice(-4)}`,
      avatarUrl: body.avatarUrl || '',
      phone: '',
      level: '普通会员',
      balance: 0,
      points: 0,
      totalSpent: 0,
      consumptionCount: 0,
      gems: 0,
      invitePieces: 0,
      createdAt: now()
    }
    db.members.unshift(member)
  } else {
    member.unionid = unionid || member.unionid || ''
    if (body.nickname) member.nickname = body.nickname
    if (body.avatarUrl) member.avatarUrl = body.avatarUrl
  }

  const token = signToken({ type: 'user', memberId: member.id, openid })
  await persist()
  sendOk(res, { openid, unionid, token, member })
}

async function handleMerchantLogin(req, res) {
  const body = await readJson(req)
  const username = String(body.username || '').trim()
  const password = String(body.password || '').trim()
  const account = merchantAccounts().find((item) => item.username === username && item.password === password)
  if (!account) throw httpError(401, '账号或密码错误')
  const store = account.role === 'super_admin' ? null : db.stores.find((item) => item.id === account.storeId)
  if (account.role !== 'super_admin' && !store) throw httpError(403, '账号未绑定有效门店')
  const token = signToken({ type: 'merchant', username, role: account.role, storeId: account.storeId })
  sendOk(res, {
    token,
    username,
    name: account.name,
    role: account.role,
    storeId: account.storeId,
    storeName: store ? store.shortName || store.name : '全部门店'
  })
}

async function handleMerchantUpload(req, res) {
  const upload = await readMultipartFile(req)
  if (!upload) throw httpError(400, '未收到上传文件')
  const type = upload.mediaType === 'video' ? 'videos' : 'images'
  const safeExt = extensionByMime(upload.contentType, upload.filename, upload.mediaType)
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`
  const dir = path.join(UPLOAD_ROOT, type)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, filename)
  fs.writeFileSync(filePath, upload.data)
  const url = `${PUBLIC_BASE_URL}/api/uploads/${type}/${filename}`
  sendOk(res, {
    url,
    path: `/api/uploads/${type}/${filename}`,
    filename,
    contentType: upload.contentType,
    size: upload.data.length,
    mediaType: upload.mediaType
  })
}

async function handleGenerateTableQrcodes(req, res, merchant) {
  const targets = tableQrcodeList(merchant)
  const token = await getWechatAccessToken()
  const dir = path.join(UPLOAD_ROOT, 'qrcodes')
  fs.mkdirSync(dir, { recursive: true })
  const generated = []
  for (const item of targets) {
    const buffer = await postWechatBuffer(
      `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`,
      {
        scene: item.scene,
        page: item.page,
        check_path: false,
        env_version: process.env.WXACODE_ENV_VERSION || 'release',
        width: 430
      }
    )
    const filename = `table-${String(item.tableNo).padStart(3, '0')}.png`
    fs.writeFileSync(path.join(dir, filename), buffer)
    generated.push(Object.assign({}, item, { exists: true }))
  }
  sendOk(res, {
    count: generated.length,
    items: tableQrcodeList(merchant)
  })
}

async function handleUploadedFile(req, res, pathname) {
  const relative = decodeURIComponent(pathname.replace(/^\/api\/uploads\//, ''))
  if (!/^(images|videos|qrcodes)\/[A-Za-z0-9._-]+$/.test(relative)) throw httpError(404, '文件不存在')
  const filePath = path.join(UPLOAD_ROOT, relative)
  if (!fs.existsSync(filePath)) throw httpError(404, '文件不存在')
  const ext = path.extname(filePath).toLowerCase()
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v'
  }
  res.statusCode = 200
  res.setHeader('content-type', types[ext] || 'application/octet-stream')
  res.setHeader('cache-control', 'public, max-age=31536000, immutable')
  fs.createReadStream(filePath).pipe(res)
}

function handleGetActivity(req, res, pathname) {
  const { id } = params(pathname, '/api/activities/:id')
  const activity = db.activities.find((item) => item.id === id)
  if (!activity) throw httpError(404, '活动不存在')
  sendOk(res, activity)
}

async function handleUpdateProfile(req, res, user) {
  const body = await readJson(req)
  const allowed = ['nickname', 'avatarUrl', 'phone', 'gender']
  allowed.forEach((key) => {
    if (body[key] !== undefined) user.member[key] = body[key]
  })
  await persist()
  sendOk(res, user.member)
}

async function handleCreateOrder(req, res, user) {
  const body = await readJson(req)
  const items = Array.isArray(body.items) ? body.items : []
  if (!items.length) throw httpError(400, '订单商品不能为空')
  const store = db.stores.find((item) => item.id === body.storeId) || db.stores[0]
  const table = normalizeOrderTable(store, body)
  const total = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.count || 0), 0)
  const order = {
    id: `DY${Date.now()}`,
    memberId: user.member.id,
    nickname: user.member.nickname,
    storeId: store.id,
    storeName: store.shortName || store.name,
    tableNo: table ? table.tableNo : '',
    tableName: table ? table.tableName : '',
    mode: body.mode || '堂食',
    status: '待支付',
    items,
    total,
    createdAt: now()
  }
  db.orders.unshift(order)
  user.member.totalSpent = Number(user.member.totalSpent || 0) + total
  user.member.points = Number(user.member.points || 0) + Math.floor(total)
  user.member.consumptionCount = Number(user.member.consumptionCount || 0) + 1
  user.member.level = levelBySpend(user.member.totalSpent, user.member.points)
  await persist()
  sendOk(res, order)
}

async function handleRecharge(req, res, user) {
  const body = await readJson(req)
  const pack = db.rechargeSettings.packages.find((item) => item.id === body.packageId) || body.package || {}
  const payAmount = Number(pack.payAmount || body.payAmount || 0)
  const creditAmount = Number(pack.creditAmount || body.creditAmount || 0)
  if (!payAmount || !creditAmount) throw httpError(400, '充值金额无效')
  const before = Number(user.member.balance || 0)
  const after = before + creditAmount
  user.member.balance = after
  const record = {
    id: `RC${Date.now()}`,
    type: 'recharge',
    memberId: user.member.id,
    nickname: user.member.nickname,
    packageId: pack.id || '',
    packageLabel: pack.label || '',
    payAmount,
    creditAmount,
    balanceBefore: before,
    balanceAfter: after,
    operator: '微信支付',
    note: pack.tip || '',
    createdAt: now()
  }
  db.rechargeRecords.unshift(record)
  await persist()
  sendOk(res, { member: user.member, record })
}

async function handleCreateOrderPayment(req, res, user) {
  const body = await readJson(req)
  const items = Array.isArray(body.items) ? body.items : []
  if (!items.length) throw httpError(400, '订单商品不能为空')
  const store = db.stores.find((item) => item.id === body.storeId) || db.stores[0]
  const table = normalizeOrderTable(store, body)
  const total = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.count || 0), 0)
  if (total <= 0) throw httpError(400, '订单金额无效')
  const order = {
    id: `DY${Date.now()}`,
    memberId: user.member.id,
    nickname: user.member.nickname,
    storeId: store.id,
    storeName: store.shortName || store.name,
    tableNo: table ? table.tableNo : '',
    tableName: table ? table.tableName : '',
    mode: body.mode || '堂食',
    status: '待支付',
    payStatus: 'pending',
    paymentType: 'wechat',
    outTradeNo: `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`,
    items,
    total,
    createdAt: now()
  }
  db.orders.unshift(order)
  await persist()
  const payment = await createWechatJsapiPayment({
    outTradeNo: order.outTradeNo,
    description: `破壳派酒吧订单 ${order.id}`,
    total,
    openid: user.member.openid,
    attach: JSON.stringify({ type: 'order', id: order.id })
  })
  sendOk(res, { order, payment })
}

async function handleCreateRechargePayment(req, res, user) {
  const body = await readJson(req)
  const pack = db.rechargeSettings.packages.find((item) => item.id === body.packageId) || body.package || {}
  const payAmount = Number(pack.payAmount || body.payAmount || 0)
  const creditAmount = Number(pack.creditAmount || body.creditAmount || 0)
  if (!payAmount || !creditAmount) throw httpError(400, '充值金额无效')
  const before = Number(user.member.balance || 0)
  const record = {
    id: `RC${Date.now()}`,
    type: 'recharge',
    status: '待支付',
    payStatus: 'pending',
    paymentType: 'wechat',
    outTradeNo: `RCG${Date.now()}${Math.floor(Math.random() * 1000)}`,
    memberId: user.member.id,
    nickname: user.member.nickname,
    packageId: pack.id || '',
    packageLabel: pack.label || '',
    payAmount,
    creditAmount,
    balanceBefore: before,
    balanceAfter: before,
    operator: '微信支付',
    note: pack.tip || '',
    createdAt: now()
  }
  db.rechargeRecords.unshift(record)
  await persist()
  const payment = await createWechatJsapiPayment({
    outTradeNo: record.outTradeNo,
    description: `破壳派酒吧充值 ${record.id}`,
    total: payAmount,
    openid: user.member.openid,
    attach: JSON.stringify({ type: 'recharge', id: record.id })
  })
  sendOk(res, { record, payment })
}

async function handleSubmitCellar(req, res, user) {
  const body = await readJson(req)
  if (!body.wineName) throw httpError(400, '请填写酒品名称')
  const created = new Date()
  const expire = new Date(created)
  expire.setMonth(expire.getMonth() + Number(body.months || 3))
  const record = {
    id: `CJ${Date.now()}`,
    memberId: user.member.id,
    nickname: user.member.nickname,
    storeId: body.storeId || '',
    storeName: body.storeName || '',
    wineName: body.wineName,
    quantity: Number(body.quantity || 1),
    months: Number(body.months || 3),
    status: '存放中',
    createdAt: now(created),
    expireAt: dateOnly(expire),
    reminder: '到期前7天提醒'
  }
  db.cellar.unshift(record)
  await persist()
  sendOk(res, record)
}

async function handleCreateSignup(req, res, user) {
  const body = await readJson(req)
  const activity = findById(db.activities, body.activityId || body.id, '活动不存在')
  if (activity.status && activity.status !== 'open') throw httpError(400, '活动暂不可报名')
  if (db.signups.find((item) => item.memberId === user.member.id && item.activityId === activity.id)) {
    throw httpError(409, '你已经报名该活动')
  }
  const quota = Number(activity.quota || 0)
  const joined = Number(activity.joined || 0)
  if (quota && joined >= quota) throw httpError(400, '活动名额已满')
  const store = inferStoreByActivity(activity)
  const signup = {
    id: `SU${Date.now()}`,
    activityId: activity.id,
    memberId: user.member.id,
    nickname: user.member.nickname,
    title: activity.title,
    date: activity.date,
    storeId: store.id || activity.storeId || '',
    storeName: store.shortName || store.name || '',
    location: activity.location || store.address || '',
    price: Number(activity.price || 0),
    pointsPrice: Number(activity.pointsPrice || 0),
    status: '已报名',
    createdAt: now()
  }
  db.signups.unshift(signup)
  activity.joined = joined + 1
  await persist()
  sendOk(res, signup)
}

async function handleOrderStatus(req, res, pathname, merchant) {
  const { id } = params(pathname, '/api/merchant/orders/:id/status')
  const body = await readJson(req)
  const order = findById(db.orders, id, '订单不存在')
  ensureMerchantStoreAccess(merchant, order.storeId)
  order.status = body.status || order.status
  await persist()
  sendOk(res, order)
}

async function handlePrintOrder(req, res, pathname, merchant) {
  const { id } = params(pathname, '/api/merchant/orders/:id/print')
  const body = await readJson(req)
  const order = findById(db.orders, id, '订单不存在')
  ensureMerchantStoreAccess(merchant, order.storeId)
  const store = db.stores.find((item) => item.id === order.storeId) || {}
  const sn = String(store.printerSn || store.xpyunPrinterSn || '').trim()
  if (!sn) throw httpError(400, '请先在门店管理中配置芯烨云打印机编号')
  const copies = Math.max(1, Math.min(5, Number(body.copies || store.printerCopies || 1)))
  const content = buildReceiptContent(order, store)
  const result = await printXpyunReceipt({ sn, content, copies, voice: body.voice || 0 })
  const record = {
    id: `PR${Date.now()}`,
    orderId: order.id,
    storeId: order.storeId,
    printerSn: sn,
    copies,
    status: result.ok ? 'sent' : 'failed',
    message: result.message,
    xpyunOrderId: result.orderId || '',
    operator: merchant.username,
    createdAt: now()
  }
  order.printLogs = Array.isArray(order.printLogs) ? order.printLogs : []
  order.printLogs.unshift(record)
  order.printStatus = record.status
  order.lastPrintedAt = record.createdAt
  order.lastPrintMessage = record.message
  await persist()
  sendOk(res, { order, print: record, result })
}

async function handleSignupStatus(req, res, pathname, merchant) {
  const { id } = params(pathname, '/api/merchant/signups/:id/status')
  const body = await readJson(req)
  const signup = findById(db.signups, id, '报名不存在')
  ensureMerchantStoreAccess(merchant, signup.storeId)
  signup.status = body.status || signup.status
  await persist()
  sendOk(res, signup)
}

async function handleCellarStatus(req, res, pathname, merchant) {
  const { id } = params(pathname, '/api/merchant/cellar/:id/status')
  const body = await readJson(req)
  const item = findById(db.cellar, id, '存酒不存在')
  ensureMerchantStoreAccess(merchant, item.storeId)
  item.status = body.status || item.status
  await persist()
  sendOk(res, item)
}

async function handleSaveProduct(req, res, merchant) {
  const body = applyMerchantStore(await readJson(req), merchant)
  if (isSuperMerchant(merchant)) {
    const storeId = String(body.storeId || '').trim()
    if (!storeId) throw httpError(400, '请选择菜品所属门店')
    if (!db.stores.some((item) => item.id === storeId)) throw httpError(400, '门店不存在')
    body.storeId = storeId
  }
  const product = upsert(db.products, body, {
    id: `prd-${Date.now()}`,
    categoryId: 'dishes',
    name: '',
    desc: '',
    price: 0,
    points: 0,
    unit: '份',
    image: '/assets/product-dish.svg',
    sale: true
  })
  await persist()
  sendOk(res, product)
}

async function handleDeleteProduct(req, res, pathname, merchant) {
  const { id } = params(pathname, '/api/merchant/products/:id')
  const product = findById(db.products, id, '商品不存在')
  ensureMerchantStoreAccess(merchant, product.storeId)
  const before = db.products.length
  db.products = db.products.filter((item) => item.id !== id)
  db.inventory = db.inventory.filter((item) => item.id !== id)
  if (db.products.length === before) throw httpError(404, '商品不存在')
  await persist()
  sendOk(res, { id })
}

async function handleSaveCategory(req, res) {
  const body = await readJson(req)
  const name = String(body.name || '').trim()
  if (!name) throw httpError(400, '分类名称不能为空')
  const category = upsert(db.categories, body, {
    id: `cat-${Date.now()}`,
    name
  })
  await persist()
  sendOk(res, category)
}

async function handleDeleteCategory(req, res, pathname) {
  const { id } = params(pathname, '/api/merchant/categories/:id')
  if (db.products.some((item) => item.categoryId === id)) throw httpError(409, '该分类下还有商品，不能删除')
  const before = db.categories.length
  db.categories = db.categories.filter((item) => item.id !== id)
  if (db.categories.length === before) throw httpError(404, '分类不存在')
  await persist()
  sendOk(res, { id })
}

async function handleSaveActivity(req, res, merchant) {
  const body = applyMerchantStore(await readJson(req), merchant)
  const activity = upsert(db.activities, body, {
    id: `act-${Date.now()}`,
    title: '',
    type: '国际扑克',
    date: '',
    dayLabel: '',
    location: '',
    latitude: 0,
    longitude: 0,
    deadline: '',
    price: 0,
    pointsPrice: 0,
    quota: 10,
    joined: 0,
    status: 'open',
    productName: '',
    image: '/assets/activity-card.svg',
    detailImage: '/assets/activity-card.svg',
    environmentImage: '/assets/hero-bar.svg',
    resultImage: '/assets/activity-card.svg'
  })
  await persist()
  sendOk(res, activity)
}

async function handleDeleteActivity(req, res, pathname, merchant) {
  const { id } = params(pathname, '/api/merchant/activities/:id')
  const activity = findById(db.activities, id, '活动不存在')
  ensureMerchantStoreAccess(merchant, activity.storeId)
  const before = db.activities.length
  db.activities = db.activities.filter((item) => item.id !== id)
  db.signups = db.signups.filter((item) => item.activityId !== id && item.id !== id)
  if (db.activities.length === before) throw httpError(404, '活动不存在')
  await persist()
  sendOk(res, { id })
}

async function handleSaveStore(req, res, merchant) {
  const body = await readJson(req)
  if (!isSuperMerchant(merchant)) {
    if (body.id && body.id !== merchant.storeId) throw httpError(403, '只能操作本门店')
    body.id = merchant.storeId
  }
  const store = upsert(db.stores, body, {
    id: `store-${Date.now()}`,
    name: '',
    shortName: '',
    address: '',
    phone: '',
    status: '营业中',
    latitude: 0,
    longitude: 0,
    printerSn: '',
    printerName: '',
    printerCopies: 1
  })
  await persist()
  sendOk(res, store)
}

async function handleDeleteStore(req, res, pathname, merchant) {
  if (!isSuperMerchant(merchant)) throw httpError(403, '分店管理员不能删除门店')
  const { id } = params(pathname, '/api/merchant/stores/:id')
  if (db.stores.length <= 1) throw httpError(409, '至少保留一个门店')
  const before = db.stores.length
  db.stores = db.stores.filter((item) => item.id !== id)
  if (db.stores.length === before) throw httpError(404, '门店不存在')
  await persist()
  sendOk(res, { id })
}

async function handleInventoryStock(req, res, pathname, merchant) {
  const { id } = params(pathname, '/api/merchant/inventory/:id/stock')
  const body = await readJson(req)
  const product = findById(db.products, id, '商品不存在')
  ensureMerchantStoreAccess(merchant, product.storeId)
  const current = db.inventory.find((item) => item.id === id)
  const stock = body.stock !== undefined
    ? Number(body.stock || 0)
    : Number(current ? current.stock : 0) + Number(body.delta || 0)
  const next = { id, stock: Math.max(0, stock) }
  const index = db.inventory.findIndex((item) => item.id === id)
  if (index > -1) db.inventory[index] = next
  else db.inventory.push(next)
  await persist()
  sendOk(res, Object.assign({}, product, next))
}

async function handleRechargeSettings(req, res) {
  const body = await readJson(req)
  db.rechargeSettings = Object.assign({}, db.rechargeSettings, body)
  await persist()
  sendOk(res, db.rechargeSettings)
}

async function handleAdjustBalance(req, res, pathname, merchant) {
  const { id } = params(pathname, '/api/merchant/members/:id/balance')
  const body = await readJson(req)
  const member = findMember(id)
  ensureMerchantMemberAccess(merchant, member.id)
  const storeId = isSuperMerchant(merchant) ? String(body.storeId || '').trim() : merchant.storeId
  const delta = Number(body.delta || 0)
  if (!delta) throw httpError(400, '调整金额无效')
  const before = Number(member.balance || 0)
  const after = Math.max(0, before + delta)
  member.balance = after
  const record = {
    id: `RC${Date.now()}`,
    type: 'adjust',
    memberId: member.id,
    nickname: member.nickname,
    payAmount: Math.abs(delta),
    creditAmount: delta,
    balanceBefore: before,
    balanceAfter: after,
    storeId,
    storeName: storeNameById(storeId),
    operator: merchant.username,
    note: body.note || '手动调整余额',
    createdAt: now()
  }
  db.rechargeRecords.unshift(record)
  await persist()
  sendOk(res, { member, record })
}

async function handleAdjustPoints(req, res, pathname, merchant) {
  const { id } = params(pathname, '/api/merchant/members/:id/points')
  const body = await readJson(req)
  const member = findMember(id)
  ensureMerchantMemberAccess(merchant, member.id)
  const storeId = isSuperMerchant(merchant) ? String(body.storeId || '').trim() : merchant.storeId
  const delta = Number(body.delta || 0)
  if (!delta) throw httpError(400, '调整积分无效')
  member.points = Math.max(0, Number(member.points || 0) + delta)
  member.level = levelBySpend(member.totalSpent || 0, member.points)
  const record = {
    id: `PT${Date.now()}`,
    memberId: member.id,
    nickname: member.nickname,
    delta,
    reason: body.reason || '手动调整积分',
    storeId,
    storeName: storeNameById(storeId),
    operator: merchant.username,
    createdAt: now()
  }
  db.pointLogs.unshift(record)
  await persist()
  sendOk(res, { member, record })
}

async function handleGlobalSettings(req, res) {
  const body = await readJson(req)
  db.globalSettings = normalizeGlobalSettings(Object.assign({}, db.globalSettings, body))
  await persist()
  sendOk(res, db.globalSettings)
}

async function handleSaveLeaderboard(req, res) {
  const body = await readJson(req)
  db.leaderboard = normalizeLeaderboardBoards(db.leaderboard)
  const type = LEADERBOARD_TYPES.includes(body.type) ? body.type : 'weekly'
  if (Array.isArray(body.list)) {
    db.leaderboard[type] = body.list
  } else if (body.boards && typeof body.boards === 'object') {
    db.leaderboard = normalizeLeaderboardBoards(body.boards)
  } else {
    upsert(db.leaderboard[type], body, { id: `${type}-rank-${Date.now()}`, username: '', score: 0 })
  }
  db.leaderboard = normalizeLeaderboardBoards(db.leaderboard)
  await persist()
  sendOk(res, rankedLeaderboard())
}

function requireUser(req) {
  const payload = verifyBearer(req)
  if (payload.type !== 'user') throw httpError(401, '用户登录已失效')
  const member = db.members.find((item) => item.id === payload.memberId && item.openid === payload.openid)
  if (!member) throw httpError(401, '用户不存在')
  return { payload, member }
}

function requireMerchant(req) {
  const payload = verifyBearer(req)
  if (payload.type !== 'merchant') throw httpError(401, '商家登录已失效')
  payload.role = payload.role || 'store_admin'
  return payload
}

function merchantAccounts() {
  const storeIds = db && Array.isArray(db.stores) ? db.stores.map((item) => item.id) : sourceData.stores.map((item) => item.id)
  const thirdStoreId = storeIds.find((id) => id !== 'jiangning' && id !== 'xinjiekou') || 'store-1778602441625'
  const accounts = [
    { username: process.env.MERCHANT_ADMIN_USERNAME || 'admin', password: process.env.MERCHANT_ADMIN_PASSWORD || 'change-this-admin-password', role: 'super_admin', storeId: 'all', name: '总管理员' },
    { username: process.env.MERCHANT_JIANGNING_USERNAME || 'store_jiangning', password: process.env.MERCHANT_JIANGNING_PASSWORD || 'change-this-jiangning-password', role: 'store_admin', storeId: 'jiangning', name: '高淳区店管理员' },
    { username: process.env.MERCHANT_XINJIEKOU_USERNAME || 'store_xinjiekou', password: process.env.MERCHANT_XINJIEKOU_PASSWORD || 'change-this-xinjiekou-password', role: 'store_admin', storeId: 'xinjiekou', name: '新街口店管理员' },
    { username: process.env.MERCHANT_QINHUAI_USERNAME || 'store_qinhuai', password: process.env.MERCHANT_QINHUAI_PASSWORD || 'change-this-qinhuai-password', role: 'store_admin', storeId: thirdStoreId, name: '秦淮区店管理员' },
    { username: sourceData.merchantAccount.username, password: sourceData.merchantAccount.password, role: 'store_admin', storeId: sourceData.merchantAccount.storeId, name: sourceData.merchantAccount.name }
  ]
  const envAccounts = parseJsonEnv('MERCHANT_ACCOUNTS')
  return Array.isArray(envAccounts) && envAccounts.length ? envAccounts : accounts
}

function isSuperMerchant(merchant) {
  return merchant && merchant.role === 'super_admin'
}

function ensureMerchantStoreAccess(merchant, storeId) {
  if (isSuperMerchant(merchant)) return
  if (!storeId || storeId === merchant.storeId) return
  throw httpError(403, '只能操作本门店数据')
}

function applyMerchantStore(data, merchant) {
  const next = Object.assign({}, data || {})
  if (!isSuperMerchant(merchant)) next.storeId = merchant.storeId
  else if (next.storeId === 'all') delete next.storeId
  return next
}

function scopedList(list, merchant) {
  if (isSuperMerchant(merchant)) return list
  return (list || []).filter((item) => !item.storeId || item.storeId === merchant.storeId)
}

function scopedStores(merchant) {
  if (isSuperMerchant(merchant)) return db.stores
  return db.stores.filter((item) => item.id === merchant.storeId)
}

function scopedProducts(merchant) {
  if (isSuperMerchant(merchant)) return db.products
  return db.products.filter((item) => !item.storeId || item.storeId === merchant.storeId)
}

function scopedInventory(merchant) {
  const inventory = getInventory()
  if (isSuperMerchant(merchant)) return inventory
  return inventory.filter((item) => !item.storeId || item.storeId === merchant.storeId)
}

function storeNameById(storeId) {
  const store = db.stores.find((item) => item.id === storeId)
  return store ? store.shortName || store.name || '' : ''
}

function memberStoreIds(memberId) {
  const ids = new Set()
  ;[db.orders, db.signups, db.cellar, db.rechargeRecords, db.pointLogs].forEach((list) => {
    ;(list || []).forEach((item) => {
      if (item.memberId === memberId && item.storeId) ids.add(item.storeId)
    })
  })
  return ids
}

function ensureMerchantMemberAccess(merchant, memberId) {
  if (isSuperMerchant(merchant)) return
  const ids = memberStoreIds(memberId)
  if (!ids.size || ids.has(merchant.storeId)) return
  throw httpError(403, '只能操作本门店会员')
}

function tableStoreId(tableNo) {
  const no = Number(tableNo || 0)
  if (no >= 1 && no <= 40) return 'jiangning'
  if (no >= 41 && no <= 80) return 'xinjiekou'
  if (no >= 81 && no <= 120) return thirdStoreId()
  return ''
}

function thirdStoreId() {
  const ids = db && Array.isArray(db.stores) ? db.stores.map((item) => item.id) : sourceData.stores.map((item) => item.id)
  return ids.find((id) => id !== 'jiangning' && id !== 'xinjiekou') || 'store-1778602441625'
}

function tableRangeByStoreId(storeId) {
  if (storeId === 'jiangning') return { start: 1, end: 40 }
  if (storeId === 'xinjiekou') return { start: 41, end: 80 }
  if (storeId === thirdStoreId()) return { start: 81, end: 120 }
  return null
}

function tableDefinitions() {
  const stores = db && Array.isArray(db.stores) ? db.stores : []
  return Array.from({ length: 120 }, (_, index) => {
    const tableNo = index + 1
    const storeId = tableStoreId(tableNo)
    const store = stores.find((item) => item.id === storeId) || {}
    const filename = `table-${String(tableNo).padStart(3, '0')}.png`
    const relative = `/api/uploads/qrcodes/${filename}`
    const filePath = path.join(UPLOAD_ROOT, 'qrcodes', filename)
    return {
      id: `table-${tableNo}`,
      tableNo,
      tableName: `${tableNo}号桌`,
      storeId,
      storeName: store.shortName || store.name || storeId,
      scene: `t=${tableNo}`,
      page: 'pages/menu/menu',
      url: `${PUBLIC_BASE_URL}${relative}`,
      path: relative,
      exists: fs.existsSync(filePath)
    }
  })
}

function tableQrcodeList(merchant) {
  const list = tableDefinitions()
  if (isSuperMerchant(merchant)) return list
  return list.filter((item) => item.storeId === merchant.storeId)
}

function normalizeOrderTable(store, body) {
  const tableNo = Number(body.tableNo || 0)
  if (!tableNo) return null
  if (tableNo < 1 || tableNo > 120) throw httpError(400, '桌号无效')
  const expectedStoreId = tableStoreId(tableNo)
  if (expectedStoreId && expectedStoreId !== store.id) throw httpError(400, '桌号不属于当前门店')
  return {
    tableNo,
    tableName: body.tableName || `${tableNo}号桌`
  }
}

function isDefaultProduct(product) {
  return sourceData.products.some((item) => item.id === product.id)
}

function publicProducts(storeId) {
  const id = String(storeId || '').trim()
  if (!id) return db.products
  return db.products.filter((item) => isDefaultProduct(item) || item.storeId === id)
}

function scopedMembers(merchant) {
  if (isSuperMerchant(merchant)) return db.members
  const memberIds = new Set()
  scopedList(db.orders, merchant).forEach((item) => { if (item.memberId) memberIds.add(item.memberId) })
  scopedList(db.signups, merchant).forEach((item) => { if (item.memberId) memberIds.add(item.memberId) })
  scopedList(db.cellar, merchant).forEach((item) => { if (item.memberId) memberIds.add(item.memberId) })
  scopedList(db.rechargeRecords, merchant).forEach((item) => { if (item.memberId) memberIds.add(item.memberId) })
  scopedList(db.pointLogs, merchant).forEach((item) => { if (item.memberId) memberIds.add(item.memberId) })
  return db.members.filter((item) => memberIds.has(item.id))
}

function verifyBearer(req) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) throw httpError(401, '请先登录')
  return verifyToken(token)
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(Object.assign({}, payload, { iat: Date.now() }))).toString('base64url')
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

function verifyToken(token) {
  const [body, sig] = String(token).split('.')
  if (!body || !sig) throw httpError(401, 'Token 无效')
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url')
  const sigBuffer = Buffer.from(sig)
  const expectedBuffer = Buffer.from(expected)
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw httpError(401, 'Token 无效')
  }
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch (error) {
    throw httpError(401, 'Token 无效')
  }
}

async function code2Session(code) {
  const appid = process.env.WECHAT_APPID || ''
  const secret = process.env.WECHAT_SECRET || ''
  const allowMock = String(process.env.ALLOW_MOCK_WECHAT || '').toLowerCase() === 'true'
  if (!appid || !secret) {
    if (allowMock) {
      const hash = crypto.createHash('sha1').update(code).digest('hex').slice(0, 24)
      return { openid: `mock_${hash}`, unionid: '' }
    }
    throw httpError(500, '未配置 WECHAT_APPID/WECHAT_SECRET')
  }
  const api = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
  const result = await getJson(api)
  if (!result.openid) throw httpError(502, result.errmsg || '微信 code2Session 失败')
  return result
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let raw = ''
        res.on('data', (chunk) => (raw += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw || '{}'))
          } catch (error) {
            reject(error)
          }
        })
      })
      .on('error', reject)
  })
}

async function getWechatAccessToken() {
  const appid = process.env.WECHAT_APPID || ''
  const secret = process.env.WECHAT_SECRET || ''
  if (!appid || !secret) throw httpError(500, '未配置 WECHAT_APPID/WECHAT_SECRET')
  if (wechatAccessTokenCache && wechatAccessTokenCache.expiresAt > Date.now() + 60000) {
    return wechatAccessTokenCache.token
  }
  const result = await getJson(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`)
  if (!result.access_token) throw httpError(502, result.errmsg || '微信 access_token 获取失败')
  wechatAccessTokenCache = {
    token: result.access_token,
    expiresAt: Date.now() + Math.max(60, Number(result.expires_in || 7200) - 120) * 1000
  }
  return wechatAccessTokenCache.token
}

function postWechatBuffer(url, body) {
  const payload = JSON.stringify(body || {})
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const buffer = Buffer.concat(chunks)
          const type = String(res.headers['content-type'] || '')
          if (type.includes('application/json')) {
            let parsed = {}
            try {
              parsed = JSON.parse(buffer.toString('utf8') || '{}')
            } catch (error) {
              reject(error)
              return
            }
            reject(httpError(502, parsed.errmsg || parsed.message || '微信小程序码生成失败'))
            return
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(httpError(502, `微信小程序码生成失败：${res.statusCode}`))
            return
          }
          resolve(buffer)
        })
      }
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function createWechatJsapiPayment({ outTradeNo, description, total, openid, attach }) {
  ensureWechatPayConfig()
  if (!openid) throw httpError(400, '缺少微信 openid')
  const body = {
    appid: process.env.WX_PAY_APPID || process.env.WECHAT_APPID,
    mchid: process.env.WX_PAY_MCH_ID,
    description: String(description || '破壳派酒吧支付').slice(0, 127),
    out_trade_no: outTradeNo,
    notify_url: process.env.WX_PAY_NOTIFY_URL,
    amount: {
      total: yuanToFen(total),
      currency: 'CNY'
    },
    payer: {
      openid
    }
  }
  if (attach) body.attach = attach
  const result = await requestWechatPay('POST', '/v3/pay/transactions/jsapi', body)
  if (!result.prepay_id) throw httpError(502, result.message || '微信支付预下单失败')
  return signMiniProgramPay(result.prepay_id)
}

async function requestWechatPay(method, urlPath, body) {
  const bodyText = JSON.stringify(body || {})
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = crypto.randomBytes(16).toString('hex')
  const authorization = buildWechatPayAuthorization(method, urlPath, timestamp, nonce, bodyText)
  return new Promise((resolve, reject) => {
    const req = https.request(
      `${WX_PAY_API}${urlPath}`,
      {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyText),
          Authorization: authorization,
          'User-Agent': 'pokerpai-backend'
        }
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => (raw += chunk))
        res.on('end', () => {
          let parsed = {}
          try {
            parsed = JSON.parse(raw || '{}')
          } catch (error) {
            reject(error)
            return
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(httpError(502, parsed.message || raw || '微信支付请求失败'))
            return
          }
          resolve(parsed)
        })
      }
    )
    req.on('error', reject)
    req.write(bodyText)
    req.end()
  })
}

function buildWechatPayAuthorization(method, urlPath, timestamp, nonce, bodyText) {
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${bodyText}\n`
  const signature = crypto.createSign('RSA-SHA256').update(message).sign(getWechatPayPrivateKey(), 'base64')
  const params = [
    `mchid="${process.env.WX_PAY_MCH_ID}"`,
    `nonce_str="${nonce}"`,
    `signature="${signature}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${process.env.WX_PAY_SERIAL_NO}"`
  ].join(',')
  return `WECHATPAY2-SHA256-RSA2048 ${params}`
}

function signMiniProgramPay(prepayId) {
  const appId = process.env.WX_PAY_APPID || process.env.WECHAT_APPID
  const timeStamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = crypto.randomBytes(16).toString('hex')
  const packageValue = `prepay_id=${prepayId}`
  const message = `${appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`
  const paySign = crypto.createSign('RSA-SHA256').update(message).sign(getWechatPayPrivateKey(), 'base64')
  return {
    appId,
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: 'RSA',
    paySign
  }
}

async function handleWechatPayNotify(req, res) {
  const raw = await readRaw(req)
  verifyWechatPayNotify(req, raw)
  const body = JSON.parse(raw || '{}')
  const transaction = decryptWechatPayResource(body.resource || {})
  if (transaction.trade_state === 'SUCCESS') {
    await applyWechatPaySuccess(transaction)
  }
  send(res, 200, { code: 'SUCCESS', message: '成功' })
}

function verifyWechatPayNotify(req, raw) {
  const certPath = process.env.WX_PAY_PLATFORM_CERT_PATH || ''
  const requireVerify = String(process.env.WX_PAY_REQUIRE_NOTIFY_VERIFY || '').toLowerCase() === 'true'
  if (!certPath) {
    if (requireVerify) throw httpError(500, '未配置微信支付平台证书')
    return
  }
  const timestamp = req.headers['wechatpay-timestamp']
  const nonce = req.headers['wechatpay-nonce']
  const signature = req.headers['wechatpay-signature']
  const cert = fs.readFileSync(certPath, 'utf8')
  const message = `${timestamp}\n${nonce}\n${raw}\n`
  const ok = crypto.createVerify('RSA-SHA256').update(message).verify(cert, signature, 'base64')
  if (!ok) throw httpError(401, '微信支付通知验签失败')
}

function decryptWechatPayResource(resource) {
  const apiV3Key = process.env.WX_PAY_API_V3_KEY || ''
  if (!apiV3Key) throw httpError(500, '未配置 WX_PAY_API_V3_KEY')
  const ciphertext = Buffer.from(resource.ciphertext || '', 'base64')
  const authTag = ciphertext.subarray(ciphertext.length - 16)
  const data = ciphertext.subarray(0, ciphertext.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key), resource.nonce)
  decipher.setAuthTag(authTag)
  if (resource.associated_data) decipher.setAAD(Buffer.from(resource.associated_data))
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  return JSON.parse(decrypted)
}

async function applyWechatPaySuccess(transaction) {
  const outTradeNo = transaction.out_trade_no || ''
  const transactionId = transaction.transaction_id || ''
  let changed = false
  const order = db.orders.find((item) => item.outTradeNo === outTradeNo || item.id === outTradeNo)
  if (order && order.payStatus !== 'paid') {
    order.payStatus = 'paid'
    order.status = '已支付'
    order.transactionId = transactionId
    order.paidAt = transaction.success_time || now()
    const member = db.members.find((item) => item.id === order.memberId)
    if (member) {
      member.totalSpent = Number(member.totalSpent || 0) + Number(order.total || 0)
      member.points = Number(member.points || 0) + Math.floor(Number(order.total || 0))
      member.consumptionCount = Number(member.consumptionCount || 0) + 1
      member.level = levelBySpend(member.totalSpent, member.points)
    }
    changed = true
  }
  const record = db.rechargeRecords.find((item) => item.outTradeNo === outTradeNo || item.id === outTradeNo)
  if (record && record.payStatus !== 'paid') {
    const member = db.members.find((item) => item.id === record.memberId)
    const before = member ? Number(member.balance || 0) : Number(record.balanceBefore || 0)
    const after = before + Number(record.creditAmount || 0)
    if (member) member.balance = after
    record.payStatus = 'paid'
    record.status = '已支付'
    record.transactionId = transactionId
    record.balanceBefore = before
    record.balanceAfter = after
    record.paidAt = transaction.success_time || now()
    changed = true
  }
  if (changed) await persist()
}

function ensureWechatPayConfig() {
  if (!WX_PAY_ENABLED) throw httpError(503, '微信支付未启用')
  const required = ['WECHAT_APPID', 'WX_PAY_MCH_ID', 'WX_PAY_SERIAL_NO', 'WX_PAY_API_V3_KEY', 'WX_PAY_NOTIFY_URL']
  const missing = required.filter((key) => !process.env[key])
  if (!process.env.WX_PAY_PRIVATE_KEY && !process.env.WX_PAY_PRIVATE_KEY_PATH) missing.push('WX_PAY_PRIVATE_KEY_PATH')
  if (missing.length) throw httpError(500, `微信支付配置缺失：${missing.join(', ')}`)
}

function getWechatPayPrivateKey() {
  const inline = process.env.WX_PAY_PRIVATE_KEY || ''
  if (inline) return inline.replace(/\\n/g, '\n')
  return fs.readFileSync(process.env.WX_PAY_PRIVATE_KEY_PATH, 'utf8')
}

function yuanToFen(value) {
  return Math.round(Number(value || 0) * 100)
}

function xpyunConfig() {
  const user = process.env.XPYUN_USER || process.env.XPYUN_DEVELOPER_ID || ''
  const userKey = process.env.XPYUN_USER_KEY || process.env.XPYUN_DEVELOPER_KEY || ''
  if (!user || !userKey) throw httpError(500, '未配置芯烨云开发者ID或密钥')
  return { user, userKey }
}

async function printXpyunReceipt({ sn, content, copies = 1, voice = 0 }) {
  const { user, userKey } = xpyunConfig()
  const timestamp = Math.floor(Date.now() / 1000)
  const body = {
    user,
    userKey,
    sn,
    timestamp,
    sign: crypto.createHash('sha1').update(`${user}${userKey}${timestamp}`).digest('hex'),
    debug: Number(process.env.XPYUN_DEBUG || 0),
    content,
    mode: Number(process.env.XPYUN_PRINT_MODE || 0),
    copies,
    voice: Number(voice || 0)
  }
  const response = await postJson(`${XPYUN_API}/xprinter/print`, body)
  const ok = response && Number(response.code) === 0
  if (!ok) throw httpError(502, response && response.msg ? response.msg : '芯烨云打印失败')
  return {
    ok: true,
    code: response.code,
    message: response.msg || '已发送至芯烨云打印机',
    orderId: response.data || ''
  }
}

function postJson(url, body) {
  const payload = JSON.stringify(body || {})
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload)
        },
        timeout: 15000
      },
      (res) => {
        let raw = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => { raw += chunk })
        res.on('end', () => {
          let parsed = {}
          try {
            parsed = JSON.parse(raw || '{}')
          } catch (error) {
            reject(httpError(502, '芯烨云响应解析失败'))
            return
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(httpError(502, parsed.msg || parsed.message || '芯烨云接口请求失败'))
            return
          }
          resolve(parsed)
        })
      }
    )
    req.on('error', (error) => reject(httpError(502, error.message || '芯烨云接口请求失败')))
    req.write(payload)
    req.end()
  })
}

function buildReceiptContent(order, store) {
  const items = Array.isArray(order.items) ? order.items : []
  const mode = order.mode || '堂食'
  const tableName = order.tableName || (order.tableNo ? `${order.tableNo}号桌` : '未指定')
  const lines = [
    '<CB>破壳派酒吧</CB>',
    '<BR>',
    `<C>${escapeReceipt(store.shortName || store.name || order.storeName || '')}</C>`,
    '<BR>',
    '------------------------------',
    '<BR>',
    `订单号：${escapeReceipt(order.id)}`,
    '<BR>',
    `门店：${escapeReceipt(order.storeName || store.shortName || store.name || '')}`,
    '<BR>',
    `时间：${escapeReceipt(order.createdAt || now())}`,
    '<BR>',
    `类型：${escapeReceipt(mode)}`,
    '<BR>',
    `桌号：${escapeReceipt(tableName)}`,
    '<BR>',
    '------------------------------',
    '<BR>',
    '<B>商品明细</B>',
    '<BR>'
  ]
  items.forEach((item) => {
    const count = Number(item.count || 0)
    const price = Number(item.price || 0)
    const subtotal = price * count
    lines.push(`${escapeReceipt(item.name || '')}`)
    lines.push('<BR>')
    lines.push(`  ${money(price)} x ${count}    ${money(subtotal)}`)
    lines.push('<BR>')
  })
  lines.push('------------------------------')
  lines.push('<BR>')
  lines.push(`<RIGHT>合计：${money(order.total)}</RIGHT>`)
  lines.push('<BR>')
  lines.push(`状态：${escapeReceipt(order.status || '')}`)
  lines.push('<BR>')
  lines.push('<BR>')
  lines.push('<C>谢谢惠顾，欢迎再来</C>')
  lines.push('<BR><BR>')
  return lines.join('')
}

function escapeReceipt(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '＜')
    .replace(/>/g, '＞')
}

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`
}

buildReceiptContent = function buildReceiptContent(order, store) {
  const items = Array.isArray(order.items) ? order.items : []
  const mode = order.mode || '堂食'
  const tableName = order.tableName || (order.tableNo ? `${order.tableNo}号桌` : '未指定')
  const lines = [
    '<CB>破壳派酒吧</CB>',
    '<BR>',
    `<C>${escapeReceipt(store.shortName || store.name || order.storeName || '')}</C>`,
    '<BR>',
    '------------------------------',
    '<BR>',
    `订单号：${escapeReceipt(order.id)}`,
    '<BR>',
    `门店：${escapeReceipt(order.storeName || store.shortName || store.name || '')}`,
    '<BR>',
    `时间：${escapeReceipt(order.createdAt || now())}`,
    '<BR>',
    `类型：${escapeReceipt(mode)}`,
    '<BR>',
    `桌号：${escapeReceipt(tableName)}`,
    '<BR>',
    '------------------------------',
    '<BR>',
    '<B>商品明细</B>',
    '<BR>'
  ]
  items.forEach((item) => {
    const count = Number(item.count || 0)
    const price = Number(item.price || 0)
    const subtotal = price * count
    lines.push(`${escapeReceipt(item.name || '')}`)
    lines.push('<BR>')
    lines.push(`  ${money(price)} x ${count}    ${money(subtotal)}`)
    lines.push('<BR>')
  })
  lines.push('------------------------------')
  lines.push('<BR>')
  lines.push(`<RIGHT>合计：${money(order.total)}</RIGHT>`)
  lines.push('<BR>')
  lines.push(`状态：${escapeReceipt(order.status || '')}`)
  lines.push('<BR>')
  lines.push('<BR>')
  lines.push('<C>谢谢惠顾，欢迎再来</C>')
  lines.push('<BR><BR>')
  return lines.join('')
}

escapeReceipt = function escapeReceipt(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '《')
    .replace(/>/g, '》')
}

money = function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`
}

async function loadDb() {
  if (STORAGE_DRIVER === 'mysql') {
    return loadMysqlDb()
  }
  return loadFileDb()
}

function loadFileDb() {
  if (fs.existsSync(DB_FILE)) {
    return normalizeDbShape(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')))
  }
  const initial = createInitialDb()
  fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2))
  return initial
}

function createInitialDb() {
  return {
    stores: normalizeStores(sourceData.stores),
    categories: sourceData.categories,
    products: sourceData.products,
    activities: normalizeActivities(sourceData.activities),
    members: [],
    orders: [],
    signups: [],
    cellar: [],
    inventory: defaultInventory(sourceData.products),
    rechargeSettings: defaultRechargeSettings(),
    rechargeRecords: [],
    pointLogs: [],
    globalSettings: defaultGlobalSettings(),
    leaderboard: normalizeLeaderboardBoards(sourceData.leaderboard)
  }
}

async function loadMysqlDb() {
  const mysql = require('mysql2/promise')
  mysqlPool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'pokerclub',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'pokerclub',
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    charset: 'utf8mb4'
  })
  await mysqlPool.execute(`
    CREATE TABLE IF NOT EXISTS app_collections (
      name VARCHAR(64) NOT NULL PRIMARY KEY,
      payload LONGTEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  const [rows] = await mysqlPool.execute('SELECT name, payload FROM app_collections')
  if (!rows.length) {
    const initial = fs.existsSync(DB_FILE)
      ? normalizeDbShape(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')))
      : createInitialDb()
    await persistMysql(initial)
    return initial
  }

  const raw = {}
  rows.forEach((row) => {
    try {
      raw[row.name] = JSON.parse(row.payload)
    } catch (error) {
      raw[row.name] = null
    }
  })
  const next = normalizeDbShape(raw)
  const missing = COLLECTION_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(raw, key))
  if (missing) await persistMysql(next)
  return next
}

function normalizeDbShape(raw) {
  const next = Object.assign(
    {
      stores: normalizeStores(sourceData.stores),
      categories: sourceData.categories,
      products: sourceData.products,
      activities: normalizeActivities(sourceData.activities),
      members: [],
      orders: [],
      signups: [],
      cellar: [],
      inventory: [],
      rechargeSettings: defaultRechargeSettings(),
      rechargeRecords: [],
      pointLogs: [],
      globalSettings: defaultGlobalSettings(),
      leaderboard: normalizeLeaderboardBoards(sourceData.leaderboard)
    },
    raw || {}
  )
  next.stores = normalizeStores(Array.isArray(next.stores) && next.stores.length ? next.stores : sourceData.stores)
  next.activities = normalizeActivities(Array.isArray(next.activities) ? next.activities : [])
  if (!Array.isArray(next.categories) || !next.categories.length) next.categories = sourceData.categories
  if (!Array.isArray(next.products) || !next.products.length) next.products = sourceData.products
  if (!Array.isArray(next.inventory) || !next.inventory.length) next.inventory = defaultInventory(next.products)
  if (!next.rechargeSettings || !Array.isArray(next.rechargeSettings.packages)) next.rechargeSettings = defaultRechargeSettings()
  next.globalSettings = normalizeGlobalSettings(next.globalSettings)
  next.leaderboard = normalizeLeaderboardBoards(next.leaderboard)
  return next
}

async function persist() {
  if (STORAGE_DRIVER === 'mysql') {
    await persistMysql(db)
    return
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}

async function persistMysql(target) {
  if (!mysqlPool) throw new Error('MySQL storage is not initialized')
  const sql = `
    INSERT INTO app_collections (name, payload)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE payload = VALUES(payload)
  `
  for (const key of COLLECTION_KEYS) {
    await mysqlPool.execute(sql, [key, JSON.stringify(target[key] === undefined ? null : target[key])])
  }
}

function normalizeStores(stores) {
  const defaults = {
    jiangning: { latitude: 31.9567, longitude: 118.8465 },
    xinjiekou: { latitude: 32.0431, longitude: 118.7847 }
  }
  return stores.map((store) => Object.assign({ printerSn: '', printerName: '', printerCopies: 1 }, defaults[store.id] || {}, store))
}

function normalizeActivities(activities) {
  return activities.map((item) =>
    Object.assign(
      {
        latitude: 31.9567,
        longitude: 118.8465,
        pointsPrice: 0,
        detailImage: item.image || '/assets/activity-card.svg',
        environmentImage: '/assets/hero-bar.svg',
        resultImage: item.image || '/assets/activity-card.svg'
      },
      item
    )
  )
}

function defaultInventory(products) {
  return (products || []).map((product, index) => ({
    id: product.id,
    stock: 30 + index * 5
  }))
}

function getInventory() {
  return db.products.map((product) => {
    const stockItem = db.inventory.find((item) => item.id === product.id)
    return Object.assign({}, product, {
      stock: stockItem ? Number(stockItem.stock || 0) : 0
    })
  })
}

function inferStoreByActivity(activity) {
  if (activity.storeId) {
    const store = db.stores.find((item) => item.id === activity.storeId)
    if (store) return store
  }
  if (activity.location) {
    const store = db.stores.find((item) => String(activity.location).includes(item.shortName) || String(activity.location).includes(item.name))
    if (store) return store
  }
  return db.stores[0] || {}
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

function defaultGlobalSettings() {
  return {
    videoTitle: '门店视频专区',
    videoUrl: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    printTemplate: '破壳派酒吧订单小票\n门店：{{storeName}}\n订单号：{{orderId}}\n合计：¥{{total}}',
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

function getOverview(merchant) {
  const stores = scopedStores(merchant || { role: 'super_admin' })
  const orders = scopedList(db.orders, merchant || { role: 'super_admin' })
  const members = scopedMembers(merchant || { role: 'super_admin' })
  const cellar = scopedList(db.cellar, merchant || { role: 'super_admin' })
  const signups = scopedList(db.signups, merchant || { role: 'super_admin' })
  const rechargeRecords = scopedList(db.rechargeRecords, merchant || { role: 'super_admin' })
  return {
    storeCount: stores.length,
    orderCount: orders.length,
    memberCount: members.length,
    cellarCount: cellar.length,
    signupCount: signups.length,
    totalSales: orders.reduce((sum, item) => sum + Number(item.total || 0), 0),
    totalRecharge: rechargeRecords.reduce((sum, item) => sum + Number(item.creditAmount || 0), 0)
  }
}

function exportSummary(merchant) {
  const overview = getOverview(merchant)
  return [
    '门店统计导出',
    `门店数：${overview.storeCount}`,
    `订单数：${overview.orderCount}`,
    `会员数：${overview.memberCount}`,
    `存酒数：${overview.cellarCount}`,
    `报名数：${overview.signupCount}`,
    `订单总额：${overview.totalSales}`,
    `充值总额：${overview.totalRecharge}`
  ].join('\n')
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
  const fallback = normalizeLeaderboardList(sourceData.leaderboard)
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

function rankedLeaderboard(type) {
  const boards = normalizeLeaderboardBoards(db.leaderboard)
  if (LEADERBOARD_TYPES.includes(type)) return rankLeaderboardList(boards[type])
  return LEADERBOARD_TYPES.reduce((next, key) => {
    next[key] = rankLeaderboardList(boards[key])
    return next
  }, {})
}

function levelBySpend(totalSpent = 0, points = 0) {
  if (totalSpent >= 10000 || points >= 10000) return '黑金会员'
  if (totalSpent >= 5000 || points >= 5000) return '铂金会员'
  if (totalSpent >= 1000 || points >= 1000) return '黄金会员'
  if (totalSpent >= 300 || points >= 300) return '白银会员'
  return '普通会员'
}

function upsert(list, data, defaults) {
  const id = data.id || defaults.id
  const record = Object.assign({}, defaults, data, { id })
  const index = list.findIndex((item) => item.id === id)
  if (index > -1) list[index] = Object.assign({}, list[index], record)
  else list.unshift(record)
  return index > -1 ? list[index] : record
}

function findById(list, id, message) {
  const item = list.find((entry) => entry.id === id)
  if (!item) throw httpError(404, message)
  return item
}

function findMember(id) {
  return db.members.find((item) => item.id === id || item.openid === id || item.nickname === id) || (() => { throw httpError(404, '会员不存在') })()
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 2 * 1024 * 1024) {
        reject(httpError(413, '请求体过大'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(httpError(400, 'JSON 格式错误'))
      }
    })
  })
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 2 * 1024 * 1024) {
        reject(httpError(413, '请求体过大'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(raw))
    req.on('error', reject)
  })
}

function readMultipartFile(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || ''
    const boundaryMatch = contentType.match(/boundary=([^;]+)/i)
    if (!boundaryMatch) {
      reject(httpError(400, '上传格式错误'))
      return
    }
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      chunks.push(chunk)
      size += chunk.length
      if (size > 80 * 1024 * 1024) {
        reject(httpError(413, '上传文件过大'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(parseMultipartFile(Buffer.concat(chunks), boundaryMatch[1]))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function parseMultipartFile(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`)
  let cursor = 0
  while (cursor < buffer.length) {
    const start = buffer.indexOf(boundaryBuffer, cursor)
    if (start < 0) break
    const headerStart = start + boundaryBuffer.length + 2
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart)
    if (headerEnd < 0) break
    const header = buffer.slice(headerStart, headerEnd).toString('utf8')
    const dataStart = headerEnd + 4
    const next = buffer.indexOf(boundaryBuffer, dataStart)
    if (next < 0) break
    const dataEnd = next - 2
    const disposition = header.match(/content-disposition:[^\r\n]+/i)
    if (disposition && /name="file"/.test(disposition[0])) {
      const filenameMatch = disposition[0].match(/filename="([^"]*)"/)
      const typeMatch = header.match(/content-type:\s*([^\r\n]+)/i)
      const contentType = typeMatch ? typeMatch[1].trim().toLowerCase() : 'application/octet-stream'
      const mediaType = contentType.startsWith('video/') ? 'video' : 'image'
      if (!isAllowedUploadType(contentType, mediaType)) throw httpError(400, '不支持的文件类型')
      return {
        filename: filenameMatch ? filenameMatch[1] : '',
        contentType,
        mediaType,
        data: buffer.slice(dataStart, dataEnd)
      }
    }
    cursor = next
  }
  return null
}

function isAllowedUploadType(contentType, mediaType) {
  const images = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  const videos = ['video/mp4', 'video/quicktime', 'video/x-m4v']
  return mediaType === 'video' ? videos.includes(contentType) : images.includes(contentType)
}

function extensionByMime(contentType, filename, mediaType) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-m4v': '.m4v'
  }
  if (map[contentType]) return map[contentType]
  const ext = path.extname(filename || '').toLowerCase()
  if (ext) return ext
  return mediaType === 'video' ? '.mp4' : '.jpg'
}

function match(pathname, pattern) {
  const a = pathname.split('/').filter(Boolean)
  const b = pattern.split('/').filter(Boolean)
  return a.length === b.length && b.every((part, index) => part.startsWith(':') || part === a[index])
}

function params(pathname, pattern) {
  const a = pathname.split('/').filter(Boolean)
  const b = pattern.split('/').filter(Boolean)
  return b.reduce((result, part, index) => {
    if (part.startsWith(':')) result[part.slice(1)] = decodeURIComponent(a[index])
    return result
  }, {})
}

function normalizePath(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}

function sendOk(res, data) {
  send(res, 200, { ok: true, data })
}

function sendError(res, status, message) {
  send(res, status, { ok: false, message })
}

function send(res, status, body) {
  res.statusCode = status
  if (body === null) return res.end()
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function sendText(res, text) {
  res.statusCode = 200
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.end(text)
}

function setCors(res) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type,authorization')
}

function httpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function parseJsonEnv(name) {
  const value = process.env[name]
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (error) {
    console.error(`Invalid JSON env ${name}`, error.message)
    return null
  }
}

function now(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function dateOnly(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function loadEnv() {
  const file = path.join(__dirname, '.env')
  if (!fs.existsSync(file)) return
  fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((line) => {
      const text = line.trim()
      if (!text || text.startsWith('#')) return
      const index = text.indexOf('=')
      if (index < 0) return
      const key = text.slice(0, index).trim()
      const value = text.slice(index + 1).trim()
      if (!process.env[key]) process.env[key] = value
    })
}
