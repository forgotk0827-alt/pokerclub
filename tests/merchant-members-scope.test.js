const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const serverSource = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8')
const stateSource = fs.readFileSync(path.join(root, 'utils/state.js'), 'utf8')

assert(serverSource.includes('const ids = memberStoreIds(item.id)'))
assert(serverSource.includes('return !ids.size || ids.has(merchant.storeId)'))

assert(stateSource.includes('let runtimeMerchantMembersCache = []'))
assert(stateSource.includes('function saveMerchantMembers(members)'))
assert(stateSource.includes('runtimeMerchantMembersCache = list'))
assert(stateSource.includes('return runtimeMerchantMembersCache'))
