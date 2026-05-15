const VERSION = 3
const SIZE = 21 + (VERSION - 1) * 4
const DATA_CODEWORDS = 55
const ECC_CODEWORDS = 15

const EXP = []
const LOG = []

let value = 1
for (let i = 0; i < 255; i += 1) {
  EXP[i] = value
  LOG[value] = i
  value <<= 1
  if (value & 0x100) {
    value ^= 0x11d
  }
}
for (let i = 255; i < 512; i += 1) {
  EXP[i] = EXP[i - 255]
}

function gfMul(a, b) {
  if (!a || !b) return 0
  return EXP[LOG[a] + LOG[b]]
}

function polyMul(a, b) {
  const out = new Array(a.length + b.length - 1).fill(0)
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      out[i + j] ^= gfMul(a[i], b[j])
    }
  }
  return out
}

function generatorPoly(degree) {
  let poly = [1]
  for (let i = 0; i < degree; i += 1) {
    poly = polyMul(poly, [1, EXP[i]])
  }
  return poly
}

function reedSolomon(data, degree) {
  const gen = generatorPoly(degree)
  const ecc = new Array(degree).fill(0)
  data.forEach((codeword) => {
    const factor = codeword ^ ecc[0]
    ecc.shift()
    ecc.push(0)
    for (let i = 0; i < degree; i += 1) {
      ecc[i] ^= gfMul(gen[i + 1], factor)
    }
  })
  return ecc
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >> i) & 1)
  }
}

function dataCodewords(text) {
  const bytes = Array.from(unescape(encodeURIComponent(text))).map((char) => char.charCodeAt(0))
  const bits = []
  appendBits(bits, 0x4, 4)
  appendBits(bits, bytes.length, 8)
  bytes.forEach((byte) => appendBits(bits, byte, 8))
  appendBits(bits, 0, Math.min(4, DATA_CODEWORDS * 8 - bits.length))
  while (bits.length % 8) bits.push(0)

  const out = []
  for (let i = 0; i < bits.length; i += 8) {
    out.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  }
  let pad = 0
  while (out.length < DATA_CODEWORDS) {
    out.push(pad % 2 ? 0x11 : 0xec)
    pad += 1
  }
  return out.slice(0, DATA_CODEWORDS)
}

function emptyMatrix() {
  return {
    modules: Array.from({ length: SIZE }, () => new Array(SIZE).fill(false)),
    reserved: Array.from({ length: SIZE }, () => new Array(SIZE).fill(false))
  }
}

function setModule(state, row, col, dark, reserve = true) {
  if (row < 0 || col < 0 || row >= SIZE || col >= SIZE) return
  state.modules[row][col] = !!dark
  if (reserve) state.reserved[row][col] = true
}

function addFinder(state, row, col) {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r
      const cc = col + c
      const inFinder = r >= 0 && r <= 6 && c >= 0 && c <= 6
      const dark = inFinder && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
      setModule(state, rr, cc, dark)
    }
  }
}

function addAlignment(state, row, col) {
  for (let r = -2; r <= 2; r += 1) {
    for (let c = -2; c <= 2; c += 1) {
      const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1
      setModule(state, row + r, col + c, dark)
    }
  }
}

function reserveFormat(state) {
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      state.reserved[8][i] = true
      state.reserved[i][8] = true
    }
  }
  for (let i = SIZE - 8; i < SIZE; i += 1) {
    state.reserved[8][i] = true
    state.reserved[i][8] = true
  }
}

function addFunctionPatterns(state) {
  addFinder(state, 0, 0)
  addFinder(state, 0, SIZE - 7)
  addFinder(state, SIZE - 7, 0)
  addAlignment(state, 22, 22)
  for (let i = 8; i < SIZE - 8; i += 1) {
    setModule(state, 6, i, i % 2 === 0)
    setModule(state, i, 6, i % 2 === 0)
  }
  setModule(state, 4 * VERSION + 9, 8, true)
  reserveFormat(state)
}

function maskBit(mask, row, col) {
  if (mask === 0) return (row + col) % 2 === 0
  if (mask === 1) return row % 2 === 0
  if (mask === 2) return col % 3 === 0
  return (row + col) % 3 === 0
}

function addData(state, codewords, mask) {
  const bits = []
  codewords.forEach((codeword) => appendBits(bits, codeword, 8))
  let bitIndex = 0
  let upwards = true
  for (let col = SIZE - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1
    for (let i = 0; i < SIZE; i += 1) {
      const row = upwards ? SIZE - 1 - i : i
      for (let c = 0; c < 2; c += 1) {
        const cc = col - c
        if (state.reserved[row][cc]) continue
        const bit = bits[bitIndex] || 0
        state.modules[row][cc] = !!(bit ^ (maskBit(mask, row, cc) ? 1 : 0))
        bitIndex += 1
      }
    }
    upwards = !upwards
  }
}

function formatBits(mask) {
  const data = (1 << 3) | mask
  let value = data << 10
  const poly = 0x537
  for (let i = 14; i >= 10; i -= 1) {
    if ((value >> i) & 1) value ^= poly << (i - 10)
  }
  return ((data << 10) | value) ^ 0x5412
}

function addFormat(state, mask) {
  const bits = formatBits(mask)
  for (let i = 0; i <= 5; i += 1) setModule(state, 8, i, (bits >> i) & 1, false)
  setModule(state, 8, 7, (bits >> 6) & 1, false)
  setModule(state, 8, 8, (bits >> 7) & 1, false)
  setModule(state, 7, 8, (bits >> 8) & 1, false)
  for (let i = 9; i < 15; i += 1) setModule(state, 14 - i, 8, (bits >> i) & 1, false)
  for (let i = 0; i < 8; i += 1) setModule(state, SIZE - 1 - i, 8, (bits >> i) & 1, false)
  for (let i = 8; i < 15; i += 1) setModule(state, 8, SIZE - 15 + i, (bits >> i) & 1, false)
}

function generate(text) {
  const data = dataCodewords(String(text).slice(0, 50))
  const codewords = data.concat(reedSolomon(data, ECC_CODEWORDS))
  const state = emptyMatrix()
  const mask = 0
  addFunctionPatterns(state)
  addData(state, codewords, mask)
  addFormat(state, mask)
  return state.modules.map((row) => row.map((cell) => (cell ? 1 : 0)))
}

module.exports = {
  generate
}
