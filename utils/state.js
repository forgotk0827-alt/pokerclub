const data = require('./data')

const KEYS = {
  store: 'deyou_selected_store',
  cart: 'deyou_cart',
  orders: 'deyou_orders',
  signups: 'deyou_signups',
  member: 'deyou_member',
  cellar: 'deyou_cellar'
}

function ensureSeed() {
  if (!wx.getStorageSync(KEYS.store)) {
    wx.setStorageSync(KEYS.store, data.stores[0].id)
  }
  if (!wx.getStorageSync(KEYS.cart)) {
    wx.setStorageSync(KEYS.cart, [])
  }
  if (!wx.getStorageSync(KEYS.orders)) {
    wx.setStorageSync(KEYS.orders, [])
  }
  if (!wx.getStorageSync(KEYS.signups)) {
    wx.setStorageSync(KEYS.signups, [])
  }
  if (!wx.getStorageSync(KEYS.member)) {
    wx.setStorageSync(KEYS.member, data.member)
  }
  if (!wx.getStorageSync(KEYS.cellar)) {
    wx.setStorageSync(KEYS.cellar, [])
  }
}

function getStore() {
  const id = wx.getStorageSync(KEYS.store) || data.stores[0].id
  return data.stores.find((item) => item.id === id) || data.stores[0]
}

function setStore(id) {
  wx.setStorageSync(KEYS.store, id)
}

function getCart() {
  return wx.getStorageSync(KEYS.cart) || []
}

function saveCart(cart) {
  wx.setStorageSync(KEYS.cart, cart)
}

function addToCart(product, count = 1) {
  const cart = getCart()
  const index = cart.findIndex((item) => item.id === product.id)
  if (index > -1) {
    cart[index].count += count
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      desc: product.desc,
      price: product.price,
      points: product.points || 0,
      unit: product.unit || '份',
      image: product.image,
      categoryId: product.categoryId || 'activity',
      count
    })
  }
  saveCart(cart)
  return cart
}

function updateCartItem(id, delta) {
  const next = getCart()
    .map((item) => {
      if (item.id === id) {
        return Object.assign({}, item, { count: item.count + delta })
      }
      return item
    })
    .filter((item) => item.count > 0)
  saveCart(next)
  return next
}

function clearCart() {
  saveCart([])
}

function getCartSummary(cart = getCart()) {
  return cart.reduce(
    (summary, item) => {
      summary.count += item.count
      summary.total += item.price * item.count
      return summary
    },
    { count: 0, total: 0 }
  )
}

function getMember() {
  return wx.getStorageSync(KEYS.member) || data.member
}

function saveMember(member) {
  wx.setStorageSync(KEYS.member, member)
}

function getOrders() {
  return wx.getStorageSync(KEYS.orders) || []
}

function createOrder(options) {
  const cart = getCart()
  if (!cart.length) {
    return null
  }
  const store = getStore()
  const summary = getCartSummary(cart)
  const order = {
    id: `DY${Date.now()}`,
    storeId: store.id,
    storeName: store.shortName,
    mode: options.mode || '堂食',
    status: '待支付',
    createdAt: formatTime(new Date()),
    items: cart,
    total: summary.total
  }
  const orders = getOrders()
  orders.unshift(order)
  wx.setStorageSync(KEYS.orders, orders)
  clearCart()
  return order
}

function cancelOrder(id) {
  const orders = getOrders().map((item) => {
    if (item.id === id && item.status === '待支付') {
      return Object.assign({}, item, { status: '已取消' })
    }
    return item
  })
  wx.setStorageSync(KEYS.orders, orders)
  return orders
}

function getSignups() {
  return wx.getStorageSync(KEYS.signups) || []
}

function addSignup(activity) {
  const signups = getSignups()
  if (!signups.find((item) => item.id === activity.id)) {
    signups.unshift({
      id: activity.id,
      title: activity.title,
      date: activity.date,
      price: activity.price,
      status: '已报名',
      createdAt: formatTime(new Date())
    })
    wx.setStorageSync(KEYS.signups, signups)
  }
  return signups
}

function addCellar(record) {
  const list = wx.getStorageSync(KEYS.cellar) || []
  list.unshift(Object.assign({ id: `CJ${Date.now()}`, status: '待处理' }, record))
  wx.setStorageSync(KEYS.cellar, list)
  return list
}

function formatTime(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

module.exports = {
  ensureSeed,
  getStore,
  setStore,
  getCart,
  addToCart,
  updateCartItem,
  clearCart,
  getCartSummary,
  getMember,
  saveMember,
  getOrders,
  createOrder,
  cancelOrder,
  getSignups,
  addSignup,
  addCellar
}
