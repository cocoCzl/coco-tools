import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('keeps the headline ending together and within the wide layout', async () => {
  const html = await readFile(new URL('src/workbench/index.html', root), 'utf8')
  const css = await readFile(new URL('src/workbench/style.css', root), 'utf8')
  assert.match(html, /让 JSON 留在你的<span class="headline-keep">浏览器里<\/span>/)
  assert.match(css, /\.headline-keep\s*\{[^}]*white-space:\s*nowrap/s)
  assert.match(css, /\.workspace-intro h1\s*\{[^}]*max-width:\s*940px/s)
  assert.match(css, /font-size:\s*clamp\(38px,\s*4vw,\s*58px\)/)
})

test('keeps the extension permission surface minimal', async () => {
  const manifest = JSON.parse(await readFile(new URL('public/manifest.json', root), 'utf8')) as Record<string, unknown>
  assert.deepEqual(manifest.permissions, ['storage'])
  assert.equal('host_permissions' in manifest, false)
  assert.equal('content_scripts' in manifest, false)
  assert.equal((manifest.action as Record<string, unknown>).default_popup, undefined)
})
