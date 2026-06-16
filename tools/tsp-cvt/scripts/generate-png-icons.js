// 简单的PNG图标生成器
// 使用纯JavaScript创建最小的PNG文件

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { deflateSync } from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = resolve(__dirname, '../public/icons')

if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true })
}

// PNG签名
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

// 创建CRC32表
const crcTable = []
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable[n] = c
}

// 计算CRC32
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

// 创建PNG块
function createChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  
  const typeBuffer = Buffer.from(type)
  const crcData = Buffer.concat([typeBuffer, data])
  const crcValue = crc32(crcData)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crcValue, 0)
  
  return Buffer.concat([length, typeBuffer, data, crc])
}

// 创建简单的渐变PNG图标
function createPNG(size) {
  // IHDR chunk
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)  // width
  ihdr.writeUInt32BE(size, 4)  // height
  ihdr.writeUInt8(8, 8)        // bit depth
  ihdr.writeUInt8(6, 9)        // color type (RGBA)
  ihdr.writeUInt8(0, 10)       // compression
  ihdr.writeUInt8(0, 11)       // filter
  ihdr.writeUInt8(0, 12)       // interlace
  
  // 创建图像数据 (未压缩，使用简单的过滤)
  const rawData = []
  
  for (let y = 0; y < size; y++) {
    rawData.push(0) // 过滤类型: None
    for (let x = 0; x < size; x++) {
      // 渐变色: 紫色到粉色
      const t = (x + y) / (size * 2)
      const r = Math.round(139 + (236 - 139) * t)  // 紫到粉
      const g = Math.round(92 + (72 - 92) * t)
      const b = Math.round(246 + (153 - 246) * t)
      
      // 圆角矩形
      const cornerRadius = size * 0.2
      const inCorner = (
        x < cornerRadius && y < cornerRadius && 
        Math.sqrt((cornerRadius - x) ** 2 + (cornerRadius - y) ** 2) > cornerRadius
      ) || (
        x >= size - cornerRadius && y < cornerRadius &&
        Math.sqrt((x - (size - cornerRadius)) ** 2 + (cornerRadius - y) ** 2) > cornerRadius
      ) || (
        x < cornerRadius && y >= size - cornerRadius &&
        Math.sqrt((cornerRadius - x) ** 2 + (y - (size - cornerRadius)) ** 2) > cornerRadius
      ) || (
        x >= size - cornerRadius && y >= size - cornerRadius &&
        Math.sqrt((x - (size - cornerRadius)) ** 2 + (y - (size - cornerRadius)) ** 2) > cornerRadius
      )
      
      if (inCorner) {
        rawData.push(0, 0, 0, 0)
      } else {
        rawData.push(r, g, b, 255)
      }
    }
  }
  
  // 简单压缩 (使用deflate存储模式)
  const rawBuffer = Buffer.from(rawData)
  const compressed = deflateSync(rawBuffer)
  
  // IDAT chunk
  const idat = createChunk('IDAT', compressed)
  
  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0))
  
  // 组合PNG
  return Buffer.concat([
    PNG_SIGNATURE,
    createChunk('IHDR', ihdr),
    idat,
    iend
  ])
}

const sizes = [16, 48, 128]

sizes.forEach(size => {
  try {
    const png = createPNG(size)
    const filePath = resolve(iconsDir, `icon${size}.png`)
    writeFileSync(filePath, png)
    console.log(`Created: icon${size}.png (${png.length} bytes)`)
  } catch (err) {
    console.error(`Error creating icon${size}.png:`, err.message)
  }
})

console.log('\nIcons generated successfully!')
