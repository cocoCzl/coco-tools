import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')
const limit = 1024 * 1024

async function directorySize(directory) {
  let total = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    total += entry.isDirectory() ? await directorySize(path) : (await stat(path)).size
  }
  return total
}

const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.json'), 'utf8'))
const forbidden = ['host_permissions', 'content_scripts']
for (const key of forbidden) {
  if (key in manifest) throw new Error(`Manifest must not contain ${key}`)
}
if ((manifest.permissions ?? []).includes('clipboardRead')) {
  throw new Error('Manifest must not request clipboardRead')
}

const bytes = await directorySize(dist)
if (bytes > limit) {
  throw new Error(`Release directory is ${(bytes / 1024).toFixed(1)} KiB; limit is 1024 KiB`)
}
console.log(`Release check passed: ${(bytes / 1024).toFixed(1)} KiB`)
