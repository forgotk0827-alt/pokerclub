function orderDateKey(order) {
  return String((order && (order.createdAt || order.paidAt)) || '').slice(0, 10)
}

function matchesOrderDate(order, dateText) {
  const target = String(dateText || '').trim()
  if (!target) return true
  return orderDateKey(order) === target
}

function buildOrderDateSummary(list, dateText) {
  const orders = (list || []).filter((item) => matchesOrderDate(item, dateText))
  const income = orders.reduce((sum, item) => sum + Number((item && item.total) || 0), 0)
  return {
    orders,
    count: orders.length,
    income: income.toFixed(2)
  }
}

module.exports = {
  orderDateKey,
  matchesOrderDate,
  buildOrderDateSummary
}
