// Stream D — icon generator (no dependencies, Node built-ins only).
//
// Renders the original Long Chronicle mark — parchment field, gold frame,
// oxblood arch, gold hourglass — into PNGs with a tiny procedural
// rasterizer and a hand-rolled PNG encoder (zlib is a Node built-in).
// Run: `node scripts/make-icons.mjs` (regenerates all three PNGs).
// Writes go out in 2048-byte chunks: this sandbox rejects single write()
// calls larger than ~4096 bytes, and chunked writes stay under the limit.
import { openSync, writeSync, closeSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'icons')

const PARCHMENT = [244, 238, 221]
const OXBLOOD = [110, 31, 31]
const GOLD = [168, 132, 44]
const GOLD_LIGHT = [201, 164, 74]

function writeChunked(path, data) {
  const fd = openSync(path, 'w')
  try {
    let offset = 0
    while (offset < data.length) {
      const end = Math.min(offset + 2048, data.length)
      offset += writeSync(fd, data, offset, end - offset)
    }
  } finally {
    closeSync(fd)
  }
}

// --- CRC-32 (IEEE) ---------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data) {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function encodePng(width, height, rgba) {
  const raw = new Uint8Array(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0 // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1)
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type RGBA
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]
  const total = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

// --- Mark rasterizer (512-space geometry, scaled to the target size) -------
function inArch(x, y) {
  if (y < 128 || y > 432 || Math.abs(x - 256) > 128) return false
  if (y >= 256) return true
  const half = Math.sqrt(Math.max(0, 128 * 128 - (256 - y) * (256 - y)))
  return Math.abs(x - 256) <= half
}

function inHourglass(x, y) {
  const dx = Math.abs(x - 256)
  if ((y >= 202 && y <= 214) || (y >= 356 && y <= 368)) return dx <= 80
  if (y >= 214 && y <= 285) return dx <= 285 - y
  if (y >= 285 && y <= 356) return dx <= y - 285
  return false
}

function renderIcon(size, { scale = 1, frame = true } = {}) {
  const rgba = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Map the pixel back into 512-space, undoing the icon scale.
      const px = 256 + (((x + 0.5) / size) * 512 - 256) / scale
      const py = 280 + (((y + 0.5) / size) * 512 - 280) / scale
      let color = PARCHMENT
      if (inArch(px, py)) color = OXBLOOD
      if (inHourglass(px, py)) color = GOLD_LIGHT
      if (frame) {
        const edge = Math.min(x, size - 1 - x, y, size - 1 - y)
        const band = (edge / size) * 512
        if (band >= 10 && band <= 16) color = GOLD
      }
      const i = (y * size + x) * 4
      rgba[i] = color[0]
      rgba[i + 1] = color[1]
      rgba[i + 2] = color[2]
      rgba[i + 3] = 255
    }
  }
  return rgba
}

mkdirSync(OUT, { recursive: true })
const jobs = [
  { file: 'icon-192.png', size: 192, scale: 1, frame: true },
  { file: 'icon-512.png', size: 512, scale: 1, frame: true },
  // Maskable: no edge frame (masks crop the edges), mark scaled up so the
  // arch stays inside the 80%-diameter safe zone.
  { file: 'icon-512-maskable.png', size: 512, scale: 1.12, frame: false },
]
for (const { file, size, scale, frame } of jobs) {
  const png = encodePng(size, size, renderIcon(size, { scale, frame }))
  const path = join(OUT, file)
  writeChunked(path, png)
  console.log(`wrote ${path} (${png.length} bytes)`)
}
