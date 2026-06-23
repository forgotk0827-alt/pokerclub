const assert = require('assert')
const fs = require('fs')

const wxml = fs.readFileSync('pages/merchant/merchant.wxml', 'utf8')
const priceInput = wxml.match(/<input[^>]+value="\{\{activityForm\.price\}\}"[^>]*\/>/)

assert(priceInput, 'merchant activity price input should exist')
assert(
  /type="digit"/.test(priceInput[0]),
  'merchant activity price input should use type="digit" so Android keyboards include a decimal point'
)
