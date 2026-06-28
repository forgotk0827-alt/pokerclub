const assert = require('assert')
const fs = require('fs')

const wxml = fs.readFileSync('pages/merchant/merchant.wxml', 'utf8')
const deltaInput = wxml.match(/<input[^>]+value="\{\{rechargeForm\.delta\}\}"[^>]*\/>/)

assert(deltaInput, 'merchant recharge delta input should exist')
assert(
  /type="text"/.test(deltaInput[0]),
  'merchant recharge delta input should use type="text" so Android keyboards allow negative amounts'
)
