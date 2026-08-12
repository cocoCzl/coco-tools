import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { access } from 'node:fs/promises'

test('Manifest 仅申请偏好存储权限', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'))
  assert.deepEqual(manifest.permissions, ['storage'])
  assert.equal(manifest.content_scripts, undefined)
  assert.deepEqual(manifest.icons, { '16': 'icons/icon16.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' })
  await Promise.all(Object.values(manifest.icons).map((icon) => access(new URL(`../public/${icon}`, import.meta.url))))
})

test('工作台不持久化临时转换数据', async () => {
  const source = await readFile(new URL('../src/workbench/main.ts', import.meta.url), 'utf8')
  assert.match(source, /converter-toolbox-preferences/)
  assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*(?:input|output|history)/i)
})

test('工作台使用可控的自定义下拉菜单并校验空输入', async () => {
  const source = await readFile(new URL('../src/workbench/main.ts', import.meta.url), 'utf8')
  const style = await readFile(new URL('../src/workbench/interaction.css', import.meta.url), 'utf8')
  assert.match(source, /data-dropdown-toggle/)
  assert.match(source, /if \(!input\.value\.trim\(\)\)/)
  assert.match(source, /function setMenu/)
  assert.match(source, /option\.querySelector\('b'\)!\.textContent = selected \? '✓' : ''/)
  assert.match(source, /document\.addEventListener\('click'/)
  assert.doesNotMatch(source, /document\.onclick\s*=/)
  assert.match(style, /top:calc\(100% \+ 8px\)/)
  assert.match(style, /\.stamp-card/)
})

test('工作台为当前转换操作提供可访问的选中态', async () => {
  const source = await readFile(new URL('../src/workbench/main.ts', import.meta.url), 'utf8')
  const style = await readFile(new URL('../src/workbench/interaction.css', import.meta.url), 'utf8')
  assert.match(source, /selectedOperationByModule/)
  assert.match(source, /aria-pressed/)
  assert.match(source, /const selectOperation/)
  assert.match(source, /workerOperation/)
  assert.match(source, /INPUT_LIMIT_BYTES/)
  assert.doesNotMatch(source, /import \{[^}]*runOperation/)
  assert.match(style, /\[data-run\]\.is-selected/)
  assert.match(style, /\[data-theme="light"\] \.primary-actions>\[data-run\]\.is-selected/)
})
