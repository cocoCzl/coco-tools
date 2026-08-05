import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(await readFile(resolve(root, 'dist/manifest.json'), 'utf8'))
const permissions = manifest.permissions ?? []
for (const permission of ['clipboardRead', 'activeTab', 'tabs', 'scripting']) {
  if (permissions.includes(permission)) throw new Error(`Release Manifest 不得申请 ${permission} 权限。`)
}
if (manifest.content_scripts) throw new Error('Release Manifest 不得包含内容脚本。')
async function size(directory) { let total = 0; for (const entry of await readdir(directory, { withFileTypes: true })) { const target = resolve(directory, entry.name); total += entry.isDirectory() ? await size(target) : (await stat(target)).size } return total }
const bytes = await size(resolve(root, 'dist'))
if (bytes > 1024 * 1024) throw new Error(`Release 目录为 ${bytes} B，超过 1 MB 限制。`)
console.log(`Release 检查通过：${bytes} B，权限最小化。`)
