import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
let context: BrowserContext
let page: Page
let profile = ''

test.beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), 'converter-toolbox-playwright-'))
  context = await chromium.launchPersistentContext(profile, {
    headless: false,
    executablePath: process.env.CHROME_EXECUTABLE,
    args: [
      `--disable-extensions-except=${resolve(root, 'dist')}`,
      `--load-extension=${resolve(root, 'dist')}`,
    ],
  })
  let worker = context.serviceWorkers()[0]
  if (!worker) worker = await context.waitForEvent('serviceworker')
  const extensionId = new URL(worker.url()).host
  page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/index.html`)
})
test.afterAll(async () => {
  await context?.close()
  await rm(profile, { recursive: true, force: true })
})
test.beforeEach(async () => {
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('workbench exposes only the six V1 modules and restores preferences', async () => {
  await expect(page.locator('[data-module]')).toHaveCount(6)
  await expect(page.locator('h1')).toHaveText('JSON 格式化')
  await page.locator('[data-action="toggle"]').click()
  await page.reload()
  await expect(page.locator('.app')).toHaveClass(/is-compact/)
  await page.evaluate(() => localStorage.setItem('converter-toolbox-preferences', '{broken'))
  await page.reload()
  await expect(page.locator('[data-module]')).toHaveCount(6)
  await expect(page.locator('h1')).toHaveText('JSON 格式化')
  await page.evaluate(() => localStorage.removeItem('converter-toolbox-preferences'))
})

test('text conversion keeps input on failure and supports local shortcuts', async () => {
  const input = page.locator('#input')
  const output = page.locator('#output')
  await input.fill('{"a": 1, "a": 2}')
  await page.getByRole('button', { name: '格式化', exact: true }).click()
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
  await page.getByRole('button', { name: '生成 Java', exact: true }).click()
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
  for (const [module, title] of [
    ['json-format', 'JSON 格式化'],
    ['json-escape', 'JSON 转义'],
    ['url', 'URL 参数'],
    ['java', 'Java 数据类'],
    ['yaml', 'JSON / YAML'],
    ['timestamp', '时间戳'],
  ] as const) {
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
  await page.getByRole('button', { name: '格式化', exact: true }).click()
  await expect(page.locator('#output')).toHaveValue(/"offline": true/)
  await context.setOffline(false)
  context.off('request', listener)
  expect(requests.filter((url) => !url.startsWith('chrome-extension://'))).toEqual([])
  const session = await context.newCDPSession(page)
  await session.send('Performance.enable')
  const metrics = (await session.send('Performance.getMetrics')) as {
    metrics: Array<{ name: string; value: number }>
  }
  const heap = metrics.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? Infinity
  expect(heap).toBeLessThan(30 * 1024 * 1024)
})

test('large tasks can be cancelled and an over-20-MiB import is rejected before reading', async () => {
  await page.locator('[data-module="json-format"]').click()
  await page.locator('#input').fill(`[${'0,'.repeat(1_000_000)}0]`)
  // Execute and cancel in one browser task: completion cannot race the driver's next click.
  const wasCancellable = await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('[data-run="format"]')!.click()
    const cancel = document.querySelector<HTMLButtonElement>('[data-action="cancel"]')!
    const visible = !cancel.hidden
    cancel.click()
    return visible
  })
  expect(wasCancellable).toBe(true)
  await expect(page.locator('#message')).toContainText('任务已取消')
  await expect(page.locator('#output')).toHaveValue('')
  await page.locator('#file-input').setInputFiles({
    name: 'large.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 0x20),
  })
  await expect(page.locator('#message')).toContainText('文件不能超过 20 MiB')
})

test.describe('state and lifecycle regressions', () => {
  const errors: string[] = []
  test.beforeEach(async () => {
    errors.length = 0
    page.on('pageerror', collectError)
  })
  const collectError = (error: Error) => errors.push(error.message)
  test.afterEach(async () => {
    page.off('pageerror', collectError)
    expect(errors).toEqual([])
  })

  async function fakeWorkers() {
    await page.evaluate(() => {
      const pending: Array<() => void> = []
      let live = 0
      class DelayedWorker {
        onmessage?: (event: { data: unknown }) => void
        closed = false
        constructor() {
          live += 1
        }
        postMessage(request: { id: number; input: string }) {
          pending.push(() =>
            this.onmessage?.({
              data: {
                id: request.id,
                ok: true,
                result: {
                  output: request.input,
                  fileName: 'result.json',
                  mimeType: 'application/json;charset=utf-8',
                },
              },
            }),
          )
        }
        terminate() {
          if (!this.closed) {
            live -= 1
            this.closed = true
          }
        }
      }
      Object.assign(window, {
        Worker: DelayedWorker,
        flushWorkers: () => pending.splice(0).forEach((fn) => fn()),
        liveWorkers: () => live,
      })
    })
  }
  async function flushWorkers() {
    await page.evaluate(() => (window as any).flushWorkers())
  }
  async function startTask(input = '{"old":1}') {
    await page.locator('#input').fill(input)
    await page.locator('[data-run="format"]').click()
    await expect(page.locator('[data-action="cancel"]')).toBeVisible()
  }

  test('collapse, repeat navigation, theme and module changes retain per-module memory; reload clears data', async () => {
    await page.locator('#input').fill('{"a":1}')
    await page.locator('[data-run="minify"]').click()
    await expect(page.locator('#output')).toHaveValue('{"a":1}')
    await page.locator('[data-action="toggle"]').click()
    await page.locator('[data-module="json-format"]').click()
    await expect(page.locator('#input')).toHaveValue('{"a":1}')
    await expect(page.locator('#output')).toHaveValue('{"a":1}')
    await page.locator('[data-dropdown-toggle="theme"]').click()
    await page.locator('[data-dropdown-option="theme"][data-value="light"]').click()
    await expect(page.locator('#output')).toHaveValue('{"a":1}')
    await page.locator('[data-module="json-escape"]').click()
    await page.locator('#ascii').check()
    await page.locator('#input').fill('中文')
    await page.locator('[data-run="escape"]').click()
    await expect(page.locator('#output')).toHaveValue('"\\u4e2d\\u6587"')
    await page.locator('[data-module="json-format"]').click()
    await expect(page.locator('#input')).toHaveValue('{"a":1}')
    await expect(page.locator('#output')).toHaveValue('{"a":1}')
    await expect(page.locator('[data-run="minify"]')).toHaveAttribute('aria-pressed', 'true')
    await page.locator('[data-module="json-escape"]').click()
    await expect(page.locator('#ascii')).toBeChecked()
    await expect(page.locator('#input')).toHaveValue('中文')
    await page.reload()
    await expect(page.locator('#input')).toHaveValue('')
    await expect(page.locator('#output')).toHaveValue('')
    const saved = await page.evaluate(() => JSON.stringify(localStorage))
    expect(saved).not.toContain('中文')
    expect(saved).not.toContain('"a":1')
  })

  test('clear, edit, module switching and cancellation invalidate delayed results; immediate retry succeeds', async () => {
    await fakeWorkers()
    await startTask()
    await page.locator('[data-run="format"]').dispatchEvent('click')
    expect(await page.evaluate(() => (window as any).liveWorkers())).toBe(1)
    await page.locator('[data-action="clear"]').click()
    const clearedMessage = await page.locator('#message').textContent()
    await flushWorkers()
    await expect(page.locator('#message')).toHaveText(clearedMessage!)
    await expect(page.locator('[data-run="format"]')).toBeEnabled()
    await expect(page.locator('[data-action="cancel"]')).toBeHidden()
    await expect(page.locator('[data-action="download"]')).toBeDisabled()
    await expect(page.locator('#input')).toHaveValue('')
    await expect(page.locator('#output')).toHaveValue('')
    await startTask()
    await page.locator('#input').fill('{"new":2}')
    const editedMessage = await page.locator('#message').textContent()
    await flushWorkers()
    await expect(page.locator('#message')).toHaveText(editedMessage!)
    await expect(page.locator('#output')).toHaveValue('')
    await expect(page.locator('[data-action="download"]')).toBeDisabled()
    await startTask()
    await page.locator('[data-module="yaml"]').click()
    const switchedMessage = await page.locator('#message').textContent()
    await flushWorkers()
    await expect(page.locator('#message')).toHaveText(switchedMessage!)
    await expect(page.locator('[data-run="json-yaml"]')).toBeEnabled()
    await expect(page.locator('[data-action="download"]')).toBeDisabled()
    await expect(page.locator('#output')).toHaveValue('')
    await page.locator('[data-module="json-format"]').click()
    await expect(page.locator('#input')).toHaveValue('{"old":1}')
    await startTask()
    await page.locator('[data-action="cancel"]').click()
    await page.locator('#input').fill('{"retry":3}')
    await page.locator('[data-run="format"]').click()
    await flushWorkers()
    await expect(page.locator('#output')).toHaveValue('{"retry":3}')
    await expect(page.locator('#message')).toContainText('转换完成')
    await expect(page.locator('[data-run="format"]')).toBeEnabled()
    await expect(page.locator('[data-action="cancel"]')).toBeHidden()
    expect(await page.evaluate(() => (window as any).liveWorkers())).toBe(0)
  })

  test('rejecting an oversized import invalidates older workers and reads; leaving a pending import clears its status', async () => {
    await fakeWorkers()
    await startTask()
    const large = {
      name: 'large.json',
      mimeType: 'application/json',
      buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
    }
    await page.locator('#file-input').setInputFiles(large)
    await flushWorkers()
    await expect(page.locator('#message')).toContainText('尚未读取')
    await expect(page.locator('#output')).toHaveValue('')
    await expect(page.locator('[data-action="download"]')).toBeDisabled()
    await expect(page.locator('[data-run="format"]')).toBeEnabled()
    expect(await page.evaluate(() => (window as any).liveWorkers())).toBe(0)
    await page.evaluate(() => {
      File.prototype.text = () =>
        new Promise((resolve) => {
          ;(window as any).finishFile = resolve
        })
    })
    const small = { name: 'late.json', mimeType: 'application/json', buffer: Buffer.from('{}') }
    await page.locator('#file-input').setInputFiles(small)
    await page.locator('#file-input').setInputFiles(large)
    await page.evaluate(() => (window as any).finishFile('late result'))
    await expect(page.locator('#input')).toHaveValue('{"old":1}')
    await expect(page.locator('#message')).toContainText('尚未读取')
    await page.locator('#file-input').setInputFiles(small)
    await page.locator('[data-module="yaml"]').click()
    await page.locator('[data-module="json-format"]').click()
    await expect(page.locator('#message')).toContainText('文件读取已取消')
    await page.evaluate(() => (window as any).finishFile('late result'))
    await expect(page.locator('#input')).toHaveValue('{"old":1}')
    await expect(page.locator('#message')).toContainText('文件读取已取消')
  })

  test('import cancels conversion, allows same-file retries, retains input on failure and checks size before reading', async () => {
    await fakeWorkers()
    await startTask()
    const file = {
      name: 'same.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"file":1}'),
    }
    await page.locator('#file-input').setInputFiles(file)
    await expect(page.locator('#input')).toHaveValue('{"file":1}')
    await flushWorkers()
    await expect(page.locator('#output')).toHaveValue('')
    await page.evaluate(() => {
      ;(window as any).fileReads = 0
      File.prototype.text = async () => {
        ;(window as any).fileReads++
        throw new Error('unreadable')
      }
    })
    for (let i = 0; i < 2; i++) {
      await page.locator('#file-input').setInputFiles(file)
      await expect(page.locator('#message')).toContainText('文件读取失败')
    }
    await expect(page.locator('#input')).toHaveValue('{"file":1}')
    expect(await page.evaluate(() => (window as any).fileReads)).toBe(2)
    await page
      .locator('#file-input')
      .setInputFiles({ ...file, buffer: Buffer.alloc(20 * 1024 * 1024 + 1) })
    await expect(page.locator('#message')).toContainText('尚未读取')
    expect(await page.evaluate(() => (window as any).fileReads)).toBe(2)
    expect(await page.locator('#file-input').inputValue()).toBe('')
  })

  test('late file reads cannot overwrite edits, clear or a different module', async () => {
    await page.evaluate(() => {
      File.prototype.text = () =>
        new Promise((resolve) => {
          ;(window as any).finishFile = resolve
        })
    })
    for (const action of ['edit', 'clear', 'switch']) {
      const file = { name: 'late.json', mimeType: 'application/json', buffer: Buffer.from('{}') }
      await page.locator('#file-input').setInputFiles(file)
      if (action === 'edit') await page.locator('#input').fill('new input')
      if (action === 'clear') await page.locator('[data-action="clear"]').click()
      if (action === 'switch') await page.locator('[data-module="yaml"]').click()
      await page.evaluate(() => (window as any).finishFile('late result'))
      await expect(page.locator('#input')).toHaveValue(action === 'edit' ? 'new input' : '')
    }
  })

  test('worker failure releases resources and allows retry; page closing terminates a running worker', async () => {
    await page.evaluate(() => {
      let live = 0
      class FailingWorker {
        onerror?: () => void
        constructor() {
          live++
        }
        postMessage() {
          queueMicrotask(() => this.onerror?.())
        }
        terminate() {
          live--
        }
      }
      Object.assign(window, { Worker: FailingWorker, liveWorkers: () => live })
    })
    await page.locator('#input').fill('{}')
    await page.locator('[data-run="format"]').click()
    await expect(page.locator('#message')).toContainText('后台任务执行失败')
    expect(await page.evaluate(() => (window as any).liveWorkers())).toBe(0)
    await fakeWorkers()
    await startTask()
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
    expect(await page.evaluate(() => (window as any).liveWorkers())).toBe(0)
  })

  test('download name and MIME follow actual result; use-result and edits invalidate old downloads', async () => {
    await page.locator('[data-module="yaml"]').click()
    expect(await page.locator('#file-input').getAttribute('accept')).toContain('.json')
    await page.locator('#input').fill('id: 9007199254740993')
    await page.locator('[data-run="yaml-json"]').click()
    await expect(page.locator('#output')).toHaveValue(/9007199254740993/)
    await page.evaluate(() => {
      const create = URL.createObjectURL.bind(URL)
      URL.createObjectURL = (blob: Blob | MediaSource) => {
        ;(window as any).downloadMime = (blob as Blob).type
        return create(blob)
      }
    })
    const downloaded = page.waitForEvent('download')
    await page.locator('[data-action="download"]').click()
    expect((await downloaded).suggestedFilename()).toBe('result.json')
    expect(await page.evaluate(() => (window as any).downloadMime)).toBe(
      'application/json;charset=utf-8',
    )
    await page.locator('[data-action="use-result"]').click()
    await expect(page.locator('#input')).toHaveValue(/"id": 9007199254740993/)
    await expect(page.locator('#output')).toHaveValue('')
    await page.locator('[data-run="json-yaml"]').click()
    await expect(page.locator('#output')).toHaveValue('id: 9007199254740993\n')
    const yamlDownload = page.waitForEvent('download')
    await page.locator('[data-action="download"]').click()
    expect((await yamlDownload).suggestedFilename()).toBe('result.yaml')
    expect(await page.evaluate(() => (window as any).downloadMime)).toBe(
      'application/yaml;charset=utf-8',
    )
    await page.locator('#input').fill('{}')
    await expect(page.locator('[data-action="download"]')).toBeDisabled()
    await expect(page.locator('[data-action="copy-output"]')).toBeDisabled()
  })

  test('clipboard/storage failures retain data and preferences cannot inject markup', async () => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error('denied')
          },
        },
      })
      Storage.prototype.setItem = () => {
        throw new Error('quota')
      }
    })
    await page.locator('#input').fill('{"keep":true}')
    await page.locator('[data-run="format"]').click()
    await expect(page.locator('#output')).toHaveValue(/"keep": true/)
    await page.locator('[data-action="copy-output"]').click()
    await expect(page.locator('#message')).toContainText('复制失败')
    await expect(page.locator('#input')).toHaveValue('{"keep":true}')
    await expect(page.locator('#output')).toHaveValue(/"keep": true/)
    await page.locator('[data-action="toggle"]').click()
    await expect(page.locator('#preference-status')).toContainText('偏好保存失败')
    await expect(page.locator('#output')).toHaveValue(/"keep": true/)
    await page.reload()
    await page.evaluate(() =>
      localStorage.setItem(
        'converter-toolbox-preferences',
        JSON.stringify({
          theme: 'dark',
          indent: '2',
          java: {
            rootClassName: '\"><img id="injected" src=x>',
            packageName: '\"><b id="injected2">bad',
          },
        }),
      ),
    )
    await page.reload()
    await page.locator('[data-module="java"]').click()
    await expect(page.locator('#class-name')).toHaveValue('\"><img id="injected" src=x>')
    await expect(page.locator('#injected, #injected2')).toHaveCount(0)
  })

  test('error locations, find, shortcuts and custom dropdown keyboard navigation work', async () => {
    await page.locator('#input').fill('{\n "a":1,\n "a":2\n}')
    await page.locator('[data-run="format"]').click()
    await expect(page.locator('#message')).toContainText('重复')
    await page.locator('#message').click()
    expect(
      await page.locator('#input').evaluate((input: HTMLTextAreaElement) => input.selectionStart),
    ).toBe(11)
    await page.locator('#input').press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f')
    await expect(page.locator('#find-input')).toBeFocused()
    await expect(page.locator('[data-action="toggle-find"]')).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await page.locator('#find-input').fill('"a"')
    await page.locator('[data-action="find"]').click()
    expect(
      await page
        .locator('#input')
        .evaluate((input: HTMLTextAreaElement) =>
          input.value.slice(input.selectionStart, input.selectionEnd),
        ),
    ).toBe('"a"')
    await page.locator('#find-input').focus()
    await page.keyboard.press('Escape')
    await expect(page.locator('#find-tools')).toBeHidden()
    await expect(page.locator('#input')).toBeFocused()
    const trigger = page.locator('[data-dropdown-toggle="indent"]')
    await trigger.focus()
    await trigger.press('ArrowDown')
    await expect(page.locator('[data-dropdown-option="indent"][data-value="2"]')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(trigger).toContainText('4 空格')
    await expect(trigger).toBeFocused()
    await page.locator('#input').fill('{"a":1}')
    await page
      .locator('#input')
      .press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
    await expect(page.locator('#output')).toHaveValue('{\n    "a": 1\n}')
    await page.locator('#input').fill('\n')
    await page.locator('#input').evaluate((input: HTMLTextAreaElement) => {
      input.setSelectionRange(0, 0)
      input.dispatchEvent(new Event('select'))
    })
    await expect(page.locator('#cursor-position')).toHaveText('第 1 行，第 1 列')
  })

  test('timestamp visibility only pauses clock, preserving forms and exactly one set of listeners', async () => {
    await page.evaluate(() => {
      const intervals = new Set<number>()
      const setInterval = window.setInterval.bind(window)
      const clearInterval = window.clearInterval.bind(window)
      window.setInterval = ((...args: Parameters<typeof window.setInterval>) => {
        const id = setInterval(...args)
        intervals.add(id)
        return id
      }) as typeof window.setInterval
      window.clearInterval = (id?: number) => {
        if (id !== undefined) intervals.delete(id)
        clearInterval(id)
      }
      Object.assign(window, { intervalCount: () => intervals.size })
    })
    await page.locator('[data-module="timestamp"]').click()
    await page.locator('#timestamp-unit').selectOption('milliseconds')
    await page.locator('#timestamp-input').fill('0')
    await page.locator('#time-zone').selectOption('utc')
    await page.locator('#date-input').fill('2024-06-01')
    await page.locator('#time-input').fill('12:34:56.789')
    const expectedMilliseconds = String(Date.parse('2024-06-01T12:34:56.789Z'))
    await expect(page.locator('#milliseconds-result')).toHaveText(expectedMilliseconds)
    await page.evaluate(() => {
      ;(window as any).copyCount = 0
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            ;(window as any).copyCount++
          },
        },
      })
      for (let i = 0; i < 5; i++) {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true })
        document.dispatchEvent(new Event('visibilitychange'))
        Object.defineProperty(document, 'hidden', { configurable: true, value: false })
        document.dispatchEvent(new Event('visibilitychange'))
      }
    })
    expect(await page.evaluate(() => (window as any).intervalCount())).toBe(1)
    await expect(page.locator('#date-input')).toHaveValue('2024-06-01')
    await expect(page.locator('#time-input')).toHaveValue('12:34:56.789')
    await expect(page.locator('#timestamp-input')).toHaveValue('0')
    await expect(page.locator('#date-result')).toContainText('1970-01-01T00:00:00.000Z')
    await page.locator('[data-copy="milliseconds-result"]').click()
    expect(await page.evaluate(() => (window as any).copyCount)).toBe(1)
    await page.locator('[data-module="json-format"]').click()
    expect(await page.evaluate(() => (window as any).intervalCount())).toBe(0)
    await page.locator('[data-module="timestamp"]').click()
    expect(await page.evaluate(() => (window as any).intervalCount())).toBe(1)
    await expect(page.locator('#milliseconds-result')).toHaveText(expectedMilliseconds)
    await expect(page.locator('#timestamp-unit')).toHaveValue('milliseconds')
  })
})

test('all six modules work offline without external conversion requests', async () => {
  await page.reload()
  const requests: string[] = []
  const listener = (request: { url(): string }) => requests.push(request.url())
  context.on('request', listener)
  await context.setOffline(true)
  try {
    for (const [module, operation, input, expected] of [
      ['json-format', 'format', '{"id":9007199254740993}', /9007199254740993/],
      ['json-escape', 'escape', 'text', /"text"/],
      ['url', 'query', '__proto__=abc&constructor=x&toString=y', /"__proto__": "abc"/],
      ['java', 'java', '{"string":{"x":1},"s":"abc"}', /private String s;/],
      ['yaml', 'yaml-json', 'ids: [9007199254740993]', /9007199254740993/],
    ] as const) {
      await page.locator(`[data-module="${module}"]`).click()
      await page.locator('#input').fill(input)
      await page.locator(`[data-run="${operation}"]`).click()
      await expect(page.locator('#output')).toHaveValue(expected)
    }
    await page.locator('[data-module="timestamp"]').click()
    await page.locator('#timestamp-unit').selectOption('seconds')
    await page.locator('#time-zone').selectOption('utc')
    await page.locator('#timestamp-input').fill('-1')
    await expect(page.locator('#date-result')).toContainText('1969')
    expect(requests.filter((url) => !url.startsWith('chrome-extension://'))).toEqual([])
  } finally {
    await context.setOffline(false)
    context.off('request', listener)
  }
})

test('text and timestamp controls remain usable in both themes and narrow layouts', async () => {
  await page.reload()
  for (const [module, width, theme] of [
    ['java', 1440, 'dark'],
    ['yaml', 900, 'light'],
    ['timestamp', 900, 'light'],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 })
    await page.locator(`[data-module="${module}"]`).click()
    await page.locator('[data-dropdown-toggle="theme"]').click()
    await page.locator(`[data-dropdown-option="theme"][data-value="${theme}"]`).click()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.screenshot({
      path: `test-results/qa-${module}-${theme}-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  }
  await page.setViewportSize({ width: 1280, height: 900 })
})

