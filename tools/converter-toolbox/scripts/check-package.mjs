import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { unzipSync } from 'fflate'
import { root, packageInfo, archiveName } from './release-meta.mjs'

const bytes = await readFile(resolve(root, 'release', archiveName))
assert.ok(bytes.length <= 1024 * 1024, 'ZIP 超过 1 MiB。')
const entries = unzipSync(bytes)
const expected = []
async function verify(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name
    if (entry.isDirectory()) await verify(resolve(directory, entry.name), `${name}/`)
    else {
      expected.push(name)
      assert.deepEqual(
        Buffer.from(entries[name] ?? []),
        await readFile(resolve(directory, entry.name)),
        `安装包文件内容不一致：${name}`,
      )
    }
  }
}
await verify(resolve(root, 'dist'))
assert.deepEqual(
  Object.keys(entries).sort(),
  expected.sort(),
  'ZIP 必须仅包含 dist 完整内容，且根目录可直接加载扩展。',
)
const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json']))
assert.equal(manifest.version, packageInfo.version)
assert.ok(entries['index.html'] && entries['service-worker.js'])
console.log(`安装包内容验证通过：${archiveName}，${Object.keys(entries).length} 个文件。`)
