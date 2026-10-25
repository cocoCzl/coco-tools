import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { root, packageInfo } from './release-meta.mjs'

const manifest = JSON.parse(await readFile(resolve(root, 'dist/manifest.json'), 'utf8'))
const source = JSON.parse(await readFile(resolve(root, 'public/manifest.json'), 'utf8'))
assert.equal(manifest.version, packageInfo.version, '构建版本必须与扩展 package.json 一致。')
assert.equal(
  source.version,
  packageInfo.version,
  '源码 Manifest 版本不一致；请运行 npm run version。',
)
assert.equal(manifest.manifest_version, 3)
assert.deepEqual(manifest.permissions, ['storage'])
for (const field of [
  'host_permissions',
  'optional_host_permissions',
  'optional_permissions',
  'content_scripts',
  'externally_connectable',
])
  assert.equal(manifest[field], undefined, `禁止非必要 Manifest 字段 ${field}`)
for (const file of [
  'index.html',
  manifest.background.service_worker,
  ...Object.values(manifest.icons),
])
  await stat(resolve(root, 'dist', file))
async function size(directory) {
  let total = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = resolve(directory, entry.name)
    total += entry.isDirectory() ? await size(target) : (await stat(target)).size
  }
  return total
}
const bytes = await size(resolve(root, 'dist'))
if (bytes > 1024 * 1024) throw new Error(`Release 目录为 ${bytes} B，超过 1 MiB 限制。`)
console.log(`Release 检查通过：v${manifest.version}，${bytes} B，权限仅 storage。`)
