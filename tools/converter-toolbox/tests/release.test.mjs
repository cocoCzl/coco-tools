import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { access } from 'node:fs/promises'

test('Manifest 仅申请偏好存储权限', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'),
  )
  assert.deepEqual(manifest.permissions, ['storage'])
  assert.equal(manifest.content_scripts, undefined)
  assert.deepEqual(manifest.icons, {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  })
  await Promise.all(
    Object.values(manifest.icons).map((icon) =>
      access(new URL(`../public/${icon}`, import.meta.url)),
    ),
  )
})
