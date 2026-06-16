// 生成Chrome扩展图标
// 运行: node scripts/generate-icons.js

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = resolve(__dirname, '../public/icons')

if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true })
}

// 创建简单的SVG图标
const createSVG = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#8B5CF6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#EC4899;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#grad)"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="${size * 0.35}">TS</text>
</svg>`

const sizes = [16, 48, 128]

sizes.forEach(size => {
  const svg = createSVG(size)
  const filePath = resolve(iconsDir, `icon${size}.svg`)
  writeFileSync(filePath, svg)
  console.log(`Created: icon${size}.svg`)
})

console.log('\nIcons generated successfully!')
console.log('Note: SVG icons created. For PNG icons, you may need to convert them manually or use a tool like sharp.')