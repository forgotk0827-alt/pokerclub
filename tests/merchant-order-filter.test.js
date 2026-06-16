const assert = require('assert')
const { buildOrderDateSummary } = require('../utils/merchant-order-filter')

const orders = [
  { id: 'a', total: 88, createdAt: '2026-06-01 10:20:00' },
  { id: 'b', total: '12.50', paidAt: '2026-06-01T13:00:00+08:00' },
  { id: 'c', total: 35, createdAt: '2026-06-02 09:00:00' }
]

assert.deepStrictEqual(buildOrderDateSummary(orders, '2026-06-01'), {
  orders: [orders[0], orders[1]],
  count: 2,
  income: '100.50'
})

assert.deepStrictEqual(buildOrderDateSummary(orders, ''), {
  orders,
  count: 3,
  income: '135.50'
})
