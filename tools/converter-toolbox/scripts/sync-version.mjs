import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { root, packageInfo } from './release-meta.mjs'
const path = resolve(root, 'public/manifest.json')
const manifest = JSON.parse(await readFile(path, 'utf8'))
manifest.version = packageInfo.version
await writeFile(path, JSON.stringify(manifest, null, 2) + '\n')
console.log(`Manifest 已同步为 ${packageInfo.version}`)