test('YAML errors show the complete reason and long messages remain readable by scrolling', async () => {
  try {
    await page.locator('[data-module="yaml"]').click()
    for (const width of [1280, 640]) {
      await page.setViewportSize({ width, height: 720 })
      for (const operation of ['yaml-json', 'yaml-format']) {
        const key = `错误原因${'很长的字段'.repeat(1000)}末尾标记`
        await page.locator('#input').fill(`${key}: 1\n${key}: 2`)
        await page.locator(`[data-run="${operation}"]`).click()
        await expect(page.locator('#message')).toHaveAttribute('data-status', 'error')
        await expect(page.locator('#message span:last-child')).toHaveText(
          `第 2 行，第 1 列：重复键“${key}”不受支持。`,
        )
        const bounds = await page.locator('#message').evaluate((message) => {
          const r = message.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(message.lastElementChild!)
          return {
            allLinesInside: [...range.getClientRects()].every(
              (line) =>
                line.left >= r.left && line.right <= r.right + 1 && line.bottom <= r.bottom + 1,
            ),
            messageHeight: r.height,
            editorsBelow:
              document.querySelector('.editors')!.getBoundingClientRect().top >= r.bottom,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          }
        })
        expect(bounds.allLinesInside).toBe(true)
        expect(bounds.messageHeight).toBeGreaterThan(720)
        expect(bounds.editorsBelow).toBe(true)
        expect(bounds.horizontalOverflow).toBe(false)
        const tailVisible = await page.locator('#message span:last-child').evaluate((text) => {
          const node = text.firstChild!
          const range = document.createRange()
          range.setStart(node, node.textContent!.length - 6)
          range.setEnd(node, node.textContent!.length)
          const bottom = range.getBoundingClientRect().bottom + scrollY
          scrollTo(0, bottom - innerHeight + 40)
          const r = range.getBoundingClientRect()
          return (
            r.top >= 0 &&
            r.bottom <= innerHeight &&
            text.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
          )
        })
        expect(tailVisible).toBe(true)
        await page.screenshot({
          path: `test-results/yaml-long-error-${operation}-${width}.png`,
          animations: 'disabled',
        })
        await page.locator('[data-action="locate-error"]').click()
        await expect(page.locator('#input')).toBeFocused()
      }
    }
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 })
  }
})

