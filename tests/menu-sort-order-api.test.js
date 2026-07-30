const assert = require('assert')
const fs = require('fs')
const path = require('path')

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'backend/server.js'), 'utf8')

assert(serverSource.includes('function sortedBySortOrder(list)'))
assert(serverSource.includes('function sortedStoreList(list, storeId)'))
assert(serverSource.includes('if (storeItems.length) return sortedBySortOrder(storeItems)'))
assert(serverSource.includes('return sortedStoreList(db.categories, id)'))
assert(serverSource.includes('return sortedStoreList(db.products, id)'))
assert(serverSource.includes('return sortedBySortOrder(db.categories)'))
assert(serverSource.includes('return sortedBySortOrder(db.products)'))
