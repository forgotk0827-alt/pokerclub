const assert = require('assert')
const { normalizeSignedAmountInput } = require('../utils/amount-input')

assert.strictEqual(normalizeSignedAmountInput('-100'), '-100')
assert.strictEqual(normalizeSignedAmountInput('--10..5abc'), '-10.5')
assert.strictEqual(normalizeSignedAmountInput('9-8.7.6'), '98.76')
assert.strictEqual(normalizeSignedAmountInput('-'), '-')
