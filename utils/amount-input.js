function normalizeSignedAmountInput(value) {
  const source = String(value || '')
  let result = ''
  let hasDot = false
  source.split('').forEach((char) => {
    if (char === '-' && result.length === 0) {
      result = '-'
      return
    }
    if (char === '.' && !hasDot) {
      hasDot = true
      result += char
      return
    }
    if (/\d/.test(char)) result += char
  })
  return result
}

module.exports = {
  normalizeSignedAmountInput
}
