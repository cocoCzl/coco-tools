import { execFile } from 'node:child_process'
import { mkdir, rm, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import { resolve } from 'node:path'

const run = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const release = resolve(root, 'release')
const name = 'converter-toolbox-v1.0.0.zip'
await mkdir(release, { recursive: true })
await rm(resolve(release, name), { force: true })
await run('zip', ['-rq', resolve(release, name), '.'], { cwd: resolve(root, 'dist') })
const size = (await stat(resolve(release, name))).size
if (size > 1024 * 1024) throw new Error(`Release 压缩包为 ${size} B，超过 1 MB 限制。`)
console.log(`Release 安装包已生成：release/${name}（${size} B）`)
