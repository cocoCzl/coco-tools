import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'public/icons')
const crcTable = Array.from({ length: 256 }, (_, index) => { let value = index; for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0 })
const crc = (bytes) => { let value = 0xffffffff; for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0 }
const chunk = (kind, body) => { const name = Buffer.from(kind); const size = Buffer.alloc(4); size.writeUInt32BE(body.length); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc(Buffer.concat([name, body]))); return Buffer.concat([size, name, body, checksum]) }
const pointInPolygon = (x, y, points) => points.every((point, index) => { const next = points[(index + 1) % points.length]; return (next[0] - point[0]) * (y - point[1]) - (next[1] - point[1]) * (x - point[0]) >= -0.4 })
function icon(size) {
  const pixels = Buffer.alloc((size * 4 + 1) * size)
  const scale = size / 128
  const top = [[64, 12], [112, 40], [64, 68], [16, 40]]
  const left = [[16, 40], [64, 68], [64, 118], [16, 90]]
  const right = [[64, 68], [112, 40], [112, 90], [64, 118]]
  for (let py = 0; py < size; py += 1) for (let px = 0; px < size; px += 1) {
    const x = px / scale; const y = py / scale; const offset = py * (size * 4 + 1) + 1 + px * 4
    let r = 8, g = 18, b = 52
    if (pointInPolygon(x, y, top)) { r = 117; g = 217; b = 255 }
    else if (pointInPolygon(x, y, left)) { r = 43; g = 93; b = 222 }
    else if (pointInPolygon(x, y, right)) { r = 113; g = 79; b = 224 }
    const forward = (y > 52 && y < 62 && x > 39 && x < 78) || (x >= 76 && x < 89 && Math.abs(y - 57) < (89 - x) * .75)
    const backward = (y > 70 && y < 80 && x > 50 && x < 89) || (x >= 39 && x < 52 && Math.abs(y - 75) < (x - 39) * .75)
    if (forward || backward) { r = 244; g = 252; b = 255 }
    pixels[offset] = r; pixels[offset + 1] = g; pixels[offset + 2] = b; pixels[offset + 3] = 255
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}
await mkdir(output, { recursive: true })
for (const size of [16, 48, 128]) await writeFile(resolve(output, `icon${size}.png`), icon(size))
