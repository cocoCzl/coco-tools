import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('keeps the workbench landing copy concise and free of decorative numbering', async () => {
  const html = await readFile(new URL('src/workbench/index.html', root), 'utf8')
  const css = await readFile(new URL('src/workbench/style.css', root), 'utf8')
  assert.match(html, /<h1 id="page-title">JSON，留在本地处理<\/h1>/)
  assert.match(html, /内容仅在浏览器本地处理，无需上传。/)
  assert.doesNotMatch(html, /DEVELOPER UTILITY|MODULE\s*\/|>0[1-4]</)
  assert.doesNotMatch(html, /<small>(?:FORMAT|ESCAPE|QUERY|CLASS)<\/small>/)
  assert.match(css, /\.workspace-intro\s*\{[^}]*margin-bottom:\s*24px/s)
  assert.match(css, /\.tool-tab\s*\{[^}]*place-items:\s*center/s)
})

test('does not let the top bar cover the workbench while scrolling', async () => {
  const css = await readFile(new URL('src/workbench/style.css', root), 'utf8')
  const topbarRule = css.match(/\.topbar\s*\{([^}]*)\}/s)?.[1] ?? ''
  assert.doesNotMatch(topbarRule, /position:\s*sticky/)
  assert.doesNotMatch(topbarRule, /position:\s*fixed/)
})

test('keeps the extension permission surface minimal', async () => {
  const manifest = JSON.parse(await readFile(new URL('public/manifest.json', root), 'utf8')) as Record<string, unknown>
  assert.deepEqual(manifest.permissions, ['storage'])
  assert.equal('host_permissions' in manifest, false)
  assert.equal('content_scripts' in manifest, false)
  assert.equal((manifest.action as Record<string, unknown>).default_popup, undefined)
})
