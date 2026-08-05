import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
let context: BrowserContext
let page: Page
let profile = ''

test.beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), 'converter-toolbox-playwright-'))
  context = await chromium.launchPersistentContext(profile, { headless: false, executablePath: process.env.CHROME_EXECUTABLE, args: [`--disable-extensions-except=${resolve(root, 'dist')}`, `--load-extension=${resolve(root, 'dist')}`] })
  let worker = context.serviceWorkers()[0]
  if (!worker) worker = await context.waitForEvent('serviceworker')
  const extensionId = new URL(worker.url()).host
  page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/index.html`)
})
test.afterAll(async () => { await context?.close(); await rm(profile, { recursive: true, force: true }) })

test('workbench exposes only the six V1 modules and restores preferences', async () => {
  await expect(page.locator('[data-module]')).toHaveCount(6)
  await expect(page.locator('h1')).toHaveText('JSON 格式化')
  await page.locator('[data-action="toggle"]').click()
  await page.reload()
  await expect(page.locator('.app')).toHaveClass(/is-compact/)
})

test('text conversion keeps input on failure and supports local shortcuts', async () => {
  const input = page.locator('#input'); const output = page.locator('#output')
  await input.fill('{"a": 1, "a": 2}')
  await page.getByRole('button', { name: '格式化' }).click()
  await expect(output).toHaveValue('')
  await expect(page.locator('#message')).toContainText('重复')
  await input.fill('{"a":1}')
  await input.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
  await expect(output).toHaveValue(/"a": 1/)
})

test('Java settings persist and generator uses requested download name', async () => {
  await page.locator('[data-module="java"]').click()
  await page.locator('#class-name').fill('payload')
  await page.locator('#package-name').fill('com.example')
  await page.locator('#jackson').uncheck()
  await page.locator('#input').fill('{"id":1}')
  await page.getByRole('button', { name: '生成 Java' }).click()
  await expect(page.locator('#output')).toHaveValue(/public class Payload/)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载' }).click()
  expect((await download).suggestedFilename()).toBe('Payload.java')
  await page.reload()
  await page.locator('[data-module="java"]').click()
  await expect(page.locator('#class-name')).toHaveValue('payload')
  await expect(page.locator('#package-name')).toHaveValue('com.example')
})

test('six modules, timestamp conversion, offline boundary and idle heap meet release expectations', async () => {
  const requests: string[] = []
  const listener = (request: { url(): string }) => requests.push(request.url())
  context.on('request', listener)
  for (const [module, title] of [['json-format', 'JSON 格式化'], ['json-escape', 'JSON 转义'], ['url', 'URL 参数'], ['java', 'Java 数据类'], ['yaml', 'JSON / YAML'], ['timestamp', '时间戳']] as const) {
    await page.locator(`[data-module="${module}"]`).click()
    await expect(page.locator('h1')).toHaveText(title)
  }
  await page.locator('#timestamp-input').fill('1717228800')
  await expect(page.locator('#date-result')).not.toContainText('请输入')
  await page.locator('#date-input').fill('2024-06-01')
  await page.locator('#time-input').fill('12:00:00')
  await expect(page.locator('#seconds-result')).not.toHaveText('—')
  await context.setOffline(true)
  await page.locator('[data-module="json-format"]').click()
  await page.locator('#input').fill('{"offline":true}')
  await page.getByRole('button', { name: '格式化' }).click()
  await expect(page.locator('#output')).toHaveValue(/"offline": true/)
  await context.setOffline(false)
  context.off('request', listener)
  expect(requests.filter((url) => !url.startsWith('chrome-extension://'))).toEqual([])
  const session = await context.newCDPSession(page)
  await session.send('Performance.enable')
  const metrics = await session.send('Performance.getMetrics') as { metrics: Array<{ name: string; value: number }> }
  const heap = metrics.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? Infinity
  expect(heap).toBeLessThan(30 * 1024 * 1024)
})

test('large tasks can be cancelled and an over-20-MB import requires confirmation', async () => {
  await page.locator('[data-module="json-format"]').click()
  await page.locator('#input').fill(`[${'0,'.repeat(1_000_000)}0]`)
  await page.getByRole('button', { name: '格式化' }).click()
  const cancel = page.getByRole('button', { name: '取消任务' })
  await expect(cancel).toBeVisible()
  await cancel.click()
  await expect(page.locator('#message')).toContainText('任务已取消')
  await expect(page.locator('#output')).toHaveValue('')
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('20 MB'); await dialog.dismiss() })
  await page.locator('#file-input').setInputFiles({ name: 'large.json', mimeType: 'application/json', buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 0x20) })
})