const layoutModules = ['json-format', 'json-escape', 'url', 'java', 'yaml', 'timestamp'] as const

for (const [width, height] of [
  [1440, 900],
  [1366, 768],
  [1280, 720],
]) {
  test(`desktop ${width}×${height}: six modules fit with usable editors across themes`, async () => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width, height })
    for (const theme of ['light', 'dark', 'system']) {
      await page.emulateMedia({ colorScheme: 'light' })
      await page.locator('[data-dropdown-toggle="theme"]').click()
      await page.locator(`[data-dropdown-option="theme"][data-value="${theme}"]`).click()
      for (const module of layoutModules) {
        await page.locator(`[data-module="${module}"]`).click()
        if (module !== 'timestamp') {
          await expect(page.locator('#message')).toHaveAttribute('data-status', 'idle')
          await expect(page.locator('#message')).toContainText('就绪')
          await page.locator('[data-action="toggle-find"]').click()
          await expect(page.locator('#find-input')).toBeVisible()
        }
        const layout = await page.evaluate(() => ({
          width: innerWidth,
          height: innerHeight,
          pageWidth: document.documentElement.scrollWidth,
          pageHeight: document.documentElement.scrollHeight,
          editors: [...document.querySelectorAll<HTMLElement>('.editor-card')].map((card) => {
            const rect = card.getBoundingClientRect()
            const textarea = card.querySelector('textarea')!
            return { bottom: rect.bottom, height: textarea.clientHeight }
          }),
        }))
        expect(layout.pageWidth).toBeLessThanOrEqual(layout.width)
        expect(layout.pageHeight).toBeLessThanOrEqual(layout.height)
        for (const editor of layout.editors) {
          expect(editor.bottom).toBeLessThanOrEqual(layout.height)
          expect(editor.height).toBeGreaterThan(160)
        }
        if (width === 1280) {
          await page.screenshot({
            path: `test-results/layout-${module}-${theme}-${width}.png`,
            animations: 'disabled',
          })
        }
        if (module !== 'timestamp') await page.locator('[data-action="close-find"]').click()
      }
    }
    // System mode responds to the browser's color preference without rerendering content.
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
      .toBe('light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
      .toBe('dark')
    await page.emulateMedia({ colorScheme: null })
  })
}

