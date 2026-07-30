const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const serverSource = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8')
const stateSource = fs.readFileSync(path.join(root, 'utils/state.js'), 'utf8')
const menuSource = fs.readFileSync(path.join(root, 'pages/menu/menu.js'), 'utf8')

assert(serverSource.includes("sendOk(res, publicCategories(url.searchParams.get('storeId')))"))
assert(serverSource.includes('function publicCategories(storeId)'))
assert(serverSource.includes('return db.categories.filter((item) => !item.storeId || item.storeId === id)'))

assert(stateSource.includes("const url = storeId ? `/api/categories?storeId=${encodeURIComponent(storeId)}` : '/api/categories'"))

const menuCategoryCalls = menuSource.match(/getProductCategories\(visibleProducts, \{ includeEmpty: true, storeId/g) || []
assert.strictEqual(menuCategoryCalls.length, 2)
