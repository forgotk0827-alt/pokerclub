const assert = require('assert')
const fs = require('fs')
const path = require('path')

const source = fs.readFileSync(path.join(__dirname, '..', 'utils/state.js'), 'utf8')

assert(source.includes('let runtimeOrdersCache = []'))
assert(source.includes('let runtimeMerchantOrdersCache = []'))
assert(source.includes('runtimeOrdersCache = normalized'))
assert(source.includes('runtimeMerchantOrdersCache = payload'))
assert(source.includes('if (isMerchantContext())'))
assert(source.includes('return Array.isArray(runtimeMerchantOrdersCache) ? runtimeMerchantOrdersCache : []'))
assert(source.includes('if (Array.isArray(runtimeOrdersCache) && runtimeOrdersCache.length) return runtimeOrdersCache'))
assert(source.includes('runtimeMerchantOrdersCache = []'))