test('long text scrolls inside editors; find and long errors remain reachable without losing sessions', async () => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const source = JSON.stringify(
    Array.from({ length: 200 }, (_, id) => ({ id, name: 'toolbox' })),
    null,
    2,
  )
  await page.locator('#input').fill(source)
  await page.locator('#input').press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
  await expect(page.locator('#output')).toHaveValue(source)
  const result = await page.evaluate(() => {
    const input = document.querySelector<HTMLTextAreaElement>('#input')!
    const output = document.querySelector<HTMLTextAreaElement>('#output')!
    input.scrollTop = input.scrollHeight
    output.scrollTop = output.scrollHeight
    return {
      inputScroll: input.scrollTop,
      outputScroll: output.scrollTop,
      pageHeight: document.documentElement.scrollHeight,
      height: innerHeight,
    }
  })
  expect(result.inputScroll).toBeGreaterThan(0)
  expect(result.outputScroll).toBeGreaterThan(0)
  expect(result.pageHeight).toBeLessThanOrEqual(result.height)
  await page.locator('[data-action="toggle"]').click()
  await page.locator('[data-dropdown-toggle="theme"]').click()
  await page.locator('[data-dropdown-option="theme"][data-value="light"]').click()
  await page.locator('[data-module="java"]').click()
  await page.locator('[data-module="json-format"]').click()
  await expect(page.locator('#input')).toHaveValue(source)
  await expect(page.locator('#output')).toHaveValue(source)
  await page.locator('[data-action="toggle-find"]').click()
  await page.locator('#find-input').fill('toolbox')
  await page.locator('#find-input').press('Enter')
  expect(
    await page
      .locator('#input')
      .evaluate((input: HTMLTextAreaElement) =>
        input.value.slice(input.selectionStart, input.selectionEnd),
      ),
  ).toBe('toolbox')
  const key = '很长的重复字段'.repeat(40)
  await page.locator('#input').fill(`{"${key}":1,"${key}":2}`)
  await page.locator('[data-run="format"]').click()
  await expect(page.locator('#message')).toHaveAttribute('data-status', 'error')
  await expect(page.locator('[data-action="locate-error"]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('[data-action="locate-error"]').click()
  await expect(page.locator('#input')).toBeFocused()
})

test('narrow, short and real 200% browser zoom allow scrolling to every visible control', async () => {
  test.setTimeout(90_000)
  const cdp = await context.newCDPSession(page)
  const captureViewport = async (path: string) => {
    // Native zoom makes Playwright's CSS-coordinate clipping inaccurate after scrolling.
    const { data } = await cdp.send('Page.captureScreenshot', {
      fromSurface: true,
      captureBeyondViewport: false,
    })
    await writeFile(path, Buffer.from(data, 'base64'))
  }
  const zoom = async (factor: number) =>
    page.evaluate(async (factor) => {
      const tabs = (globalThis as any).chrome.tabs
      const tab = await tabs.getCurrent()
      await tabs.setZoom(tab.id, factor)
      return tabs.getZoom(tab.id)
    }, factor)
  try {
    for (const mode of ['narrow', 'short', 'zoom']) {
      await zoom(1)
      await page.setViewportSize(
        mode === 'narrow'
          ? { width: 640, height: 800 }
          : mode === 'short'
            ? { width: 1280, height: 500 }
            : { width: 1366, height: 768 },
      )
      if (mode === 'zoom') {
        const before = await page.evaluate(() => innerWidth)
        expect(await zoom(2)).toBe(2)
        await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(before)
      }
      for (const module of layoutModules) {
        await page.locator(`[data-module="${module}"]`).click()
        if (module !== 'timestamp') await page.locator('[data-action="toggle-find"]').click()
        if (module === 'java') {
          await page.locator('#class-name').fill('LongResponseClassName')
          await page.locator('#package-name').fill('com.example.long.package.name')
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        const controls = page.locator(
          'button:visible, input:visible, select:visible, textarea:visible',
        )
        for (let i = 0; i < (await controls.count()); i++) {
          await controls.nth(i).scrollIntoViewIfNeeded()
          await expect(controls.nth(i)).toBeInViewport()
          const visible = await controls.nth(i).evaluate((element) => {
            const r = element.getBoundingClientRect()
            const x = Math.max(0, Math.min(innerWidth - 1, r.x + r.width / 2))
            const y = Math.max(0, Math.min(innerHeight - 1, r.y + r.height / 2))
            const hit = document.elementFromPoint(x, y)
            return (
              r.width > 0 &&
              r.left >= 0 &&
              r.right <= innerWidth &&
              !!hit &&
              (element.contains(hit) || hit.contains(element))
            )
          })
          expect(visible).toBe(true)
        }
        await page.evaluate(() => scrollTo(0, 0))
        if (mode === 'zoom') {
          await captureViewport(`test-results/layout-${module}-zoom.png`)
          await page
            .locator(module === 'timestamp' ? '.timestamp footer' : '.editor-footer')
            .last()
            .scrollIntoViewIfNeeded()
          await captureViewport(`test-results/layout-${module}-zoom-bottom.png`)
        } else {
          await page.screenshot({
            path: `test-results/layout-${module}-${mode}.png`,
            fullPage: true,
            animations: 'disabled',
          })
        }
        if (module !== 'timestamp') await page.locator('[data-action="close-find"]').click()
      }
    }
  } finally {
    await cdp.detach()
    await zoom(1)
    await page.setViewportSize({ width: 1280, height: 900 })
  }
})
