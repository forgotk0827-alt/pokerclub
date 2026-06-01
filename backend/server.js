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
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || 'https://www.pokerpai.cn').replace(/\/+$/, '')
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
  'voucherSettings',
  'voucherLogs',
  'rechargeRecords',
  'pointLogs',
  'globalSettings',
  'leaderboard',
  'leaderboardMeta',
  'staffAccounts',
  'authRevocations'
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
    if (req.method === 'POST' && pathname === '/api/auth/logout') return await handleAuthLogout(req, res)
    if (req.method === 'POST' && pathname === '/api/merchant/logout') return await handleMerchantLogout(req, res)
    if (req.method === 'POST' && pathname === '/api/wechat/pay/notify') return await handleWechatPayNotify(req, res)
    if (req.method === 'GET' && pathname.startsWith('/api/uploads/')) return await handleUploadedFile(req, res, pathname)
    if (req.method === 'POST' && pathname === '/api/merchant/upload') return await handleMerchantUpload(req, res)

    if (req.method === 'GET' && pathname === '/api/stores') return sendOk(res, db.stores)
    if (req.method === 'GET' && pathname === '/api/categories') return sendOk(res, db.categories)
    if (req.method === 'GET' && pathname === '/api/products') return sendOk(res, publicProducts(url.searchParams.get('storeId')))
    if (req.method === 'GET' && pathname === '/api/activities') return sendOk(res, db.activities)
    if (req.method === 'GET' && match(pathname, '/api/activities/:id/signups')) return await handleGetActivitySignups(req, res, pathname)
    if (req.method === 'GET' && match(pathname, '/api/activities/:id')) return await handleGetActivity(req, res, pathname)
    if (req.method === 'GET' && pathname === '/api/recharge-settings') return sendOk(res, db.rechargeSettings)
    if (req.method === 'GET' && pathname === '/api/voucher-settings') return sendOk(res, db.voucherSettings || defaultVoucherSettings())
    if (req.method === 'GET' && pathname === '/api/global-settings') return sendOk(res, db.globalSettings)
    if (req.method === 'GET' && pathname === '/api/leaderboard') return await handleGetLeaderboard(req, res, url)

    if (pathname.startsWith('/api/my/') || pathname === '/api/orders' || pathname === '/api/recharge' || pathname === '/api/cellar' || pathname.startsWith('/api/cellar/') || pathname === '/api/signups' || pathname.startsWith('/api/wechat/pay/')) {
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
      if (req.method === 'PATCH' && match(pathname, '/api/cellar/:id/status')) return await handleUserCellarStatus(req, res, pathname, user)
      if (req.method === 'POST' && match(pathname, '/api/cellar/:id/renew')) return await handleRenewCellar(req, res, pathname, user)
      if (req.method === 'POST' && pathname === '/api/signups') return await handleCreateSignup(req, res, user)
      if (req.method === 'POST' && pathname === '/api/wechat/pay/order') return await handleCreateOrderPayment(req, res, user)
      if (req.method === 'POST' && pathname === '/api/wechat/pay/recharge') return await handleCreateRechargePayment(req, res, user)
    }

    if (pathname.startsWith('/api/merchant/')) {
      const merchant = requireMerchant(req)
      ensureMerchantPermission(merchant, pathname)
      if (req.method === 'GET' && pathname === '/api/merchant/data/overview') return sendOk(res, getOverview(merchant))
      if (req.method === 'GET' && pathname === '/api/merchant/data/export') return sendText(res, exportSummary(merchant))
      if (req.method === 'GET' && pathname === '/api/merchant/orders') return sendOk(res, scopedList(db.orders, merchant))
      if (req.method === 'PATCH' && match(pathname, '/api/merchant/orders/:id/status')) return await handleOrderStatus(req, res, pathname, merchant)
      if (req.method === 'POST' && match(pathname, '/api/merchant/orders/:id/print')) return await handlePrintOrder(req, res, pathname, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/table-qrcodes') return sendOk(res, tableQrcodeList(merchant))
      if (req.method === 'POST' && pathname === '/api/merchant/table-qrcodes/generate') return await handleGenerateTableQrcodes(req, res, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/members') return sendOk(res, scopedMembers(merchant))
      if (req.method === 'GET' && pathname === '/api/merchant/staff-accounts') return await handleGetStaffAccounts(req, res, merchant)
      if (req.method === 'POST' && pathname === '/api/merchant/staff-accounts') return await handleSaveStaffAccount(req, res, merchant)
      if (req.method === 'DELETE' && match(pathname, '/api/merchant/staff-accounts/:id')) return await handleDeleteStaffAccount(req, res, pathname, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/signups') return sendOk(res, scopedList(db.signups, merchant))
      if (req.method === 'PATCH' && match(pathname, '/api/merchant/signups/:id/status')) return await handleSignupStatus(req, res, pathname, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/cellar') return sendOk(res, scopedList(db.cellar, merchant))
      if (req.method === 'PATCH' && match(pathname, '/api/merchant/cellar/:id/status')) return await handleCellarStatus(req, res, pathname, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/products') return sendOk(res, scopedProducts(merchant))
      if (req.method === 'POST' && pathname === '/api/merchant/products') return await handleSaveProduct(req, res, merchant)
      if (req.method === 'DELETE' && match(pathname, '/api/merchant/products/:id')) return await handleDeleteProduct(req, res, pathname, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/categories') return sendOk(res, scopedCategories(merchant))
      if (req.method === 'POST' && pathname === '/api/merchant/categories') return await handleSaveCategory(req, res, merchant)
      if (req.method === 'DELETE' && match(pathname, '/api/merchant/categories/:id')) return await handleDeleteCategory(req, res, pathname, merchant)
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
      if (req.method === 'GET' && pathname === '/api/merchant/voucher-settings') return sendOk(res, db.voucherSettings || defaultVoucherSettings())
      if (req.method === 'POST' && pathname === '/api/merchant/voucher-settings') return await handleVoucherSettings(req, res)
      if (req.method === 'GET' && pathname === '/api/merchant/recharge-records') return sendOk(res, scopedList(db.rechargeRecords, merchant))
      if (req.method === 'GET' && pathname === '/api/merchant/voucher-logs') return sendOk(res, scopedList(db.voucherLogs, merchant))
      if (req.method === 'GET' && pathname === '/api/merchant/point-logs') return sendOk(res, scopedList(db.pointLogs, merchant))
      if (req.method === 'POST' && match(pathname, '/api/merchant/members/:id/balance')) return await handleAdjustBalance(req, res, pathname, merchant)
      if (req.method === 'POST' && match(pathname, '/api/merchant/members/:id/points')) return await handleAdjustPoints(req, res, pathname, merchant)
      if (req.method === 'POST' && match(pathname, '/api/merchant/members/:id/pieces')) return await handleAdjustPieces(req, res, pathname, merchant)
      if (req.method === 'POST' && match(pathname, '/api/merchant/members/:id/vouchers')) return await handleGrantDrinkVoucher(req, res, pathname, merchant)
      if (req.method === 'GET' && pathname === '/api/merchant/global-settings') return sendOk(res, db.globalSettings)
      if (req.method === 'POST' && pathname === '/api/merchant/global-settings') return await handleGlobalSettings(req, res)
      if (req.method === 'GET' && pathname === '/api/merchant/leaderboard') return await handleGetLeaderboard(req, res, url)
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
  await runScheduledMaintenance()
  const maintenanceTimer = setInterval(() => {
    runScheduledMaintenance().catch((error) => console.error('Scheduled maintenance failed', error))
  }, 60 * 1000)
  if (maintenanceTimer.unref) maintenanceTimer.unref()
  server.listen(PORT, HOST, () => {
    console.log(`Pokerpai backend running at http://${HOST}:${PORT} with ${STORAGE_DRIVER} storage`)
  })
}

async function runScheduledMaintenance() {
  if (!db) return
  if (syncLeaderboardState(false)) await persist()
}

async function handleWechatLogin(req, res) {
  const body = await readJson(req)
  const code = String(body.code || '').trim()
  if (!code) throw httpError(400, '缺少 code')

  const identity = await code2Session(code)
  const openid = identity.openid
  const unionid = identity.unionid || ''
  const phone = await getWechatPhoneNumber(body.phoneCode || body.phoneNumberCode || body.phone_code || '')
  const phoneValue = String(body.phone || phone || '').trim()
  let member = db.members.find((item) => item.openid === openid)
  if (!member && phoneValue) member = db.members.find((item) => samePhone(item.phone, phoneValue))
  if (!member) {
      member = {
        id: `MB${Date.now()}`,
        openid,
        unionid,
        nickname: body.nickname || `微信用户${String(openid).slice(-4)}`,
        avatarUrl: body.avatarUrl || '',
        phone: phoneValue,
        level: '普通会员',
        balance: 0,
        points: 0,
        totalSpent: 0,
        consumptionCount: 0,
        gems: 0,
        drinkVoucherCount: 0,
        invitePieces: 0,
        createdAt: now()
      }
    db.members.unshift(member)
  } else {
    member.openid = member.openid || openid
    member.unionid = unionid || member.unionid || ''
    if (body.nickname) member.nickname = body.nickname
    if (body.avatarUrl) member.avatarUrl = body.avatarUrl
    if (phoneValue) member.phone = phoneValue
  }
  member = applyPhoneMemberId(db, member, phoneValue)

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
  const permissions = normalizeStaffPermissions(account.permissions || [])
  const token = signToken({ type: 'merchant', username, role: account.role, storeId: account.storeId, permissions })
  sendOk(res, {
    token,
    username,
    name: account.name,
    role: account.role,
    storeId: account.storeId,
    storeName: store ? store.shortName || store.name : '全部门店',
    permissions
  })
}

async function handleAuthLogout(req, res) {
  const auth = String(req.headers.authorization || '')
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) throw httpError(401, '请先登录')
  decodeToken(token)
  revokeToken(token, 'user')
  await persist()
  sendOk(res, { ok: true })
}

async function handleMerchantLogout(req, res) {
  const auth = String(req.headers.authorization || '')
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) throw httpError(401, '请先登录')
  decodeToken(token)
  revokeToken(token, 'merchant')
  await persist()
  sendOk(res, { ok: true })
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

function handleGetActivitySignups(req, res, pathname) {
  const { id } = params(pathname, '/api/activities/:id/signups')
  const activity = db.activities.find((item) => item.id === id)
  if (!activity) throw httpError(404, '活动不存在')
  const list = db.signups
    .filter((item) => item.activityId === id)
    .map((item, index) => ({
      id: item.id || `${id}-${index}`,
      avatarUrl: item.avatarUrl || '',
      avatarText: activitySignupDisplayName(item, index).slice(0, 1),
      displayName: activitySignupDisplayName(item, index),
      status: item.status || '已报名'
    }))
  sendOk(res, list)
}

function activitySignupDisplayName(signup, index = 0) {
  const seed = String(signup.id || signup.memberId || signup.createdAt || index)
  let total = index
  for (let i = 0; i < seed.length; i += 1) total += seed.charCodeAt(i)
  return total % 2 === 0 ? '帅哥' : '美女'
}

async function handleUpdateProfile(req, res, user) {
  const body = await readJson(req)
  const allowed = ['nickname', 'avatarUrl', 'phone', 'gender', 'level']
  allowed.forEach((key) => {
    if (body[key] !== undefined) user.member[key] = body[key]
  })
  const member = applyPhoneMemberId(db, user.member, user.member.phone)
  user.member = member
  await persist()
  sendOk(res, member)
}

async function handleCreateOrder(req, res, user) {
  const body = await readJson(req)
  const sourceItems = Array.isArray(body.items) ? body.items : []
  let cashTotal = 0
  let pointsUsed = 0
  const items = sourceItems.map((item) => {
    const count = Math.max(0, Number(item.count || 0))
    const price = Math.max(0, Number(item.originPrice || item.price || 0))
    const points = Math.max(0, Number(item.originPoints || item.points || 0))
    const payType = item.payType === 'points' && points > 0 ? 'points' : 'cash'
    const originSubtotal = price * count
    const subtotal = payType === 'points' ? 0 : originSubtotal
    const pointsSubtotal = payType === 'points' ? points * count : 0
    cashTotal += subtotal
    pointsUsed += pointsSubtotal
    return Object.assign({}, item, {
      count,
      price,
      points,
      payType,
      originPrice: price,
      originPoints: points,
      originSubtotal,
      subtotal,
      payableSubtotal: subtotal,
      pointsSubtotal
    })
  }).filter((item) => item.count > 0)
  if (!items.length) throw httpError(400, '订单商品不能为空')
  const store = db.stores.find((item) => item.id === body.storeId) || db.stores[0]
  const table = normalizeOrderTable(store, body)
  const total = cashTotal
  const pointsAvailable = Number(user.member.points || 0)
  if (pointsUsed > pointsAvailable) throw httpError(400, '积分不足')
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
    originalTotal: items.reduce((sum, item) => sum + Number(item.originSubtotal || 0), 0),
    cashTotal,
    pointsUsed,
    total,
    createdAt: now()
  }
  db.orders.unshift(order)
  if (pointsUsed > 0) {
    db.pointLogs.unshift({
      id: `PT${Date.now()}`,
      memberId: user.member.id,
      nickname: user.member.nickname,
      delta: -pointsUsed,
      reason: `订单积分兑换 ${order.id}`,
      storeId: store.id,
      storeName: store.shortName || store.name,
      operator: '系统',
      createdAt: now()
    })
  }
  user.member.totalSpent = Number(user.member.totalSpent || 0) + total
  user.member.points = Math.max(0, Number(user.member.points || 0) - pointsUsed)
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
  const voucherCount = voucherCountForRecharge(pack, payAmount)
  if (!payAmount || !creditAmount) throw httpError(400, '充值金额无效')
  const before = Number(user.member.balance || 0)
  const after = before + creditAmount
  user.member.balance = after
  user.member.drinkVoucherCount = Math.max(0, Number(user.member.drinkVoucherCount || 0) + voucherCount)
  const record = {
    id: `RC${Date.now()}`,
    type: 'recharge',
    memberId: user.member.id,
    nickname: user.member.nickname,
    packageId: pack.id || '',
    packageLabel: pack.label || '',
    payAmount,
    creditAmount,
    voucherCount,
    balanceBefore: before,
    balanceAfter: after,
    operator: '微信支付',
    note: pack.tip || '',
    createdAt: now()
  }
  db.rechargeRecords.unshift(record)
  if (voucherCount) addVoucherLog(user.member, voucherCount, '储值充值自动发放酒水券', '系统')
  await persist()
  sendOk(res, { member: user.member, record })
}

async function handleCreateOrderPayment(req, res, user) {
  const body = await readJson(req)
  const sourceItems = Array.isArray(body.items) ? body.items : []
  let cashTotal = 0
  let pointsUsed = 0
  const items = sourceItems.map((item) => {
    const count = Math.max(0, Number(item.count || 0))
    const price = Math.max(0, Number(item.originPrice || item.price || 0))
    const points = Math.max(0, Number(item.originPoints || item.points || 0))
    const payType = item.payType === 'points' && points > 0 ? 'points' : 'cash'
    const originSubtotal = price * count
    const subtotal = payType === 'points' ? 0 : originSubtotal
    const pointsSubtotal = payType === 'points' ? points * count : 0
    cashTotal += subtotal
    pointsUsed += pointsSubtotal
    return Object.assign({}, item, {
      count,
      price,
      points,
      payType,
      originPrice: price,
      originPoints: points,
      originSubtotal,
      subtotal,
      payableSubtotal: subtotal,
      pointsSubtotal
    })
  }).filter((item) => item.count > 0)
  if (!items.length) throw httpError(400, '订单商品不能为空')
  const store = db.stores.find((item) => item.id === body.storeId) || db.stores[0]
  const table = normalizeOrderTable(store, body)
  const originalTotal = Number(body.originalTotal || items.reduce((sum, item) => sum + Number(item.originPrice || item.price || 0) * Number(item.count || 0), 0))
  const voucherDiscount = 0
  const voucherCountUsed = 0
  const payableBeforeBalance = cashTotal
  const balanceAvailable = Number(user.member.balance || 0)
  const balanceUsed = Math.max(0, Math.min(Number(body.balanceUsed || 0), balanceAvailable, payableBeforeBalance))
  const total = Math.max(0, payableBeforeBalance - balanceUsed)
  const pointsAvailable = Number(user.member.points || 0)
  if (pointsUsed > pointsAvailable) throw httpError(400, '积分不足')
  const paymentType = total > 0
    ? (balanceUsed > 0 || pointsUsed > 0 ? 'mixed' : 'wechat')
    : (pointsUsed > 0 ? (balanceUsed > 0 ? 'points_balance' : 'points') : 'balance')
  if (originalTotal <= 0) throw httpError(400, '订单金额无效')
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
    paymentType,
    outTradeNo: `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`,
    items,
    originalTotal,
    cashTotal,
    pointsUsed,
    pointsDeducted: false,
    voucherDiscount,
    voucherCountUsed,
    voucherRuleName: String(body.voucherRuleName || '').trim(),
    balanceUsed,
    payableBeforeBalance,
    total,
    createdAt: now()
  }
  db.orders.unshift(order)
  if (balanceUsed > 0) {
    user.member.balance = Math.max(0, balanceAvailable - balanceUsed)
  }
  if (pointsUsed > 0) {
    user.member.points = Math.max(0, pointsAvailable - pointsUsed)
    user.member.level = levelBySpend(user.member.totalSpent || 0, user.member.points)
    order.pointsDeducted = true
    db.pointLogs.unshift({
      id: `PT${Date.now()}`,
      memberId: user.member.id,
      nickname: user.member.nickname,
      delta: -pointsUsed,
      reason: `订单积分兑换 ${order.id}`,
      storeId: store.id,
      storeName: store.shortName || store.name,
      operator: '系统',
      createdAt: now()
    })
  }
  await persist()
  if (total <= 0) {
    order.payStatus = 'paid'
    order.status = '已支付'
    order.transactionId = `BALANCE${Date.now()}`
    order.paidAt = now()
    const member = db.members.find((item) => item.id === order.memberId)
    if (member) {
      member.totalSpent = Number(member.totalSpent || 0) + Number(order.total || 0)
      member.consumptionCount = Number(member.consumptionCount || 0) + 1
      member.drinkVoucherCount = Math.max(0, Number(member.drinkVoucherCount || 0) - Number(order.voucherCountUsed || 0))
      member.level = levelBySpend(member.totalSpent, member.points)
    }
    syncOrderActivitySignups(order, member)
    await autoPrintPaidOrder(order)
    await persist()
    sendOk(res, { order, payment: null, paid: true })
    return
  }
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
  const voucherCount = voucherCountForRecharge(pack, payAmount)
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
    voucherCount,
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
    status: '审核中',
    createdAt: now(created),
    expireAt: dateOnly(expire),
    reminder: '待商家审核通过后开始存放'
  }
  db.cellar.unshift(record)
  await persist()
  sendOk(res, record)
}

async function handleUserCellarStatus(req, res, pathname, user) {
  const body = await readJson(req)
  const { id } = params(pathname, '/api/cellar/:id/status')
  const record = db.cellar.find((item) => item.id === id && item.memberId === user.member.id)
  if (!record) throw httpError(404, '存酒记录不存在')
  const status = String(body.status || '').trim()
  if (!status) throw httpError(400, '请填写状态')
  record.status = status
  record.updatedAt = now()
  await persist()
  sendOk(res, record)
}

async function handleRenewCellar(req, res, pathname, user) {
  const body = await readJson(req)
  const { id } = params(pathname, '/api/cellar/:id/renew')
  const record = db.cellar.find((item) => item.id === id && item.memberId === user.member.id)
  if (!record) throw httpError(404, '存酒记录不存在')
  const months = Math.max(1, Number(body.months || 3))
  const baseDate = new Date(String(record.expireAt || dateOnly(new Date())).replace(/-/g, '/'))
  const expire = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate
  expire.setMonth(expire.getMonth() + months)
  record.months = Number(record.months || 0) + months
  record.status = '存放中'
  record.expireAt = dateOnly(expire)
  record.reminder = '已续存，到期前7天提醒'
  record.updatedAt = now()
  await persist()
  sendOk(res, record)
}

async function handleCreateSignup(req, res, user) {
  const body = await readJson(req)
  const activity = findById(db.activities, body.activityId || body.id, '活动不存在')
  const deadlineAt = parseDeadlineAt(activity.deadlineAt || activity.deadline)
  if (deadlineAt && Date.now() > deadlineAt.getTime()) throw httpError(400, '报名已截止')
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
    avatarUrl: user.member.avatarUrl || '',
    avatarText: (user.member.avatarText || user.member.nickname || '').slice(0, 1),
    status: '已报名',
    createdAt: now()
  }
  db.signups.unshift(signup)
  activity.joined = joined + 1
  await persist()
  sendOk(res, signup)
}

function activityIdFromOrderItem(item) {
  if (!item || item.categoryId !== 'activity') return ''
  return String(item.activityId || item.id || '').replace(/^signup-/, '')
}

function createActivitySignup(activity, member) {
  const store = inferStoreByActivity(activity)
  return {
    id: `SU${Date.now()}${Math.floor(Math.random() * 1000)}`,
    activityId: activity.id,
    memberId: member.id,
    nickname: member.nickname,
    title: activity.title,
    date: activity.date,
    storeId: store.id || activity.storeId || '',
    storeName: store.shortName || store.name || '',
    location: activity.location || store.address || '',
    price: Number(activity.price || 0),
    pointsPrice: Number(activity.pointsPrice || 0),
    avatarUrl: member.avatarUrl || '',
    avatarText: (member.avatarText || member.nickname || '').slice(0, 1),
    status: '已报名',
    createdAt: now()
  }
}

function syncOrderActivitySignups(order, member) {
  if (!order || !member) return false
  const activityIds = Array.from(new Set((order.items || []).map(activityIdFromOrderItem).filter(Boolean)))
  let changed = false
  activityIds.forEach((activityId) => {
    const activity = db.activities.find((item) => item.id === activityId)
    if (!activity) return
    if (db.signups.find((item) => item.memberId === member.id && item.activityId === activity.id)) return
    const deadlineAt = parseDeadlineAt(activity.deadlineAt || activity.deadline)
    if (deadlineAt && Date.now() > deadlineAt.getTime()) return
    const quota = Number(activity.quota || 0)
    const joined = Number(activity.joined || 0)
    if (quota && joined >= quota) return
    db.signups.unshift(createActivitySignup(activity, member))
    activity.joined = joined + 1
    changed = true
  })
  return changed
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
  const { record, result } = await sendOrderToPrinter(order, {
    copies: body.copies,
    voice: body.voice || 0,
    operator: merchant.username
  })
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

async function handleSaveCategory(req, res, merchant) {
  const body = applyMerchantStore(await readJson(req), merchant)
  const name = String(body.name || '').trim()
  if (!name) throw httpError(400, '????????')
  const category = upsert(db.categories, body, {
    id: `cat-${Date.now()}`,
    name,
    storeId: String(body.storeId || '').trim()
  })
  await persist()
  sendOk(res, category)
}

async function handleDeleteCategory(req, res, pathname, merchant) {
  const { id } = params(pathname, '/api/merchant/categories/:id')
  const category = findById(db.categories, id, '?????')
  ensureMerchantStoreAccess(merchant, category.storeId || merchant.storeId)
  db.categories = db.categories.filter((item) => item.id !== id)
  await persist()
  sendOk(res, { id })
}

async function handleSaveActivity(req, res, merchant) {


  const body = applyMerchantStore(await readJson(req), merchant)
  const dayLabel = String(body.dayLabel || '').trim() || inferActivityDayLabel(body.date)
  const activity = upsert(db.activities, body, {
    id: `act-${Date.now()}`,
    title: '',
    type: '国际扑克',
    date: '',
    dayLabel,
    location: '',
    latitude: 0,
    longitude: 0,
    deadline: '',
    deadlineAt: '',
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
  const payload = {
    id: body.id,
    name: String(body.name || '').trim(),
    shortName: String(body.shortName || '').trim(),
    address: String(body.address || '').trim(),
    phone: String(body.phone || '').trim(),
    status: String(body.status || '营业中').trim(),
    latitude: Number(body.latitude || 0),
    longitude: Number(body.longitude || 0),
    businessHours: String(body.businessHours || '14:00 - 05:00').trim(),
    cover: body.cover || '/bac-clean.jpg',
    printerSn: String(body.printerSn || '').trim(),
    printerName: String(body.printerName || '').trim(),
    printerCopies: Math.max(1, Number(body.printerCopies || 1))
  }
  if (!payload.name || !payload.shortName) throw httpError(400, '请填写门店名称')
  const store = upsert(db.stores, payload, {
    id: `store-${Date.now()}`,
    name: '',
    shortName: '',
    address: '',
    phone: '',
    status: '营业中',
    latitude: 0,
    longitude: 0,
    businessHours: '14:00 - 05:00',
    cover: '/bac-clean.jpg',
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
  await persist()
  sendOk(res, { id, removed: db.stores.length < before })
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
  db.rechargeSettings.packages = normalizeRechargePackages(db.rechargeSettings.packages)
  await persist()
  sendOk(res, db.rechargeSettings)
}

async function handleVoucherSettings(req, res) {
  const body = await readJson(req)
  const next = Object.assign({}, defaultVoucherSettings(), db.voucherSettings || {}, body)
  next.buyCount = Math.max(1, Number(next.buyCount || 0))
  next.freeCount = Math.max(0, Number(next.freeCount || 0))
  next.title = String(next.title || '').trim() || defaultVoucherSettings().title
  next.ruleName = String(next.ruleName || '').trim() || `${next.buyCount}减${next.freeCount}`
  next.note = normalizeVoucherNote(next.note)
  next.expireText = String(next.expireText || '').trim() || defaultVoucherSettings().expireText
  db.voucherSettings = next
  await persist()
  sendOk(res, db.voucherSettings)
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

async function handleGrantDrinkVoucher(req, res, pathname, merchant) {
  const { id } = params(pathname, '/api/merchant/members/:id/vouchers')
  const body = await readJson(req)
  const member = findMember(id)
  ensureMerchantMemberAccess(merchant, member.id)
  const count = Number(body.count || 0)
  if (!count) throw httpError(400, '调整数量无效')
  const storeId = isSuperMerchant(merchant) ? String(body.storeId || '').trim() : merchant.storeId
  member.drinkVoucherCount = Math.max(0, Number(member.drinkVoucherCount || 0) + count)
  const record = addVoucherLog(member, count, String(body.note || '').trim() || '手动调整酒水券', merchant.username, storeId)
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

async function handleAdjustPieces(req, res, pathname, merchant) {
  const { id } = params(pathname, '/api/merchant/members/:id/pieces')
  const body = await readJson(req)
  const member = findMember(id)
  ensureMerchantMemberAccess(merchant, member.id)
  const storeId = isSuperMerchant(merchant) ? String(body.storeId || '').trim() : merchant.storeId
  const delta = Number(body.delta || 0)
  if (!delta) throw httpError(400, '调整碎片无效')
  member.invitePieces = Math.max(0, Number(member.invitePieces || 0) + delta)
  member.gems = member.invitePieces
  const record = {
    id: `PI${Date.now()}`,
    type: 'pieces',
    memberId: member.id,
    nickname: member.nickname,
    delta,
    reason: body.reason || '手动调整碎片',
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
    const nextList = normalizeLeaderboardList(body.list).map((item, index) => Object.assign({}, item, { sortOrder: index + 1 }))
    db.leaderboard[type] = nextList
  } else if (body.boards && typeof body.boards === 'object') {
    db.leaderboard = normalizeLeaderboardBoards(body.boards)
  } else {
    upsert(db.leaderboard[type], body, { id: `${type}-rank-${Date.now()}`, username: '', score: 0 })
  }
  syncLeaderboardState(true)
  await persist()
  sendOk(res, rankedLeaderboard())
}

async function handleGetLeaderboard(req, res, url) {
  const changed = syncLeaderboardState(false)
  if (changed) await persist()
  sendOk(res, rankedLeaderboard(url.searchParams.get('type')))
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
  payload.permissions = normalizeStaffPermissions(payload.permissions || [])
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
  const baseAccounts = Array.isArray(envAccounts) && envAccounts.length ? envAccounts : accounts
  return baseAccounts.concat(normalizeStaffAccounts(db && db.staffAccounts))
}

function staffPermissionOptions() {
  return ['订单', '菜单管理', '活动管理', '充值', '酒水券管理', '数据管理', '会员管理', '桌码', '轮播条', '精彩呈现', '加入我们', '群聊二维码管理', '通用设置', '门店管理', '基础', '库存', '排行']
}

function normalizeStaffPermissions(permissions) {
  const allowed = staffPermissionOptions()
  return (Array.isArray(permissions) ? permissions : [])
    .map((item) => String(item || '').trim())
    .filter((item, index, list) => allowed.includes(item) && list.indexOf(item) === index)
}

function normalizeStaffAccounts(accounts) {
  return (Array.isArray(accounts) ? accounts : [])
    .map((item) => ({
      id: String(item.id || `staff-${Date.now()}-${Math.floor(Math.random() * 1000)}`),
      username: String(item.username || '').trim(),
      password: String(item.password || '').trim(),
      name: String(item.name || '').trim(),
      role: 'staff',
      storeId: String(item.storeId || '').trim(),
      permissions: normalizeStaffPermissions(item.permissions || []),
      createdAt: item.createdAt || now(),
      updatedAt: item.updatedAt || ''
    }))
    .filter((item) => item.username && item.password && item.storeId)
}

function requireSuperMerchant(merchant) {
  if (!isSuperMerchant(merchant)) throw httpError(403, '仅总管理员可操作')
}

function ensureMerchantPermission(merchant, pathname) {
  if (!merchant || merchant.role !== 'staff') return
  const permissions = normalizeStaffPermissions(merchant.permissions || [])
  if (pathname.includes('/global-settings')) {
    const globalTabs = ['轮播条', '精彩呈现', '加入我们', '群聊二维码管理', '通用设置']
    if (globalTabs.some((tab) => permissions.includes(tab))) return
    throw httpError(403, '当前店员无此权限')
  }
  const tab = merchantPermissionByPath(pathname)
  if (!tab) return
  if (!permissions.includes(tab)) throw httpError(403, '当前店员无此权限')
}

function merchantPermissionByPath(pathname) {
  if (pathname.includes('/orders')) return '订单'
  if (pathname.includes('/products') || pathname.includes('/categories') || pathname.includes('/inventory')) return '菜单管理'
  if (pathname.includes('/activities')) return '活动管理'
  if (pathname.includes('/recharge-settings') || pathname.includes('/recharge-records') || pathname.includes('/members/') && pathname.includes('/balance')) return '充值'
  if (pathname.includes('/voucher-settings') || pathname.includes('/voucher-logs') || pathname.includes('/vouchers')) return '酒水券管理'
  if (pathname.includes('/data/')) return '数据管理'
  if (pathname.includes('/members') || pathname.includes('/point-logs') || pathname.includes('/points') || pathname.includes('/pieces')) return '会员管理'
  if (pathname.includes('/table-qrcodes')) return '桌码'
  if (pathname.includes('/stores')) return '门店管理'
  if (pathname.includes('/signups') || pathname.includes('/cellar')) return '基础'
  if (pathname.includes('/leaderboard')) return '排行'
  return ''
}

async function handleGetStaffAccounts(req, res, merchant) {
  requireSuperMerchant(merchant)
  db.staffAccounts = normalizeStaffAccounts(db.staffAccounts)
  sendOk(res, db.staffAccounts.map((item) => Object.assign({}, item, {
    password: '',
    storeName: storeNameById(item.storeId),
    permissionsText: item.permissions.join('、')
  })))
}

async function handleSaveStaffAccount(req, res, merchant) {
  requireSuperMerchant(merchant)
  const body = await readJson(req)
  const id = String(body.id || '').trim() || `staff-${Date.now()}`
  const username = String(body.username || '').trim()
  const password = String(body.password || '').trim()
  const storeId = String(body.storeId || '').trim()
  const name = String(body.name || '').trim() || username
  if (!username) throw httpError(400, '请填写店员账号')
  const list = normalizeStaffAccounts(db.staffAccounts)
  const existing = list.find((item) => item.id === id)
  const finalPassword = password || (existing && existing.password) || ''
  if (!finalPassword) throw httpError(400, '请填写店员密码')
  if (!db.stores.some((item) => item.id === storeId)) throw httpError(400, '请选择门店')
  const fixedUsernames = merchantAccounts().filter((item) => item.role !== 'staff').map((item) => item.username)
  if (fixedUsernames.includes(username) || list.some((item) => item.id !== id && item.username === username)) {
    throw httpError(409, '店员账号已存在')
  }
  const next = {
    id,
    username,
    password: finalPassword,
    name,
    role: 'staff',
    storeId,
    permissions: normalizeStaffPermissions(body.permissions || []),
    createdAt: existing ? existing.createdAt : now(),
    updatedAt: now()
  }
  db.staffAccounts = list.some((item) => item.id === id)
    ? list.map((item) => (item.id === id ? next : item))
    : [next].concat(list)
  await persist()
  sendOk(res, Object.assign({}, next, { password: '', storeName: storeNameById(next.storeId), permissionsText: next.permissions.join('、') }))
}

async function handleDeleteStaffAccount(req, res, pathname, merchant) {
  requireSuperMerchant(merchant)
  const { id } = params(pathname, '/api/merchant/staff-accounts/:id')
  db.staffAccounts = normalizeStaffAccounts(db.staffAccounts).filter((item) => item.id !== id)
  await persist()
  sendOk(res, { id })
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

function scopedCategories(merchant) {
  if (isSuperMerchant(merchant)) return db.categories
  return db.categories.filter((item) => !item.storeId || item.storeId === merchant.storeId)
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
  ;[db.orders, db.signups, db.cellar, db.rechargeRecords, db.pointLogs, db.voucherLogs].forEach((list) => {
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
  scopedList(db.voucherLogs, merchant).forEach((item) => { if (item.memberId) memberIds.add(item.memberId) })
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
  const payload = decodeToken(token)
  if (isTokenRevoked(token)) throw httpError(401, 'Token 已失效')
  return payload
}

function decodeToken(token) {
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

function isTokenRevoked(token) {
  return Array.isArray(db && db.authRevocations) && db.authRevocations.some((item) => item && item.token === token)
}

function revokeToken(token, type) {
  const value = String(token || '').trim()
  if (!value) return false
  db.authRevocations = Array.isArray(db.authRevocations) ? db.authRevocations : []
  if (db.authRevocations.some((item) => item && item.token === value)) return true
  db.authRevocations.unshift({
    token: value,
    type: String(type || '').trim(),
    revokedAt: now()
  })
  return true
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

async function getWechatPhoneNumber(phoneCode) {
  const code = String(phoneCode || '').trim()
  if (!code) return ''
  const token = await getWechatAccessToken()
  const result = await postWechatJson(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`,
    { code }
  )
  const phone = result && result.phone_info ? result.phone_info.phoneNumber || result.phone_info.phone_number || '' : ''
  return String(phone || '').trim()
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

function postWechatJson(url, body) {
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
        let raw = ''
        res.on('data', (chunk) => { raw += chunk })
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw || '{}')
            if (res.statusCode < 200 || res.statusCode >= 300) {
              reject(httpError(502, parsed.errmsg || parsed.message || `微信接口请求失败：${res.statusCode}`))
              return
            }
            resolve(parsed)
          } catch (error) {
            reject(error)
          }
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
  if (order) {
    const member = db.members.find((item) => item.id === order.memberId)
    if (order.payStatus !== 'paid') {
      order.payStatus = 'paid'
      order.status = '已支付'
      order.transactionId = transactionId
      order.paidAt = transaction.success_time || now()
      if (member) {
        member.totalSpent = Number(member.totalSpent || 0) + Number(order.total || 0)
        member.consumptionCount = Number(member.consumptionCount || 0) + 1
        member.drinkVoucherCount = Math.max(0, Number(member.drinkVoucherCount || 0) - Number(order.voucherCountUsed || 0))
        member.level = levelBySpend(member.totalSpent, member.points)
      }
      changed = true
    }
    if (syncOrderActivitySignups(order, member)) changed = true
    if (await autoPrintPaidOrder(order)) changed = true
  }
  const record = db.rechargeRecords.find((item) => item.outTradeNo === outTradeNo || item.id === outTradeNo)
  if (record && record.payStatus !== 'paid') {
    const member = db.members.find((item) => item.id === record.memberId)
    const before = member ? Number(member.balance || 0) : Number(record.balanceBefore || 0)
    const after = before + Number(record.creditAmount || 0)
    const voucherCount = Math.max(0, Number(record.voucherCount || 0))
    if (member) {
      member.balance = after
      member.drinkVoucherCount = Math.max(0, Number(member.drinkVoucherCount || 0) + voucherCount)
      if (voucherCount) addVoucherLog(member, voucherCount, '储值充值自动发放酒水券', '系统')
    }
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

async function sendOrderToPrinter(order, options = {}) {
  const store = db.stores.find((item) => item.id === order.storeId) || {}
  const sn = String(store.printerSn || store.xpyunPrinterSn || '').trim()
  if (!sn) throw httpError(400, '请先在门店管理中配置芯烨云打印机编号')
  const copies = Math.max(1, Math.min(5, Number(options.copies || store.printerCopies || 1)))
  const content = buildReceiptContent(order, store)
  const result = await printXpyunReceipt({ sn, content, copies, voice: options.voice || 0 })
  const record = appendOrderPrintLog(order, {
    printerSn: sn,
    copies,
    status: result.ok ? 'sent' : 'failed',
    message: result.message,
    xpyunOrderId: result.orderId || '',
    operator: options.operator || '系统自动'
  })
  return { record, result }
}

function appendOrderPrintLog(order, data = {}) {
  const record = {
    id: `PR${Date.now()}`,
    orderId: order.id,
    storeId: order.storeId,
    printerSn: data.printerSn || '',
    copies: Number(data.copies || 1),
    status: data.status || 'failed',
    message: data.message || '',
    xpyunOrderId: data.xpyunOrderId || '',
    operator: data.operator || '系统自动',
    createdAt: now()
  }
  order.printLogs = Array.isArray(order.printLogs) ? order.printLogs : []
  order.printLogs.unshift(record)
  order.printStatus = record.status
  order.lastPrintedAt = record.createdAt
  order.lastPrintMessage = record.message
  return record
}

async function autoPrintPaidOrder(order) {
  if (!order || !order.id || order.payStatus !== 'paid') return false
  if (order.autoPrintAttempted || order.printStatus === 'sent') return false
  order.autoPrintAttempted = true
  try {
    await sendOrderToPrinter(order, { operator: '支付成功自动打印', voice: 2 })
  } catch (error) {
    appendOrderPrintLog(order, {
      status: 'failed',
      message: error && error.message ? error.message : '自动打印失败',
      operator: '支付成功自动打印'
    })
  }
  return true
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

function buildReceiptContent(order, store) {
  const template = normalizePrintTemplate(db && db.globalSettings ? db.globalSettings.printTemplate : '')
  return renderReceiptTemplate(template, buildReceiptContext(order, store))
}

function buildReceiptContext(order, store) {
  const items = Array.isArray(order.items) ? order.items : []
  const mode = order.mode || '堂食'
  const tableName = order.tableName || (order.tableNo ? `${order.tableNo}号桌` : '未指定')
  const storeName = order.storeName || store.shortName || store.name || ''
  const itemLines = []
  items.forEach((item) => {
    const count = Number(item.count || 0)
    const price = Number(item.price || 0)
    const subtotal = price * count
    itemLines.push(`${escapeReceipt(item.name || '')}`)
    itemLines.push(`  ${money(price)} x ${count}    ${money(subtotal)}`)
  })
  const itemCount = items.reduce((sum, item) => sum + Number(item.count || 0), 0)
  return {
    barName: '破壳派酒吧',
    storeName,
    orderId: order.id || '',
    orderNo: order.id || '',
    createdAt: order.createdAt || now(),
    time: order.createdAt || now(),
    printTime: now(),
    mode,
    type: mode,
    tableName,
    tableNo: order.tableNo || '',
    memberName: order.nickname || order.memberName || '',
    memberId: order.memberId || '',
    remark: order.remark || order.note || '',
    note: order.note || order.remark || '',
    status: order.status || '',
    total: money(order.total),
    totalAmount: Number(order.total || 0).toFixed(2),
    itemCount,
    items: itemLines.join('\n'),
    itemRows: itemLines.join('\n')
  }
}

function renderReceiptTemplate(template, context) {
  const text = normalizePrintTemplate(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(context, key)) return ''
    return context[key]
  })
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '<BR>')
    .replace(/(<BR>){3,}/g, '<BR><BR>')
}

function escapeReceipt(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '《')
    .replace(/>/g, '》')
}

function money(value) {
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
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
    const normalized = normalizeDbShape(raw)
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(normalized, null, 2))
    }
    return normalized
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
    voucherSettings: defaultVoucherSettings(),
    voucherLogs: [],
    rechargeRecords: [],
    pointLogs: [],
    globalSettings: defaultGlobalSettings(),
    leaderboard: normalizeLeaderboardBoards(sourceData.leaderboard),
    leaderboardMeta: {},
    staffAccounts: [],
    authRevocations: []
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
      voucherSettings: defaultVoucherSettings(),
      voucherLogs: [],
      rechargeRecords: [],
      pointLogs: [],
      globalSettings: defaultGlobalSettings(),
      leaderboard: normalizeLeaderboardBoards(sourceData.leaderboard),
      leaderboardMeta: {},
      staffAccounts: [],
      authRevocations: []
    },
    raw || {}
  )
  next.stores = syncSeedList(next.stores, sourceData.stores, true, false)
  next.stores = normalizeStores(Array.isArray(next.stores) && next.stores.length ? next.stores : sourceData.stores)
  next.activities = normalizeActivities(Array.isArray(next.activities) ? next.activities : [])
  next.categories = syncSeedList(next.categories, sourceData.categories, true, false)
  next.products = syncSeedList(next.products, sourceData.products, true, false)
  next.activities = syncSeedList(next.activities, normalizeActivities(sourceData.activities), true, false)
  next.inventory = syncInventoryList(next.inventory, next.products)
  const rechargeSettings = Object.assign({}, defaultRechargeSettings(), next.rechargeSettings || {})
  rechargeSettings.packages = normalizeRechargePackages(rechargeSettings.packages)
  next.rechargeSettings = rechargeSettings
  const voucherSettings = Object.assign({}, defaultVoucherSettings(), next.voucherSettings || {})
  voucherSettings.buyCount = Math.max(1, Number(voucherSettings.buyCount || 0))
  voucherSettings.freeCount = Math.max(0, Number(voucherSettings.freeCount || 0))
  voucherSettings.title = String(voucherSettings.title || '').trim() || defaultVoucherSettings().title
  voucherSettings.ruleName = String(voucherSettings.ruleName || '').trim() || `${voucherSettings.buyCount}减${voucherSettings.freeCount}`
  voucherSettings.note = normalizeVoucherNote(voucherSettings.note)
  voucherSettings.expireText = String(voucherSettings.expireText || '').trim() || defaultVoucherSettings().expireText
  next.voucherSettings = voucherSettings
  next.voucherLogs = Array.isArray(next.voucherLogs) ? next.voucherLogs : []
  next.globalSettings = normalizeGlobalSettings(next.globalSettings)
  next.leaderboard = normalizeLeaderboardBoards(next.leaderboard)
  next.leaderboardMeta = next.leaderboardMeta && typeof next.leaderboardMeta === 'object' ? next.leaderboardMeta : {}
  next.staffAccounts = normalizeStaffAccounts(next.staffAccounts)
  next.authRevocations = normalizeAuthRevocations(next.authRevocations)
  ;(Array.isArray(next.members) ? next.members : []).forEach((member) => {
    if (!member) return
    member.balance = Number(member.balance || 0)
    member.points = Number(member.points || 0)
    member.totalSpent = Number(member.totalSpent || 0)
    member.consumptionCount = Number(member.consumptionCount || 0)
    member.gems = Number(member.gems || 0)
    member.invitePieces = Number(member.invitePieces || 0)
    member.drinkVoucherCount = Number(member.drinkVoucherCount || 0)
    applyPhoneMemberId(next, member, member.phone)
  })
  return next
}

function syncSeedList(current, source, keepExtras = true, sourceWins = true) {
  const currentList = Array.isArray(current) ? current : []
  const sourceList = Array.isArray(source) ? source : []
  const currentById = new Map(currentList.filter((item) => item && item.id).map((item) => [item.id, item]))
  const sourceById = new Map(sourceList.filter((item) => item && item.id).map((item) => [item.id, item]))
  const next = []
  sourceList.forEach((item) => {
    const existing = currentById.get(item.id)
    next.push(existing ? (sourceWins ? Object.assign({}, existing, item) : Object.assign({}, item, existing)) : item)
    currentById.delete(item.id)
  })
  if (keepExtras) currentById.forEach((item) => next.push(item))
  return next
}

function syncInventoryList(current, products) {
  const inventory = Array.isArray(current) ? current : []
  if (!inventory.length) return defaultInventory(products)
  const stockMap = new Map()
  inventory.forEach((item) => {
    if (!item || !item.id) return
    const id = item.id === 'ktv-room' ? 'craft-beer-lager' : item.id
    if (!stockMap.has(id)) stockMap.set(id, Number(item.stock || 0))
  })
  ;(Array.isArray(products) ? products : []).forEach((product, index) => {
    if (!product || !product.id) return
    if (!stockMap.has(product.id)) stockMap.set(product.id, 30 + index * 5)
  })
  return Array.from(stockMap.entries()).map(([id, stock]) => ({ id, stock }))
}

function normalizeAuthRevocations(list) {
  const seen = new Set()
  return (Array.isArray(list) ? list : [])
    .filter((item) => item && item.token)
    .map((item) => ({
      token: String(item.token || '').trim(),
      type: String(item.type || '').trim(),
      revokedAt: String(item.revokedAt || now()).trim()
    }))
    .filter((item) => {
      if (!item.token || seen.has(item.token)) return false
      seen.add(item.token)
      return true
    })
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
  return stores.map((store) => Object.assign({ cover: '/bac-clean.jpg', printerSn: '', printerName: '', printerCopies: 1 }, defaults[store.id] || {}, store))
}

function normalizeActivities(activities) {
  return activities.map((item) =>
    Object.assign(
      {
        latitude: 31.9567,
        longitude: 118.8465,
        pointsPrice: 0,
        deadlineAt: '',
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
  if (!text || text.includes('酒水券自动进入背包') || text.includes('商家工作人员确认')) return defaultNote
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

function addVoucherLog(member, count, note = '', operator = '系统', storeId = '') {
  const record = {
    id: `VC${Date.now()}${Math.floor(Math.random() * 1000)}`,
    type: 'voucher',
    memberId: member.id,
    nickname: member.nickname,
    count,
    note: String(note || '').trim() || '酒水券调整',
    storeId,
    storeName: storeNameById(storeId),
    operator,
    createdAt: now()
  }
  db.voucherLogs = Array.isArray(db.voucherLogs) ? db.voucherLogs : []
  db.voucherLogs.unshift(record)
  return record
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
    groupQrTip: '\u70b9\u51fb\u6253\u5f00\u4e8c\u7ef4\u7801\u540e\u957f\u6309\u8bc6\u522b\u52a0\u5165\u5e97\u94fa\u7fa4'
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

function toSortOrder(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeLeaderboardList(list) {
  const source = Array.isArray(list) ? list : []
  const hasSortOrder = source.some((item) => item && item.sortOrder !== undefined && item.sortOrder !== null && String(item.sortOrder).trim() !== '')
  const next = source.map((item, index) => ({
    id: item.id || `rank-${Date.now()}-${index}`,
    username: String(item.username || ''),
    score: Math.max(0, Number(item.score || 0)),
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

function dateKey(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function leaderboardPeriodKey(type, date = new Date()) {
  const current = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  if (type === 'weekly') {
    const day = current.getUTCDay()
    const sundayOffset = -day
    const sunday = addDays(current, sundayOffset)
    sunday.setUTCHours(12, 0, 0, 0)
    const period = current >= sunday ? sunday : addDays(sunday, -7)
    return `${dateKey(period)}T12`
  }
  if (type === 'monthly') {
    const year = current.getUTCFullYear()
    const month = current.getUTCMonth()
    const cutoff = new Date(Date.UTC(year, month, 1, 12, 0, 0, 0))
    const period = current >= cutoff ? cutoff : new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0))
    return `${period.getUTCFullYear()}-${String(period.getUTCMonth() + 1).padStart(2, '0')}-01T12`
  }
  if (type === 'yearly') {
    const yearNow = current.getUTCFullYear()
    const cutoff = new Date(Date.UTC(yearNow, 11, 31, 0, 0, 0, 0))
    const year = current >= cutoff ? yearNow : yearNow - 1
    return `${year}-12-31T00`
  }
  return dateKey(current)
}

function memberLeaderboardName(member) {
  return String(member.nickname || member.phone || member.id || member.openid || '未命名会员').trim()
}

function memberLeaderboardId(member) {
  return `member-rank-${String(member.id || member.openid || member.phone || '').trim()}`
}

function syncLeaderboardMemberNames(list) {
  const next = normalizeLeaderboardList(list)
  const memberList = Array.isArray(db.members) ? db.members : []
  memberList
    .filter((member) => member && !member.isGuest && (member.id || member.openid || member.phone))
    .forEach((member) => {
      const memberId = String(member.id || member.openid || member.phone || '').trim()
      const username = memberLeaderboardName(member)
      if (!memberId) return
      const id = memberLeaderboardId(member)
      const index = next.findIndex((item) => {
        const keys = [item.memberId, item.id, item.username].map((value) => String(value || '').trim())
        return keys.includes(memberId) || keys.includes(id) || keys.includes(username)
      })
      if (index > -1) {
        next[index] = Object.assign({}, next[index], {
          id: next[index].id || id,
          memberId,
          username,
          source: next[index].source || 'member',
          storeId: ''
        })
      }
    })
  return normalizeLeaderboardList(next)
}

function syncLeaderboardState(force = false) {
  const previous = JSON.stringify({
    leaderboard: db.leaderboard,
    resetKeys: db.leaderboardMeta && db.leaderboardMeta.resetKeys
  })
  db.leaderboard = normalizeLeaderboardBoards(db.leaderboard)
  db.leaderboardMeta = db.leaderboardMeta && typeof db.leaderboardMeta === 'object' ? db.leaderboardMeta : {}
  db.leaderboardMeta.resetKeys = db.leaderboardMeta.resetKeys && typeof db.leaderboardMeta.resetKeys === 'object' ? db.leaderboardMeta.resetKeys : {}
  LEADERBOARD_TYPES.forEach((type) => {
    const key = leaderboardPeriodKey(type)
    const lastKey = db.leaderboardMeta.resetKeys[type]
    if (!lastKey) {
      db.leaderboardMeta.resetKeys[type] = key
    } else if (lastKey !== key && (type === 'weekly' || type === 'monthly')) {
      db.leaderboard[type] = []
      db.leaderboardMeta.resetKeys[type] = key
    } else if (lastKey !== key) {
      db.leaderboardMeta.resetKeys[type] = key
    }
    db.leaderboard[type] = syncLeaderboardMemberNames(db.leaderboard[type])
  })
  const changed = force || previous !== JSON.stringify({
    leaderboard: db.leaderboard,
    resetKeys: db.leaderboardMeta.resetKeys
  })
  if (changed) db.leaderboardMeta.updatedAt = now()
  return changed
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

function samePhone(left, right) {
  const a = String(left || '').replace(/\D/g, '')
  const b = String(right || '').replace(/\D/g, '')
  return Boolean(a && b && a === b)
}

function memberIdFromPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length < 4) return ''
  return digits.slice(-4)
}

function applyPhoneMemberId(targetDb, member, phone) {
  if (!targetDb || !member) return member
  const nextId = memberIdFromPhone(phone)
  if (!nextId) return member
  const members = Array.isArray(targetDb.members) ? targetDb.members : []
  const currentId = String(member.id || '').trim()
  const existing = members.find((item) => item && item !== member && item.id === nextId)
  if (existing) {
    if (samePhone(existing.phone, phone) || existing.openid === member.openid) {
      mergeMember(targetDb, member, existing)
      return existing
    }
    return member
  }
  if (currentId && currentId !== nextId) migrateMemberReferences(targetDb, currentId, nextId)
  member.id = nextId
  member.phone = String(phone || member.phone || '').trim()
  return member
}

function mergeMember(targetDb, from, to) {
  if (!targetDb || !from || !to || from === to) return to
  const oldId = String(from.id || '').trim()
  const newId = String(to.id || '').trim()
  if (oldId && newId && oldId !== newId) migrateMemberReferences(targetDb, oldId, newId)
  ;['openid', 'unionid', 'nickname', 'avatarUrl', 'phone', 'level'].forEach((key) => {
    if (from[key]) to[key] = from[key]
  })
  if (!to.createdAt && from.createdAt) to.createdAt = from.createdAt
  ;['balance', 'points', 'totalSpent', 'consumptionCount', 'gems', 'invitePieces', 'drinkVoucherCount'].forEach((key) => {
    to[key] = Number(to[key] || 0) + Number(from[key] || 0)
  })
  targetDb.members = (Array.isArray(targetDb.members) ? targetDb.members : []).filter((item) => item !== from)
  return to
}

function migrateMemberReferences(targetDb, oldId, newId) {
  ;['orders', 'signups', 'cellar', 'rechargeRecords', 'pointLogs'].forEach((key) => {
    ;(Array.isArray(targetDb[key]) ? targetDb[key] : []).forEach((item) => {
      if (item && item.memberId === oldId) item.memberId = newId
    })
  })
}

function findMember(id) {
  const keyword = String(id || '').trim()
  const normalized = keyword.toLowerCase()
  if (!normalized) throw httpError(404, '会员不存在')
  const fields = ['id', 'openid', 'nickname', 'phone']
  const digits = normalized.replace(/\D/g, '')
  const exact = db.members.find((item) => fields.some((field) => String(item[field] || '').trim().toLowerCase() === normalized))
  if (exact) return exact
  const digitMatch = digits
    ? db.members.filter((item) => {
        const idDigits = String(item.id || '').replace(/\D/g, '')
        const phoneDigits = String(item.phone || '').replace(/\D/g, '')
        return idDigits === digits || phoneDigits.slice(-digits.length) === digits || String(item.id || '').trim().replace(/^会员/, '') === digits
      })
    : []
  if (digitMatch.length === 1) return digitMatch[0]
  if (digitMatch.length > 1) throw httpError(400, '匹配到多个会员，请输入完整会员ID')
  const fuzzy = db.members.filter((item) => fields.some((field) => {
    const value = String(item[field] || '').trim().toLowerCase()
    return value && value.indexOf(normalized) > -1
  }))
  if (fuzzy.length === 1) return fuzzy[0]
  if (fuzzy.length > 1) throw httpError(400, '匹配到多个会员，请输入会员ID')
  throw httpError(404, '会员不存在')
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

function parseDeadlineAt(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const normalized = text
    .replace(/年|\/|\.|月/g, '-')
    .replace(/日|号/g, '')
    .replace(/\s+/g, ' ')
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function inferActivityDayLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const nowDate = new Date()
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  let target = null
  const monthDay = text.match(/(\d{1,2})月(\d{1,2})日/)
  if (monthDay) {
    target = new Date(nowDate.getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2]))
  } else {
    const isoDate = text.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/)
    if (isoDate) {
      target = new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))
    }
  }
  if (!target || Number.isNaN(target.getTime())) return ''
  const diffDays = Math.round((startOfDay(target) - startOfDay(nowDate)) / 86400000)
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '明天'
  if (diffDays === 2) return '后天'
  if (diffDays === 3) return '2天后'
  return ''
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
