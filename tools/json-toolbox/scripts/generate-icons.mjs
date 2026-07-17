import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

const target = resolve(import.meta.dirname, '../public/icons')
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value
})

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, checksum])
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const scale = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + scale * dx), py - (ay + scale * dy))
}

function drawBrace(x, y, mirrored) {
  const points = [
    [0.43, 0.19], [0.35, 0.19], [0.31, 0.25], [0.31, 0.41],
    [0.24, 0.5], [0.31, 0.59], [0.31, 0.75], [0.35, 0.81], [0.43, 0.81],
  ].map(([px, py]) => [mirrored ? 1 - px : px, py])
  return points.slice(1).some(([bx, by], index) => {
    const [ax, ay] = points[index]
    return distanceToSegment(x, y, ax, ay, bx, by) < 0.035
  })
}

function createPng(size) {
  const scale = 4
  const sampleSize = size * scale
  const pixels = []
  for (let y = 0; y < size; y += 1) {
    pixels.push(0)
    for (let x = 0; x < size; x += 1) {
      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const nx = (x * scale + sx + 0.5) / sampleSize
          const ny = (y * scale + sy + 0.5) / sampleSize
          const radius = 0.19
          const cx = Math.max(radius, Math.min(1 - radius, nx))
          const cy = Math.max(radius, Math.min(1 - radius, ny))
          const inside = Math.hypot(nx - cx, ny - cy) <= radius
          if (!inside) continue
          const brace = drawBrace(nx, ny, false) || drawBrace(nx, ny, true)
          if (brace) {
            red += 245; green += 242; blue += 229; alpha += 255
          } else {
            red += 36; green += 72; blue += 196; alpha += 255
          }
        }
      }
      const samples = scale * scale
      pixels.push(
        Math.round(red / samples),
        Math.round(green / samples),
        Math.round(blue / samples),
        Math.round(alpha / samples),
      )
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  const body = deflateSync(Buffer.from(pixels), { level: 9 })
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', body), chunk('IEND', Buffer.alloc(0))])
}

await mkdir(target, { recursive: true })
for (const size of [16, 48, 128]) {
  await writeFile(resolve(target, `icon${size}.png`), createPng(size))
}
console.log('Generated JSON Toolbox icons.')
