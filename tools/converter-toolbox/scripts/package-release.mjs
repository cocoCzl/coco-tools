import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { zipSync } from 'fflate'
import { root, archiveName } from './release-meta.mjs'
import './check-release.mjs'

const entries = {}
async function collect(directory, prefix = '') {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const name = prefix + entry.name
    if (entry.isSymbolicLink()) throw new Error(`安装包禁止符号链接：${name}`)
    if (entry.isDirectory()) await collect(resolve(directory, entry.name), `${name}/`)
    else
      entries[name] = [
        new Uint8Array(await readFile(resolve(directory, entry.name))),
        { mtime: new Date(1980, 0, 1) },
      ]
  }
}
await collect(resolve(root, 'dist'))
const bytes = zipSync(entries, { level: 9 })
if (bytes.length > 1024 * 1024)
  throw new Error(`Release 压缩包为 ${bytes.length} B，超过 1 MiB 限制。`)
await mkdir(resolve(root, 'release'), { recursive: true })
await writeFile(resolve(root, 'release', archiveName), bytes)
console.log(`Release 安装包已生成：release/${archiveName}（${bytes.length} B）`)
